import { HttpException, UseGuards } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { RoomsService } from '../rooms/rooms.service';
import { GameMoveError, GameService } from './game.service';
import { JwtWsGuard } from './guards/jwt-ws.guard';

function wsCorsOrigins(): boolean | string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw) {
    return true;
  }
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length > 0 ? list : true;
}

@WebSocketGateway({
  cors: { origin: wsCorsOrigins(), credentials: true },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtStrategy: JwtStrategy,
    private readonly gameService: GameService,
    private readonly roomsService: RoomsService,
  ) {}

  handleConnection(client: Socket): void {
    try {
      const token = client.handshake.auth?.token;
      if (typeof token !== 'string' || !token) {
        client.disconnect(true);
        return;
      }
      const { userId } = this.jwtStrategy.validateAccessToken(token);
      client.data.userId = userId;
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(): void {}

  @UseGuards(JwtWsGuard)
  @SubscribeMessage('join_room')
  async onJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { roomId?: string },
  ): Promise<void> {
    const roomId = body?.roomId;
    if (typeof roomId !== 'string' || !roomId) {
      client.emit('error', { code: 'BAD_REQUEST', message: 'roomId required' });
      return;
    }
    try {
      const userId = client.data.userId as string;
      await this.roomsService.assertUserInRoom(roomId, userId);
      client.data.gameRoomId = roomId;
      await client.join(roomId);
      const snapshot = await this.roomsService.loadRoomSnapshot(roomId);
      if (!snapshot) {
        client.emit('error', { code: 'NOT_FOUND', message: 'Room not found' });
        return;
      }
      const playerJoined =
        await this.gameService.buildPlayerJoinedPayload(snapshot);
      this.server.to(roomId).emit('player_joined', playerJoined);
      const resync = await this.gameService.tryResyncAfterJoin(roomId);
      if (resync) {
        client.emit('game_start', resync);
      }
    } catch (e) {
      this.emitHttpishError(client, e);
    }
  }

  @UseGuards(JwtWsGuard)
  @SubscribeMessage('player_ready')
  async onPlayerReady(@ConnectedSocket() client: Socket): Promise<void> {
    const roomId = client.data.gameRoomId as string | undefined;
    if (!roomId) {
      client.emit('error', {
        code: 'NOT_IN_ROOM',
        message: 'Call join_room before player_ready',
      });
      return;
    }
    try {
      const userId = client.data.userId as string;
      const out = await this.gameService.onPlayerReady(userId, roomId);
      this.server.to(roomId).emit('player_joined', out.playerJoined);
      if (out.gameStart) {
        this.server.to(roomId).emit('game_start', out.gameStart);
      }
    } catch (e) {
      this.emitHttpishError(client, e);
    }
  }

  @UseGuards(JwtWsGuard)
  @SubscribeMessage('submit_move')
  async onSubmitMove(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { inputX?: number; inputY?: number; clientMoveSeq?: number },
  ): Promise<void> {
    const roomId = client.data.gameRoomId as string | undefined;
    if (!roomId) {
      client.emit('error', {
        code: 'NOT_IN_ROOM',
        message: 'Call join_room before submit_move',
      });
      return;
    }
    const userId = client.data.userId as string;
    const inputX = body?.inputX;
    const inputY = body?.inputY;
    if (typeof inputX !== 'number' || typeof inputY !== 'number') {
      client.emit('error', {
        code: 'BAD_REQUEST',
        message: 'inputX and inputY (numbers) are required',
      });
      return;
    }
    try {
      const result = await this.gameService.applySubmitMove(
        userId,
        roomId,
        { inputX, inputY },
        body?.clientMoveSeq,
      );
      if (result.stateUpdate) {
        this.server.to(roomId).emit('state_update', result.stateUpdate);
      }
      if (result.gameEnd) {
        this.server.to(roomId).emit('game_end', result.gameEnd);
      }
    } catch (e) {
      if (e instanceof GameMoveError) {
        client.emit('error', { code: e.code, message: e.message });
        return;
      }
      this.emitHttpishError(client, e);
    }
  }

  private emitHttpishError(client: Socket, e: unknown): void {
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const res = e.getResponse();
      let message = e.message;
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null && 'message' in res) {
        const m = (res as { message: string | string[] }).message;
        message = Array.isArray(m) ? m.join(', ') : String(m);
      }
      const code =
        status === 404
          ? 'NOT_FOUND'
          : status === 403
            ? 'FORBIDDEN'
            : 'ERROR';
      client.emit('error', { code, message });
      return;
    }
    client.emit('error', { code: 'ERROR', message: 'Unexpected server error' });
  }
}
