import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaClient, RoomStatus } from '@vector-racers/db';
import { randomInt, randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service';
import type { CreateRoomDto } from './dto/create-room.dto';
import type { JoinRoomDto } from './dto/join-room.dto';
import type { PublicRoomsQueryDto } from './dto/public-rooms-query.dto';
import type { RoomPlayerSnapshot, RoomRedisSnapshot } from './room-redis.types';
import { RoomSyncService } from './room-sync.service';

const ROOM_HASH_PAYLOAD = 'payload';
const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_CODE_ATTEMPTS = 48;

const ACTIVE_STATUSES: RoomStatus[] = [RoomStatus.WAITING, RoomStatus.RACING];

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += CODE_CHARS[randomInt(0, CODE_CHARS.length)]!;
  }
  return code;
}

export type RoomPlayerView = RoomPlayerSnapshot & { username: string };

export type RoomDetailView = {
  id: string;
  code: string;
  status: RoomStatus;
  trackId: string;
  maxPlayers: number;
  createdAt: string;
  track: {
    id: string;
    slug: string;
    name: string;
    previewUrl: string;
  };
  players: RoomPlayerView[];
};

export type PublicRoomItemView = {
  id: string;
  code: string;
  status: RoomStatus;
  trackId: string;
  maxPlayers: number;
  createdAt: string;
  playerCount: number;
  track: {
    id: string;
    slug: string;
    name: string;
    previewUrl: string;
  };
};

