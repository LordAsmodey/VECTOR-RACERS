import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createHmac,
  createSign,
  createVerify,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Socket } from 'node:net';
import { getAuthConfig } from '../config/auth.config';

type TokenType = 'access' | 'refresh';
type JwtAlgorithm = 'RS256' | 'HS256';

export interface JwtPayload {
  sub: string;
  type: TokenType;
  iat: number;
  exp: number;
  jti?: string;
}

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

@Injectable()
export class AuthTokensService {
  /** Dev-only when `REDIS_URL` is unset; production always requires Redis. */
  private static devRefreshEntries = new Map<
    string,
    { token: string; expiresAtMs: number }
  >();
  private static memoryWarnLogged = false;

  private readonly redisUrl = process.env.REDIS_URL?.trim();
  private readonly useMemoryRefreshStore =
    !process.env.REDIS_URL?.trim() && process.env.NODE_ENV !== 'production';
  /** Set when Redis is configured but unreachable in dev (first failed op). */
  private redisDevFailover = false;
  private readonly authConfig = getAuthConfig();

  private shouldUseMemoryRefreshStore(): boolean {
    return this.useMemoryRefreshStore || this.redisDevFailover;
  }

  private activateRedisDevFailover(): void {
    if (this.redisDevFailover) {
      return;
    }
    this.redisDevFailover = true;
    console.warn(
      '[auth] Redis unreachable; using in-memory refresh store for this dev session. Start Redis for production-like behavior.',
    );
  }

  private setRefreshTokenMemory(
    userId: string,
    jti: string,
    token: string,
  ): void {
    const key = this.redisKey(userId, jti);
    AuthTokensService.devRefreshEntries.set(key, {
      token,
      expiresAtMs:
        Date.now() + this.authConfig.refreshTokenTtlSeconds * 1000,
    });
  }

