import { Injectable, Logger } from '@nestjs/common';
import { PrismaClient } from '@vector-racers/db';
import { RedisService } from '../redis/redis.service';
import type { RoomRedisSnapshot } from './room-redis.types';
import { RoomSyncMetrics } from './room-sync.metrics';

const ROOM_HASH_PAYLOAD = 'payload';

@Injectable()
export class RoomSyncService {
  private readonly logger = new Logger(RoomSyncService.name);

  constructor(
    private readonly prisma: PrismaClient,
    private readonly redisService: RedisService,
    private readonly metrics: RoomSyncMetrics,
  ) {}

  /** Non-blocking: writes Postgres with exponential backoff on failure. */
  schedulePersist(roomId: string): void {
    setImmediate(() => {
      void this.persistWithRetry(roomId, 0);
    });
  }

  private async persistWithRetry(
    roomId: string,
    attempt: number,
  ): Promise<void> {
    const maxAttempts = 6;
    const raw = await this.redisService.redis.hget(
      `room:${roomId}`,
      ROOM_HASH_PAYLOAD,
    );
    if (!raw) {
      this.logger.warn(`Room sync skipped: no Redis payload for ${roomId}`);
      return;
    }

    let snapshot: RoomRedisSnapshot;
    try {
      snapshot = JSON.parse(raw) as RoomRedisSnapshot;
    } catch {
      this.logger.error(`Invalid JSON in Redis for room ${roomId}`);
      return;
    }

    try {
      await this.applySnapshotToPostgres(snapshot);
    } catch (err) {
      this.metrics.postgresSyncFailures += 1;
      const delayMs = Math.min(2000, 50 * 2 ** attempt);
      this.logger.warn(
        `Room PG sync failed (attempt ${attempt + 1}/${maxAttempts}), retry in ${delayMs}ms`,
        err instanceof Error ? err.stack : err,
      );
      if (attempt + 1 >= maxAttempts) {
        this.logger.error(`Room PG sync exhausted for room ${roomId}`);
        return;
      }
      await new Promise((r) => setTimeout(r, delayMs));
      return this.persistWithRetry(roomId, attempt + 1);
    }
  }

  private async applySnapshotToPostgres(
    snapshot: RoomRedisSnapshot,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.room.upsert({
        where: { id: snapshot.id },
        create: {
          id: snapshot.id,
          code: snapshot.code,
          status: snapshot.status,
          maxPlayers: snapshot.maxPlayers,
          trackId: snapshot.trackId,
          createdAt: new Date(snapshot.createdAt),
        },
        update: {
          code: snapshot.code,
          status: snapshot.status,
          maxPlayers: snapshot.maxPlayers,
          trackId: snapshot.trackId,
        },
      });

      await tx.roomPlayer.deleteMany({ where: { roomId: snapshot.id } });
      if (snapshot.players.length > 0) {
        await tx.roomPlayer.createMany({
          data: snapshot.players.map((p) => ({
            roomId: snapshot.id,
            userId: p.userId,
            carId: p.carId,
            position: p.position,
            laps: p.laps,
            isReady: p.isReady,
          })),
        });
      }
    });
  }
}
