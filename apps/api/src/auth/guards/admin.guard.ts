import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { PrismaClient, UserRole } from '@vector-racers/db';
import type { AuthenticatedUserContext } from '../strategies/jwt.strategy';

type AdminRequest = Request & { user?: AuthenticatedUserContext };

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const userId = request.user?.userId;
    if (!userId) {
      throw new ForbiddenException('Admin access required');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
