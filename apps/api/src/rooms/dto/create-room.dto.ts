import { Type } from 'class-transformer';
import { IsInt, IsString, Max, Min } from 'class-validator';

export class CreateRoomDto {
  @IsString()
  trackId!: string;

  @IsString()
  carId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(6)
  maxPlayers!: number;
}
