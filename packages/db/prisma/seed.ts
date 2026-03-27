/**
 * Idempotent seed (TASK-005). Uses PrismaClient from @vector-racers/db.
 * Run: `pnpm exec prisma db seed` from packages/db (DATABASE_URL required).
 */
import * as bcrypt from 'bcrypt';
import {
  ChampEventStatus,
  ChampionshipStatus,
  TrackDifficulty,
  UserRole,
} from '../src/generated/client/index.js';
import { PrismaClient } from '../src/index';

const prisma = new PrismaClient();

const BCRYPT_ROUNDS = 12;

/** Matches appendix `TrackDef` in vector-racers-tasks.md (physics engine). */
function trackDefJson(
  waypoints: [number, number][],
  halfWidth: number,
  lapCount: number,
): string {
  const def = { waypoints, halfWidth, lapCount };
  return JSON.stringify(def);
}

const SEED_CHAMP_NAME = 'Vector Racers — Seed Championship';

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminEmail?.trim() || !adminPassword) {
    throw new Error(
      '[seed] Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in the environment (e.g. in .env at repo root).',
    );
  }
  const adminUsername = (process.env.SEED_ADMIN_USERNAME ?? 'seed_admin').trim();

  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);

  const cars = [
    {
      slug: 'dart',
      name: 'Dart X1',
      stats: JSON.stringify({
        speed: 0.95,
        acceleration: 0.75,
        grip: 0.55,
        mass: 0.65,
      }),
      imageUrl: 'https://placehold.co/512x320/16213e/e94560?text=Dart+X1',
      unlockedByDefault: true,
    },
    {
      slug: 'brute',
      name: 'Brute GT',
      stats: JSON.stringify({
        speed: 0.7,
        acceleration: 0.95,
        grip: 0.85,
        mass: 0.95,
      }),
      imageUrl: 'https://placehold.co/512x320/1a1a2e/0f3460?text=Brute+GT',
      unlockedByDefault: true,
    },
    {
      slug: 'phantom',
      name: 'Phantom R',
      stats: JSON.stringify({
        speed: 0.85,
        acceleration: 0.85,
        grip: 0.45,
        mass: 0.7,
      }),
      imageUrl: 'https://placehold.co/512x320/0f0c29/533483?text=Phantom+R',
      unlockedByDefault: true,
    },
    {
      slug: 'spark',
      name: 'Spark Evo',
      stats: JSON.stringify({
        speed: 0.65,
        acceleration: 0.7,
        grip: 0.95,
        mass: 0.6,
      }),
      imageUrl: 'https://placehold.co/512x320/1b262c/0f4c75?text=Spark+Evo',
      unlockedByDefault: false,
    },
    {
      slug: 'titan',
      name: 'Titan Mk2',
      stats: JSON.stringify({
        speed: 0.75,
        acceleration: 0.65,
        grip: 0.75,
        mass: 0.85,
      }),
      imageUrl: 'https://placehold.co/512x320/2d132c/c72c41?text=Titan+Mk2',
      unlockedByDefault: false,
    },
  ] as const;

  for (const car of cars) {
    await prisma.car.upsert({
      where: { slug: car.slug },
      create: car,
      update: {
        name: car.name,
        stats: car.stats,
        imageUrl: car.imageUrl,
        unlockedByDefault: car.unlockedByDefault,
      },
    });
  }

  // Closed-circuit centerlines: last point matches first so clients may treat the loop explicitly.
  const harborLoop: [number, number][] = [
    [120, 120],
    [680, 120],
    [720, 200],
    [720, 480],
    [640, 520],
    [160, 520],
    [80, 440],
    [80, 200],
    [120, 120],
  ];

  const citySprint: [number, number][] = [
    [100, 300],
    [220, 140],
    [420, 100],
    [600, 180],
    [700, 320],
    [640, 460],
    [440, 500],
    [240, 420],
    [100, 300],
  ];

  const mountainPass: [number, number][] = [
    [400, 80],
    [520, 160],
    [640, 120],
    [720, 260],
    [680, 400],
    [520, 480],
    [360, 440],
    [240, 360],
    [200, 220],
    [280, 120],
    [400, 80],
  ];

  const neonCircuit: [number, number][] = [
    [200, 200],
    [360, 120],
    [540, 200],
    [620, 360],
    [560, 520],
    [400, 560],
    [240, 500],
    [160, 360],
    [200, 200],
  ];

  const tracks = [
    {
      slug: 'harbor-loop',
      name: 'Harbor Loop',
      waypointsJson: trackDefJson(harborLoop, 52, 3),
      previewUrl: 'https://placehold.co/640x360/1a1a2e/0f3460?text=Harbor+Loop',
      lapCount: 3,
      difficulty: TrackDifficulty.EASY,
    },
    {
      slug: 'city-sprint',
      name: 'City Sprint',
      waypointsJson: trackDefJson(citySprint, 44, 3),
      previewUrl: 'https://placehold.co/640x360/16213e/e94560?text=City+Sprint',
      lapCount: 3,
      difficulty: TrackDifficulty.MEDIUM,
    },
    {
      slug: 'mountain-pass',
      name: 'Mountain Pass',
      waypointsJson: trackDefJson(mountainPass, 38, 5),
      previewUrl: 'https://placehold.co/640x360/0f0c29/533483?text=Mountain+Pass',
      lapCount: 5,
      difficulty: TrackDifficulty.HARD,
    },
    {
      slug: 'neon-circuit',
      name: 'Neon Circuit',
      waypointsJson: trackDefJson(neonCircuit, 34, 7),
      previewUrl: 'https://placehold.co/640x360/2d132c/c72c41?text=Neon+Circuit',
      lapCount: 7,
      difficulty: TrackDifficulty.EXPERT,
    },
  ] as const;

  for (const track of tracks) {
    await prisma.track.upsert({
      where: { slug: track.slug },
      create: track,
      update: {
        name: track.name,
        waypointsJson: track.waypointsJson,
        previewUrl: track.previewUrl,
        lapCount: track.lapCount,
        difficulty: track.difficulty,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: adminEmail.trim() },
    create: {
      email: adminEmail.trim(),
      username: adminUsername,
      passwordHash,
      role: UserRole.ADMIN,
    },
    update: {
      passwordHash,
      role: UserRole.ADMIN,
      username: adminUsername,
    },
  });

  const t1 = await prisma.track.findUniqueOrThrow({ where: { slug: 'harbor-loop' } });
  const t2 = await prisma.track.findUniqueOrThrow({ where: { slug: 'city-sprint' } });
  const t3 = await prisma.track.findUniqueOrThrow({ where: { slug: 'mountain-pass' } });

  let championship = await prisma.championship.findFirst({
    where: { name: SEED_CHAMP_NAME },
  });
  if (!championship) {
    championship = await prisma.championship.create({
      data: {
        name: SEED_CHAMP_NAME,
        status: ChampionshipStatus.ACTIVE,
        startAt: new Date('2025-04-01T12:00:00.000Z'),
        endAt: new Date('2025-10-31T22:00:00.000Z'),
      },
    });
  } else {
    championship = await prisma.championship.update({
      where: { id: championship.id },
      data: {
        status: ChampionshipStatus.ACTIVE,
        startAt: new Date('2025-04-01T12:00:00.000Z'),
        endAt: new Date('2025-10-31T22:00:00.000Z'),
      },
    });
  }

  const eventSpecs = [
    { orderIndex: 0, trackId: t1.id },
    { orderIndex: 1, trackId: t2.id },
    { orderIndex: 2, trackId: t3.id },
  ] as const;

  for (const ev of eventSpecs) {
    await prisma.champEvent.upsert({
      where: {
        championshipId_orderIndex: {
          championshipId: championship.id,
          orderIndex: ev.orderIndex,
        },
      },
      create: {
        championshipId: championship.id,
        trackId: ev.trackId,
        orderIndex: ev.orderIndex,
        status: ChampEventStatus.DRAFT,
      },
      update: {
        trackId: ev.trackId,
      },
    });
  }

  // eslint-disable-next-line no-console -- seed script
  console.log(
    `[seed] Done: ${cars.length} cars, ${tracks.length} tracks, admin user, championship "${championship.name}" (${eventSpecs.length} events).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
