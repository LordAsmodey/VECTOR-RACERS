import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChampEventStatus,
  ChampionshipStatus,
  PrismaClient,
} from '@vector-racers/db';
import { totalPointsByUserId } from './championships.points';
import type { CompleteChampEventDto } from './dto/complete-champ-event.dto';
import type { CreateChampionshipDto } from './dto/create-championship.dto';
import type { ListChampionshipsQueryDto } from './dto/list-championships-query.dto';

const trackSelect = {
  id: true,
  slug: true,
  name: true,
  previewUrl: true,
  difficulty: true,
} as const;

export type LeaderboardEntryView = {
  rank: number;
  userId: string;
  username: string;
  avatarUrl: string | null;
  totalPoints: number;
  eventsPlayed: number;
};

function assertValidRaceResults(
  rows: { userId: string; finishPosition: number; fastestLapMs: number }[],
): void {
  const userIds = new Set<string>();
  const positions = new Set<number>();
  for (const r of rows) {
    if (userIds.has(r.userId)) {
      throw new BadRequestException('Duplicate userId in results');
    }
    userIds.add(r.userId);
    if (positions.has(r.finishPosition)) {
      throw new BadRequestException('Duplicate finishPosition in results');
    }
    positions.add(r.finishPosition);
  }
  const n = rows.length;
  for (let i = 1; i <= n; i++) {
    if (!positions.has(i)) {
      throw new BadRequestException(
        `finishPosition must be a permutation of 1..${n}`,
      );
    }
  }
}

