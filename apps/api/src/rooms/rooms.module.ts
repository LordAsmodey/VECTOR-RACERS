import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RedisModule } from '../redis/redis.module';
import { RoomSyncMetrics } from './room-sync.metrics';
import { RoomSyncService } from './room-sync.service';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule, RedisModule],
  controllers: [RoomsController],
  providers: [RoomsService, RoomSyncService, RoomSyncMetrics],
  exports: [RoomsService, RoomSyncService],
})
export class RoomsModule {}
