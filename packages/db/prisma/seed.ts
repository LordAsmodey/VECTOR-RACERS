/**
 * Idempotent seed data is implemented in TASK-005.
 * Keep PrismaClient import from the workspace package for consistency.
 */
import { PrismaClient } from '../src/index';

const prisma = new PrismaClient();

async function main() {
  // eslint-disable-next-line no-console -- seed script
  console.log('[seed] Placeholder. TASK-005 adds cars, tracks, admin, championship.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