@Injectable()
export class ChampionshipsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: ListChampionshipsQueryDto) {
    return this.prisma.championship.findMany({
      where: query.status ? { status: query.status } : undefined,
      orderBy: { startAt: 'desc' },
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        _count: { select: { champEvents: true } },
      },
    });
  }

  async getById(championshipId: string) {
    const row = await this.prisma.championship.findUnique({
      where: { id: championshipId },
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        champEvents: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            status: true,
            track: { select: trackSelect },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Championship not found');
    }
    const leaderboard = await this.buildLeaderboard(championshipId);
    return { ...row, leaderboard };
  }

  async getLeaderboard(
    championshipId: string,
  ): Promise<LeaderboardEntryView[]> {
    const exists = await this.prisma.championship.findUnique({
      where: { id: championshipId },
      select: { id: true },
    });
    if (!exists) {
      throw new NotFoundException('Championship not found');
    }
    return this.buildLeaderboard(championshipId);
  }

  private async buildLeaderboard(
    championshipId: string,
  ): Promise<LeaderboardEntryView[]> {
    const grouped = await this.prisma.champResult.groupBy({
      by: ['userId'],
      where: { champEvent: { championshipId } },
      _sum: { points: true },
      _count: { userId: true },
    });

    if (grouped.length === 0) {
      return [];
    }

    const userIds = grouped.map((g) => g.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, avatarUrl: true },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const sorted = [...grouped].sort((a, b) => {
      const pa = a._sum.points ?? 0;
      const pb = b._sum.points ?? 0;
      if (pb !== pa) {
        return pb - pa;
      }
      return a.userId.localeCompare(b.userId);
    });

    return sorted.map((g, index) => {
      const u = userMap.get(g.userId);
      return {
        rank: index + 1,
        userId: g.userId,
        username: u?.username ?? 'unknown',
        avatarUrl: u?.avatarUrl ?? null,
        totalPoints: g._sum.points ?? 0,
        eventsPlayed: g._count.userId,
      };
    });
  }

  async create(dto: CreateChampionshipDto) {
    const orders = dto.events.map((e) => e.order);
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      throw new BadRequestException('Event order values must be unique');
    }

    const trackIds = [...new Set(dto.events.map((e) => e.trackId))];
    const tracks = await this.prisma.track.findMany({
      where: { id: { in: trackIds } },
      select: { id: true },
    });
    if (tracks.length !== trackIds.length) {
      throw new BadRequestException('One or more trackId values are invalid');
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : new Date();
    const endAt = dto.endAt
      ? new Date(dto.endAt)
      : new Date(startAt.getTime() + 365 * 24 * 60 * 60 * 1000);

    return this.prisma.championship.create({
      data: {
        name: dto.name.trim(),
        status: ChampionshipStatus.DRAFT,
        startAt,
        endAt,
        champEvents: {
          create: dto.events.map((e) => ({
            trackId: e.trackId,
            orderIndex: e.order,
            status: ChampEventStatus.DRAFT,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        champEvents: {
          orderBy: { orderIndex: 'asc' },
          select: {
            id: true,
            orderIndex: true,
            status: true,
            track: { select: trackSelect },
          },
        },
      },
    });
  }

  async startChampionship(championshipId: string) {
    const championship = await this.prisma.championship.findUnique({
      where: { id: championshipId },
      include: {
        champEvents: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!championship) {
      throw new NotFoundException('Championship not found');
    }
    if (championship.status === ChampionshipStatus.FINISHED) {
      throw new BadRequestException('Championship is already finished');
    }

    const events = championship.champEvents;
    if (events.length === 0) {
      throw new BadRequestException('Championship has no events');
    }

    const firstOpen = events.find(
      (e) => e.status !== ChampEventStatus.FINISHED,
    );
    if (!firstOpen) {
      throw new BadRequestException('All events are already finished');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.championship.update({
        where: { id: championshipId },
        data: { status: ChampionshipStatus.ACTIVE },
      });

      for (const ev of events) {
        let nextStatus = ev.status;
        if (ev.status === ChampEventStatus.FINISHED) {
          nextStatus = ChampEventStatus.FINISHED;
        } else if (ev.id === firstOpen.id) {
          nextStatus = ChampEventStatus.ACTIVE;
        } else {
          nextStatus = ChampEventStatus.DRAFT;
        }
        if (nextStatus !== ev.status) {
          await tx.champEvent.update({
            where: { id: ev.id },
            data: { status: nextStatus },
          });
        }
      }
    });

    return this.getById(championshipId);
  }

  async completeChampEvent(
    championshipId: string,
    eventId: string,
    dto: CompleteChampEventDto,
  ) {
    const event = await this.prisma.champEvent.findFirst({
      where: { id: eventId, championshipId },
      include: {
        championship: {
          select: { id: true, status: true },
        },
      },
    });

    if (!event) {
      throw new NotFoundException('Championship event not found');
    }

    if (event.status === ChampEventStatus.FINISHED) {
      throw new BadRequestException('Event is already finished');
    }

    assertValidRaceResults(dto.results);

    const userIds = dto.results.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new BadRequestException('One or more userId values are invalid');
    }

    const pointsByUser = totalPointsByUserId(dto.results);

    const allEvents = await this.prisma.champEvent.findMany({
      where: { championshipId },
      orderBy: { orderIndex: 'asc' },
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.champResult.deleteMany({ where: { champEventId: eventId } });

      await tx.champResult.createMany({
        data: dto.results.map((r) => ({
          champEventId: eventId,
          userId: r.userId,
          finishPosition: r.finishPosition,
          fastestLapMs: r.fastestLapMs,
          points: pointsByUser.get(r.userId) ?? 0,
        })),
      });

      await tx.champEvent.update({
        where: { id: eventId },
        data: { status: ChampEventStatus.FINISHED },
      });

      const orderIndex = event.orderIndex;
      const next = allEvents.find(
        (e) => e.orderIndex > orderIndex && e.id !== eventId,
      );

      if (next) {
        await tx.champEvent.updateMany({
          where: {
            championshipId,
            id: { not: eventId },
            status: { not: ChampEventStatus.FINISHED },
          },
          data: { status: ChampEventStatus.DRAFT },
        });
        await tx.champEvent.update({
          where: { id: next.id },
          data: { status: ChampEventStatus.ACTIVE },
        });
      } else {
        await tx.championship.update({
          where: { id: championshipId },
          data: { status: ChampionshipStatus.FINISHED },
        });
      }
    });

    return this.getById(championshipId);
  }
}
