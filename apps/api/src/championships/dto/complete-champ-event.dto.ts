import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChampEventResultRowDto {
  @IsString()
  userId!: string;

  @IsInt()
  @Min(1)
  finishPosition!: number;

  @IsInt()
  @Min(0)
  fastestLapMs!: number;
}

export class CompleteChampEventDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChampEventResultRowDto)
  results!: ChampEventResultRowDto[];
}
