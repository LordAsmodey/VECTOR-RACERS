import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChampionshipEventSpecDto {
  @IsString()
  trackId!: string;

  @IsInt()
  @Min(0)
  order!: number;
}

export class CreateChampionshipDto {
  @IsString()
  name!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChampionshipEventSpecDto)
  events!: ChampionshipEventSpecDto[];

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsDateString()
  endAt?: string;
}
