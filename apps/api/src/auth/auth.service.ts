import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaClient } from '@vector-racers/db';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthTokensService } from './auth.tokens.service';

@Injectable()
export class AuthService {
  private static readonly BCRYPT_ROUNDS = 12;

  constructor(
    private readonly tokensService: AuthTokensService,
    private readonly prisma: PrismaClient,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const email = dto.email.trim().toLowerCase();
    const username = dto.username.trim();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [{ email }, { username }],
      },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      AuthService.BCRYPT_ROUNDS,
    );

    const user = await this.prisma.user
      .create({
        data: {
          email,
          username,
          passwordHash,
        },
        select: { id: true },
      })
      .catch(() => {
        throw new InternalServerErrorException('Unable to register user');
      });

    return this.tokensService.issueTokenPair(user.id);
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: {
        id: true,
        passwordHash: true,
      },
    });

    const invalidCredentialsError = new UnauthorizedException(
      'Authentication failed',
    );

    if (!user) {
      throw invalidCredentialsError;
    }

    const isValidPassword = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isValidPassword) {
      throw invalidCredentialsError;
    }

    return this.tokensService.issueTokenPair(user.id);
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string }> {
    const accessToken =
      await this.tokensService.rotateAccessToken(refreshToken);
    return { accessToken };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokensService.invalidateRefreshToken(refreshToken);
  }
}
