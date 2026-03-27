import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  accessTokenPrivateKey: string;
  accessTokenPublicKey: string;
  refreshTokenSecret: string;
}

/**
 * Inline PEM (JWT_ACCESS_*_KEY) or file path (JWT_ACCESS_*_KEY_PATH), matching `.env.example`.
 * Tries `process.cwd()` then two levels up (when Nest runs from `apps/api`).
 */
function readPemFromEnvOrPath(
  inline: string | undefined,
  pathEnv: string | undefined,
  name: string,
): string {
  const trimmed = inline?.trim();
  if (trimmed) {
    return trimmed;
  }

  const rel = pathEnv?.trim();
  if (!rel) {
    throw new Error(
      `${name} or ${name.replace('_KEY', '_KEY_PATH')} environment variable is required`,
    );
  }

  const candidates = [
    resolve(process.cwd(), rel),
    resolve(process.cwd(), '..', '..', rel),
  ];

  for (const filePath of candidates) {
    try {
      return readFileSync(filePath, 'utf8').trim();
    } catch {
      /* try next */
    }
  }

  throw new Error(
    `Cannot read PEM for ${name} from path ${rel} (tried: ${candidates.join(', ')})`,
  );
}

export const getAuthConfig = (): AuthConfig => {
  const accessTokenPrivateKey = readPemFromEnvOrPath(
    process.env.JWT_ACCESS_PRIVATE_KEY,
    process.env.JWT_ACCESS_PRIVATE_KEY_PATH,
    'JWT_ACCESS_PRIVATE_KEY',
  );
  const accessTokenPublicKey = readPemFromEnvOrPath(
    process.env.JWT_ACCESS_PUBLIC_KEY,
    process.env.JWT_ACCESS_PUBLIC_KEY_PATH,
    'JWT_ACCESS_PUBLIC_KEY',
  );
  let refreshTokenSecret = process.env.JWT_SECRET?.trim();
  if (!refreshTokenSecret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is required');
    }
    // Local monorepo `.env` often omits this until TASK-006 is fully wired; HS256 refresh signing.
    console.warn(
      '[auth] JWT_SECRET is unset; using insecure dev-only default. Add JWT_SECRET to root `.env` before production.',
    );
    refreshTokenSecret = 'vector-racers-dev-jwt-secret-min-32-chars!!';
  }

  return {
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    accessTokenPrivateKey,
    accessTokenPublicKey,
    refreshTokenSecret,
  };
};