  private getRefreshTokenMemory(
    userId: string,
    jti: string,
  ): string | null {
    const key = this.redisKey(userId, jti);
    const entry = AuthTokensService.devRefreshEntries.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() >= entry.expiresAtMs) {
      AuthTokensService.devRefreshEntries.delete(key);
      return null;
    }
    return entry.token;
  }

  async issueTokenPair(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const jti = randomUUID();
    const accessToken = this.signToken(
      { sub: userId, type: 'access' },
      this.authConfig.accessTokenTtlSeconds,
    );
    const refreshToken = this.signToken(
      { sub: userId, type: 'refresh', jti },
      this.authConfig.refreshTokenTtlSeconds,
    );

    await this.setRefreshToken(userId, jti, refreshToken);

    return { accessToken, refreshToken };
  }

  async rotateAccessToken(refreshToken: string): Promise<string> {
    const payload = this.verifyRefreshToken(refreshToken);
    const { sub, jti } = payload;

    const storedToken = await this.getRefreshToken(sub, jti);
    if (!storedToken || storedToken !== refreshToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.signToken(
      { sub, type: 'access' },
      this.authConfig.accessTokenTtlSeconds,
    );
  }

  async invalidateRefreshToken(refreshToken: string): Promise<void> {
    const payload = this.verifyRefreshToken(refreshToken);
    const { sub, jti } = payload;

    await this.deleteRefreshToken(sub, jti);
  }

  verifyAccessToken(accessToken: string): JwtPayload {
    const payload = this.verifyToken(accessToken, 'RS256');
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid access token');
    }
    return payload;
  }

  private verifyRefreshToken(
    refreshToken: string,
  ): JwtPayload & { jti: string } {
    const payload = this.verifyToken(refreshToken, 'HS256');
    if (payload.type !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { ...payload, jti: payload.jti };
  }

  private signToken(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    ttlSeconds: number,
  ): string {
    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JwtPayload = {
      ...payload,
      iat: now,
      exp: now + ttlSeconds,
    };
    const algorithm = payload.type === 'access' ? 'RS256' : 'HS256';
    const headerPart = this.base64UrlEncode(
      JSON.stringify({ alg: algorithm, typ: 'JWT' }),
    );
    const payloadPart = this.base64UrlEncode(JSON.stringify(fullPayload));
    const signature =
      payload.type === 'access'
        ? this.signRs256(`${headerPart}.${payloadPart}`)
        : this.signHs256(`${headerPart}.${payloadPart}`);

    return `${headerPart}.${payloadPart}.${signature}`;
  }

  private verifyToken(token: string, expectedAlgorithm: JwtAlgorithm): JwtPayload {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid token');
    }

    const [headerPart, payloadPart, signaturePart] = parts;
    const header = this.parseHeader(headerPart);

    if (header.alg !== expectedAlgorithm) {
      throw new UnauthorizedException('Invalid token');
    }

    const signedData = `${headerPart}.${payloadPart}`;
    if (expectedAlgorithm === 'RS256') {
      if (!this.verifyRs256(signedData, signaturePart)) {
        throw new UnauthorizedException('Invalid token');
      }
    } else {
      if (!this.verifyHs256(signedData, signaturePart)) {
        throw new UnauthorizedException('Invalid token');
      }
    }

    let payload: JwtPayload;
    try {
      payload = JSON.parse(this.base64UrlDecode(payloadPart)) as JwtPayload;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) {
      throw new UnauthorizedException('Token expired');
    }

    return payload;
  }

  private parseHeader(encodedHeader: string): { alg: JwtAlgorithm; typ?: string } {
    try {
      return JSON.parse(this.base64UrlDecode(encodedHeader)) as {
        alg: JwtAlgorithm;
        typ?: string;
      };
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private signHs256(data: string): string {
    return createHmac('sha256', this.authConfig.refreshTokenSecret)
      .update(data)
      .digest('base64url');
  }

  private signRs256(data: string): string {
    return createSign('RSA-SHA256')
      .update(data)
      .end()
      .sign(this.authConfig.accessTokenPrivateKey, 'base64url');
  }

  private verifyRs256(data: string, signature: string): boolean {
    try {
      return createVerify('RSA-SHA256')
        .update(data)
        .end()
        .verify(this.authConfig.accessTokenPublicKey, signature, 'base64url');
    } catch {
      return false;
    }
  }

  private verifyHs256(data: string, signature: string): boolean {
    const expectedSignature = this.signHs256(data);
    const given = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    return (
      given.length === expected.length && timingSafeEqual(given, expected)
    );
  }

  private base64UrlEncode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  }

  private base64UrlDecode(value: string): string {
    return Buffer.from(value, 'base64url').toString('utf8');
  }

  private redisKey(userId: string, jti: string): string {
    return `rt:${userId}:${jti}`;
  }

  private logMemoryStoreWarningOnce(): void {
    if (AuthTokensService.memoryWarnLogged) {
      return;
    }
    AuthTokensService.memoryWarnLogged = true;
    console.warn(
      '[auth] REDIS_URL unset; using in-memory refresh store (dev only). Start Redis and set REDIS_URL for production-like behavior.',
    );
  }

  private async setRefreshToken(
    userId: string,
    jti: string,
    token: string,
  ): Promise<void> {
    if (this.shouldUseMemoryRefreshStore()) {
      if (this.useMemoryRefreshStore) {
        this.logMemoryStoreWarningOnce();
      }
      this.setRefreshTokenMemory(userId, jti, token);
      return;
    }

    try {
      const key = this.redisKey(userId, jti);
      await this.withRedis(async (redis) => {
        await redis.command(
          'SET',
          key,
          token,
          'EX',
          String(this.authConfig.refreshTokenTtlSeconds),
        );
      });
    } catch {
      if (process.env.NODE_ENV === 'production' || !this.redisUrl) {
        throw new ServiceUnavailableException('Redis is unavailable');
      }
      this.activateRedisDevFailover();
      this.setRefreshTokenMemory(userId, jti, token);
    }
  }

  private async getRefreshToken(
    userId: string,
    jti: string,
  ): Promise<string | null> {
    if (this.shouldUseMemoryRefreshStore()) {
      return this.getRefreshTokenMemory(userId, jti);
    }

    try {
      const key = this.redisKey(userId, jti);
      return await this.withRedis(async (redis) => {
        const result = await redis.command('GET', key);
        return typeof result === 'string' ? result : null;
      });
    } catch {
      if (process.env.NODE_ENV === 'production' || !this.redisUrl) {
        throw new ServiceUnavailableException('Redis is unavailable');
      }
      this.activateRedisDevFailover();
      return this.getRefreshTokenMemory(userId, jti);
    }
  }

  private async deleteRefreshToken(userId: string, jti: string): Promise<void> {
    if (this.shouldUseMemoryRefreshStore()) {
      AuthTokensService.devRefreshEntries.delete(this.redisKey(userId, jti));
      return;
    }

    try {
      const key = this.redisKey(userId, jti);
      await this.withRedis(async (redis) => {
        await redis.command('DEL', key);
      });
    } catch {
      if (process.env.NODE_ENV === 'production' || !this.redisUrl) {
        throw new ServiceUnavailableException('Redis is unavailable');
      }
      this.activateRedisDevFailover();
      AuthTokensService.devRefreshEntries.delete(this.redisKey(userId, jti));
    }
  }

  private async withRedis<T>(
    operation: (client: RawRedisClient) => Promise<T>,
  ): Promise<T> {
    if (!this.redisUrl) {
      throw new ServiceUnavailableException('Redis is unavailable');
    }

    const client = new RawRedisClient(this.redisUrl);
    try {
      await client.connect();
      return await operation(client);
    } catch {
      throw new ServiceUnavailableException('Redis is unavailable');
    } finally {
      client.close();
    }
  }
}

