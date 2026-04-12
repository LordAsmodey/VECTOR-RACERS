import { ChampionshipStatus } from '@vector-racers/db';
import { IsEnum, IsOptional } from 'class-validator';

export class ListChampionshipsQueryDto {
  @IsOptional()
  @IsEnum(ChampionshipStatus)
  status?: ChampionshipStatus;
}
