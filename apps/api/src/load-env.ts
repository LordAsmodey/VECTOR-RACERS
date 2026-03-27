/**
 * Load monorepo root `.env` before Nest reads `process.env`.
 * `pnpm dev` / `nest start` often runs with cwd `apps/api`, so root `.env` is not loaded automatically.
 */
import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const candidates = [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env'),
];

for (const path of candidates) {
  if (existsSync(path)) {
    config({ path, quiet: true });
    break;
  }
}