class RawRedisClient {
  private readonly config: RedisConfig;
  private socket: Socket | null = null;
  private buffer = '';

  constructor(redisUrl: string) {
    const parsed = new URL(redisUrl);
    this.config = {
      host: parsed.hostname,
      port: Number(parsed.port || 6379),
      password: parsed.password || undefined,
      db:
        parsed.pathname && parsed.pathname !== '/'
          ? Number(parsed.pathname.slice(1))
          : undefined,
    };
  }

  async connect(): Promise<void> {
    this.socket = new Socket();
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('error', reject);
      this.socket!.connect(this.config.port, this.config.host, () => {
        this.socket!.off('error', reject);
        resolve();
      });
    });

    if (this.config.password) {
      await this.command('AUTH', this.config.password);
    }
    if (typeof this.config.db === 'number' && !Number.isNaN(this.config.db)) {
      await this.command('SELECT', String(this.config.db));
    }
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  async command(...parts: string[]): Promise<string | number | null> {
    if (!this.socket) {
      throw new Error('Redis is not connected');
    }
    const socket = this.socket;

    const payload = this.serialize(parts);

    return new Promise((resolve, reject) => {
      const onData = (chunk: Buffer): void => {
        this.buffer += chunk.toString('utf8');
        const parsed = this.tryParseResponse();
        if (parsed === undefined) {
          return;
        }
        socket.off('data', onData);
        if (parsed instanceof Error) {
          reject(parsed);
          return;
        }
        resolve(parsed);
      };

      socket.on('data', onData);
      socket.write(payload);
    });
  }

  private serialize(parts: string[]): string {
    const chunks = [`*${parts.length}\r\n`];
    for (const part of parts) {
      chunks.push(`$${Buffer.byteLength(part)}\r\n${part}\r\n`);
    }
    return chunks.join('');
  }

  private tryParseResponse(): string | number | null | Error | undefined {
    if (!this.buffer.includes('\r\n')) {
      return undefined;
    }

    const type = this.buffer[0];
    const lineEnd = this.buffer.indexOf('\r\n');
    if (lineEnd === -1) {
      return undefined;
    }

    const line = this.buffer.slice(1, lineEnd);

    if (type === '+' || type === ':') {
      this.buffer = this.buffer.slice(lineEnd + 2);
      return type === ':' ? Number(line) : line;
    }

    if (type === '-') {
      this.buffer = this.buffer.slice(lineEnd + 2);
      return new Error(line);
    }

    if (type === '$') {
      const length = Number(line);
      if (length === -1) {
        this.buffer = this.buffer.slice(lineEnd + 2);
        return null;
      }
      const start = lineEnd + 2;
      const end = start + length;
      if (this.buffer.length < end + 2) {
        return undefined;
      }
      const value = this.buffer.slice(start, end);
      this.buffer = this.buffer.slice(end + 2);
      return value;
    }

    return new Error('Unsupported Redis response');
  }
}
