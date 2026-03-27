import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * Requires `client.data.userId` set in `GameGateway.handleConnection` (handshake JWT).
 */
@Injectable()
export class JwtWsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const userId = client.data?.userId as string | undefined;
    if (!userId) {
      throw new WsException('Unauthorized');
    }
    return true;
  }
}
