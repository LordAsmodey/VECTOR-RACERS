import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from './redis/redis.module';
import { GameModule } from './game/game.module';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [RedisModule, AuthModule, RoomsModule, GameModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
