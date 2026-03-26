const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface AuthConfig {
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  accessTokenPrivateKey: string;
  accessTokenPublicKey: string;
  refreshTokenSecret: string;
}

export const getAuthConfig = (): AuthConfig => {
  const accessTokenPrivateKey = process.env.JWT_ACCESS_PRIVATE_KEY?.trim();
  const accessTokenPublicKey = process.env.JWT_ACCESS_PUBLIC_KEY?.trim();
  const refreshTokenSecret = process.env.JWT_SECRET?.trim();

  if (!accessTokenPrivateKey) {
    throw new Error('JWT_ACCESS_PRIVATE_KEY environment variable is required');
  }

  if (!accessTokenPublicKey) {
    throw new Error('JWT_ACCESS_PUBLIC_KEY environment variable is required');
  }

  if (!refreshTokenSecret) {
    throw new Error('JWT_SECRET environment variable is required');
  }

  return {
    accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
    refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    accessTokenPrivateKey,
    accessTokenPublicKey,
    refreshTokenSecret,
  };
};
