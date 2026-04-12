import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChampionshipsController } from './championships.controller';
import { ChampionshipsService } from './championships.service';

@Module({
  imports: [AuthModule],
  controllers: [ChampionshipsController],
  providers: [ChampionshipsService],
})
export class ChampionshipsModule {}
