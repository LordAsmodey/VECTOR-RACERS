import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@vector-racers/db';
import * as request from 'supertest';
import { AuthModule } from '../../src/auth/auth.module';
import { AuthTokensService } from '../../src/auth/auth.tokens.service';

type StoredUser = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
};

class PrismaClientMock {
  private readonly usersByEmail = new Map<string, StoredUser>();
  private readonly usersByUsername = new Map<string, StoredUser>();
  private idSeq = 0;

  readonly user = {
    findFirst: async (args: {
      where: { OR: Array<{ email?: string; username?: string }> };
      select: { id: boolean };
    }): Promise<{ id: string } | null> => {
      const [emailCond, usernameCond] = args.where.OR;
      const email = emailCond?.email;
      const username = usernameCond?.username;

      if (email) {
        const user = this.usersByEmail.get(email);
        if (user) {
          return { id: user.id };
        }
      }

      if (username) {
        const user = this.usersByUsername.get(username);
        if (user) {
          return { id: user.id };
        }
      }

      return null;
    },
    create: async (args: {
      data: { email: string; username: string; passwordHash: string };
      select: { id: boolean };
    }): Promise<{ id: string }> => {
      const id = `user-${++this.idSeq}`;
      const createdUser: StoredUser = {
        id,
        email: args.data.email,
        username: args.data.username,
        passwordHash: args.data.passwordHash,
      };

      this.usersByEmail.set(createdUser.email, createdUser);
      this.usersByUsername.set(createdUser.username, createdUser);

      return { id: createdUser.id };
    },
    findUnique: async (args: {
      where: { email: string };
      select: { id: boolean; passwordHash: boolean };
    }): Promise<{ id: string; passwordHash: string } | null> => {
      const user = this.usersByEmail.get(args.where.email);
      if (!user) {
        return null;
      }

      return { id: user.id, passwordHash: user.passwordHash };
    },
  };
}

class AuthTokensServiceMock {
  private accessSeq = 0;
  private refreshSeq = 0;
  private readonly refreshOwner = new Map<string, string>();

  async issueTokenPair(
    userId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = `access-${userId}-${++this.accessSeq}-${'a'.repeat(48)}`;
    const refreshToken = `refresh-${userId}-${++this.refreshSeq}-${'r'.repeat(48)}`;
    this.refreshOwner.set(refreshToken, userId);
    return { accessToken, refreshToken };
  }

  async rotateAccessToken(refreshToken: string): Promise<string> {
    const userId = this.refreshOwner.get(refreshToken);
    if (!userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return `access-${userId}-${++this.accessSeq}`;
  }

  async invalidateRefreshToken(refreshToken: string): Promise<void> {
    if (!this.refreshOwner.has(refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    this.refreshOwner.delete(refreshToken);
  }
}

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  const assertNoSensitiveLeak = (
    body: unknown,
    options?: { forbiddenValues?: string[] },
  ): void => {
    const responseBody = body as Record<string, unknown>;

    expect(responseBody).not.toHaveProperty('password');
    expect(responseBody).not.toHaveProperty('passwordHash');
    expect(responseBody).not.toHaveProperty('email');
    expect(responseBody).not.toHaveProperty('credentials');

    const serializedBody = JSON.stringify(body).toLowerCase();
    const sensitiveMarkers = [
      'password',
      'passwordhash',
      'credentials',
      'secret',
      'authorization',
      'bearer',
    ];

    for (const marker of sensitiveMarkers) {
      expect(serializedBody).not.toContain(marker);
    }

    for (const value of options?.forbiddenValues ?? []) {
      expect(serializedBody).not.toContain(value.toLowerCase());
    }
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    })
      .overrideProvider(PrismaClient)
      .useValue(new PrismaClientMock())
      .overrideProvider(AuthTokensService)
      .useValue(new AuthTokensServiceMock())
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns accessToken and refreshToken for register and login', async () => {
    const registerPayload = {
      email: 'racer@example.com',
      password: 'SecurePass123!',
      username: 'racer',
    };

    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send(registerPayload)
      .expect(200);

    expect(registerRes.body).toHaveProperty('accessToken');
    expect(registerRes.body).toHaveProperty('refreshToken');

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: registerPayload.email, password: registerPayload.password })
      .expect(200);

    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('refreshToken');
  });

  it('returns 401 for invalid credentials without leaking sensitive fields', async () => {
    const invalidPayload = {
      email: 'unknown@example.com',
      password: 'WrongPass123!',
    };

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(invalidPayload)
      .expect(401)
      .expect((res) => {
        assertNoSensitiveLeak(res.body, {
          forbiddenValues: [invalidPayload.email, invalidPayload.password],
        });
      });
  });

  it('returns 401 for existing email with wrong password without leaking sensitive fields', async () => {
    const userPayload = {
      email: 'existing-user@example.com',
      password: 'SecurePass123!',
      username: 'existing-user',
    };

    await request(app.getHttpServer())
      .post('/auth/register')
      .send(userPayload)
      .expect(200);

    const invalidPayload = {
      email: userPayload.email,
      password: 'WrongPass123!',
    };

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(invalidPayload)
      .expect(401)
      .expect((res) => {
        assertNoSensitiveLeak(res.body, {
          forbiddenValues: [invalidPayload.email, invalidPayload.password],
        });
      });
  });

  it('refresh returns only accessToken and requires valid refreshToken', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'refresh-user@example.com',
        password: 'SecurePass123!',
        username: 'refresh-user',
      })
      .expect(200);

    const refreshToken: string = registerRes.body.refreshToken;

    const refreshRes = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(Object.keys(refreshRes.body)).toEqual(['accessToken']);
    expect(refreshRes.body).toHaveProperty('accessToken');
    expect(refreshRes.body).not.toHaveProperty('refreshToken');

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: `invalid-${'x'.repeat(40)}` })
      .expect(401);
  });

  it('invalidates refresh token after logout', async () => {
    const registerRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'logout-user@example.com',
        password: 'SecurePass123!',
        username: 'logout-user',
      })
      .expect(200);

    const refreshToken: string = registerRes.body.refreshToken;

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