@Injectable()
export class RoomsService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisService: RedisService,
    private readonly roomSync: RoomSyncService,
  ) {}

  private get redis() {
    return this.redisService.redis;
  }

  async create(userId: string, dto: CreateRoomDto): Promise<RoomDetailView> {
    const [track, car] = await Promise.all([
      this.prisma.track.findUnique({ where: { id: dto.trackId } }),
      this.prisma.car.findUnique({ where: { id: dto.carId } }),
    ]);
    if (!track) {
      throw new NotFoundException('Track not found');
    }
    if (!car) {
      throw new NotFoundException('Car not found');
    }

    await this.assertUserNotInActiveRoom(userId);

    const roomId = randomUUID();
    const createdAt = new Date().toISOString();

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode();
      const [dbHit, redisHit] = await Promise.all([
        this.prisma.room.findUnique({ where: { code }, select: { id: true } }),
        this.redis.get(`room:code:${code}`),
      ]);
      if (dbHit || redisHit) {
        continue;
      }

      const snapshot: RoomRedisSnapshot = {
        id: roomId,
        code,
        status: RoomStatus.WAITING,
        trackId: dto.trackId,
        maxPlayers: dto.maxPlayers,
        createdAt,
        players: [
          {
            userId,
            carId: dto.carId,
            position: 0,
            laps: 0,
            isReady: false,
          },
        ],
      };

      await this.writeSnapshot(snapshot);
      this.roomSync.schedulePersist(roomId);
      return this.snapshotToDetailView(snapshot);
    }

    throw new ConflictException('Could not allocate a unique room code');
  }

  async join(userId: string, dto: JoinRoomDto): Promise<RoomDetailView> {
    const car = await this.prisma.car.findUnique({ where: { id: dto.carId } });
    if (!car) {
      throw new NotFoundException('Car not found');
    }

    let roomId = await this.redis.get(`room:code:${dto.code}`);
    if (!roomId) {
      const row = await this.prisma.room.findUnique({
        where: { code: dto.code },
        select: { id: true },
      });
      roomId = row?.id ?? null;
    }
    if (!roomId) {
      throw new NotFoundException('Room not found');
    }

    let snapshot = await this.loadSnapshot(roomId);
    if (!snapshot) {
      throw new NotFoundException('Room not found');
    }

    const already = snapshot.players.some((p) => p.userId === userId);
    if (already) {
      return this.snapshotToDetailView(snapshot);
    }

    if (snapshot.status !== RoomStatus.WAITING) {
      throw new ConflictException('Room is not accepting players');
    }

    if (snapshot.players.length >= snapshot.maxPlayers) {
      throw new ConflictException('Room is full');
    }

    await this.assertUserNotInActiveRoom(userId, roomId);

    const nextPosition = snapshot.players.reduce(
      (m, p) => Math.max(m, p.position),
      -1,
    );
    snapshot = {
      ...snapshot,
      players: [
        ...snapshot.players,
        {
          userId,
          carId: dto.carId,
          position: nextPosition + 1,
          laps: 0,
          isReady: false,
        },
      ],
    };

    await this.writeSnapshot(snapshot);
    this.roomSync.schedulePersist(roomId);
    return this.snapshotToDetailView(snapshot);
  }

  async findOne(roomId: string): Promise<RoomDetailView> {
    const snapshot = await this.loadSnapshot(roomId);
    if (!snapshot) {
      throw new NotFoundException('Room not found');
    }
    return this.snapshotToDetailView(snapshot);
  }

  /**
   * Redis-first room snapshot for realtime game layer (TASK-010).
   */
  async loadRoomSnapshot(roomId: string): Promise<RoomRedisSnapshot | null> {
    return this.loadSnapshot(roomId);
  }

  async assertUserInRoom(roomId: string, userId: string): Promise<void> {
    const snapshot = await this.loadSnapshot(roomId);
    if (!snapshot) {
      throw new NotFoundException('Room not found');
    }
    if (!snapshot.players.some((p) => p.userId === userId)) {
      throw new ForbiddenException('Not a room member');
    }
  }

  async markPlayerReady(roomId: string, userId: string): Promise<RoomRedisSnapshot> {
    const snapshot = await this.loadSnapshot(roomId);
    if (!snapshot) {
      throw new NotFoundException('Room not found');
    }
    const idx = snapshot.players.findIndex((p) => p.userId === userId);
    if (idx === -1) {
      throw new ForbiddenException('Not a room member');
    }
    const next: RoomRedisSnapshot = {
      ...snapshot,
      players: snapshot.players.map((p, i) =>
        i === idx ? { ...p, isReady: true } : p,
      ),
    };
    await this.writeSnapshot(next);
    this.roomSync.schedulePersist(roomId);
    return next;
  }

  async setRoomStatus(
    roomId: string,
    status: RoomStatus,
  ): Promise<RoomRedisSnapshot> {
    const snapshot = await this.loadSnapshot(roomId);
    if (!snapshot) {
      throw new NotFoundException('Room not found');
    }
    const next = { ...snapshot, status };
    await this.writeSnapshot(next);
    this.roomSync.schedulePersist(roomId);
    return next;
  }

  async listPublic(query: PublicRoomsQueryDto): Promise<{
    items: PublicRoomItemView[];
    page: number;
    limit: number;
    total: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = { status: RoomStatus.WAITING };

    const [total, rows] = await Promise.all([
      this.prisma.room.count({ where }),
      this.prisma.room.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          track: {
            select: { id: true, slug: true, name: true, previewUrl: true },
          },
          _count: { select: { roomPlayers: true } },
        },
      }),
    ]);

    const items: PublicRoomItemView[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status,
      trackId: r.trackId,
      maxPlayers: r.maxPlayers,
      createdAt: r.createdAt.toISOString(),
      playerCount: r._count.roomPlayers,
      track: r.track,
    }));

    return { items, page, limit, total };
  }

  private async assertUserNotInActiveRoom(
    userId: string,
    exceptRoomId?: string,
  ): Promise<void> {
    const conflict = await this.prisma.roomPlayer.findFirst({
      where: {
        userId,
        ...(exceptRoomId ? { roomId: { not: exceptRoomId } } : {}),
        room: { status: { in: ACTIVE_STATUSES } },
      },
      select: { roomId: true },
    });
    if (conflict) {
      throw new ConflictException(
        'User is already in another active room',
      );
    }
  }

  private async writeSnapshot(snapshot: RoomRedisSnapshot): Promise<void> {
    const payload = JSON.stringify(snapshot);
    await this.redis.hset(`room:${snapshot.id}`, ROOM_HASH_PAYLOAD, payload);
    await this.redis.set(`room:code:${snapshot.code}`, snapshot.id);
  }

  private async loadSnapshot(roomId: string): Promise<RoomRedisSnapshot | null> {
    const raw = await this.redis.hget(`room:${roomId}`, ROOM_HASH_PAYLOAD);
    if (raw) {
      try {
        return JSON.parse(raw) as RoomRedisSnapshot;
      } catch {
        return null;
      }
    }

    const row = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        roomPlayers: {
          select: {
            userId: true,
            carId: true,
            position: true,
            laps: true,
            isReady: true,
          },
        },
      },
    });
    if (!row) {
      return null;
    }

    const snapshot: RoomRedisSnapshot = {
      id: row.id,
      code: row.code,
      status: row.status,
      trackId: row.trackId,
      maxPlayers: row.maxPlayers,
      createdAt: row.createdAt.toISOString(),
      players: row.roomPlayers.map((p) => ({
        userId: p.userId,
        carId: p.carId,
        position: p.position,
        laps: p.laps,
        isReady: p.isReady,
      })),
    };

    await this.writeSnapshot(snapshot);
    return snapshot;
  }

  private async snapshotToDetailView(
    snapshot: RoomRedisSnapshot,
  ): Promise<RoomDetailView> {
    const track = await this.prisma.track.findUnique({
      where: { id: snapshot.trackId },
      select: { id: true, slug: true, name: true, previewUrl: true },
    });
    if (!track) {
      throw new NotFoundException('Track not found for room');
    }

    const userIds = snapshot.players.map((p) => p.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true },
    });
    const nameById = new Map(users.map((u) => [u.id, u.username] as const));

    const players: RoomPlayerView[] = snapshot.players.map((p) => ({
      ...p,
      username: nameById.get(p.userId) ?? p.userId,
    }));

    return {
      id: snapshot.id,
      code: snapshot.code,
      status: snapshot.status,
      trackId: snapshot.trackId,
      maxPlayers: snapshot.maxPlayers,
      createdAt: snapshot.createdAt,
      track,
      players,
    };
  }
}
