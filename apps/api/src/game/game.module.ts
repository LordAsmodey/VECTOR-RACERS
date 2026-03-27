import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RoomsModule } from '../rooms/rooms.module';
import { GameGateway } from './game.gateway';
import { GameService } from './game.service';
import { JwtWsGuard } from './guards/jwt-ws.guard';

@Module({
  imports: [RedisModule, AuthModule, RoomsModule],
  providers: [GameService, GameGateway, JwtWsGuard],
})
export class GameModule {}
