import { Module } from '@nestjs/common';
import { PrismaClient } from '@vector-racers/db';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthTokensService } from './auth.tokens.service';
import { AdminGuard } from './guards/admin.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokensService,
    JwtStrategy,
    JwtAuthGuard,
    AdminGuard,
    PrismaClient,
  ],
  exports: [
    AuthTokensService,
    JwtStrategy,
    JwtAuthGuard,
    AdminGuard,
    PrismaClient,
  ],
})
export class AuthModule {}
