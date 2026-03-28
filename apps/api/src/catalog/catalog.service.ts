import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@vector-racers/db';

export type CarStatsView = {
  speed: number;
  acceleration: number;
  grip: number;
  mass: number;
};

export type CarCatalogItem = {
  id: string;
  slug: string;
  name: string;
  stats: CarStatsView;
  imageUrl: string;
  unlockedByDefault: boolean;
};

export type TrackCatalogItem = {
  id: string;
  slug: string;
  name: string;
  previewUrl: string;
  lapCount: number;
  difficulty: string;
};

function parseCarStats(raw: string): CarStatsView {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const n = (k: string) =>
      typeof v[k] === 'number' && Number.isFinite(v[k] as number)
        ? (v[k] as number)
        : 0;
    return {
      speed: n('speed'),
      acceleration: n('acceleration'),
      grip: n('grip'),
      mass: n('mass'),
    };
  } catch {
    return { speed: 0, acceleration: 0, grip: 0, mass: 0 };
  }
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaClient) {}

  async listCars(): Promise<CarCatalogItem[]> {
    const rows = await this.prisma.car.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        stats: true,
        imageUrl: true,
        unlockedByDefault: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      stats: parseCarStats(r.stats),
      imageUrl: r.imageUrl,
      unlockedByDefault: r.unlockedByDefault,
    }));
  }

  async listTracks(): Promise<TrackCatalogItem[]> {
    const rows = await this.prisma.track.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        previewUrl: true,
        lapCount: true,
        difficulty: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      previewUrl: r.previewUrl,
      lapCount: r.lapCount,
      difficulty: r.difficulty,
    }));
  }
}
