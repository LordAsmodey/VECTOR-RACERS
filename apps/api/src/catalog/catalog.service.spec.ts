import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@vector-racers/db';
import { CatalogService } from './catalog.service';

describe('CatalogService', () => {
  let service: CatalogService;
  let prisma: {
    car: { findMany: jest.Mock };
    track: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      car: { findMany: jest.fn() },
      track: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogService,
        { provide: PrismaClient, useValue: prisma },
      ],
    }).compile();

    service = module.get<CatalogService>(CatalogService);
  });

  it('listCars maps rows and parses stats JSON', async () => {
    prisma.car.findMany.mockResolvedValue([
      {
        id: 'car-1',
        slug: 'dart',
        name: 'Dart X1',
        stats: JSON.stringify({
          speed: 0.95,
          acceleration: 0.75,
          grip: 0.55,
          mass: 0.65,
        }),
        imageUrl: 'https://example.com/dart.png',
        unlockedByDefault: true,
      },
    ]);

    const rows = await service.listCars();

    expect(prisma.car.findMany).toHaveBeenCalled();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'car-1',
      slug: 'dart',
      name: 'Dart X1',
      stats: {
        speed: 0.95,
        acceleration: 0.75,
        grip: 0.55,
        mass: 0.65,
      },
      unlockedByDefault: true,
    });
  });

  it('listCars uses zero stats when JSON is invalid', async () => {
    prisma.car.findMany.mockResolvedValue([
      {
        id: 'car-bad',
        slug: 'x',
        name: 'X',
        stats: 'not-json',
        imageUrl: '',
        unlockedByDefault: true,
      },
    ]);

    const rows = await service.listCars();
    expect(rows[0]!.stats).toEqual({
      speed: 0,
      acceleration: 0,
      grip: 0,
      mass: 0,
    });
  });

  it('listTracks returns ordered catalog fields', async () => {
    prisma.track.findMany.mockResolvedValue([
      {
        id: 'tr-1',
        slug: 'oval',
        name: 'Oval',
        previewUrl: 'https://example.com/p.png',
        lapCount: 3,
        difficulty: 'EASY',
      },
    ]);

    const rows = await service.listTracks();
    expect(rows[0]).toEqual({
      id: 'tr-1',
      slug: 'oval',
      name: 'Oval',
      previewUrl: 'https://example.com/p.png',
      lapCount: 3,
      difficulty: 'EASY',
    });
  });
});
