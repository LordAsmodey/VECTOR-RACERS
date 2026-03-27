import { Transform } from 'class-transformer';
import { IsString, Length, Matches } from 'class-validator';

export class JoinRoomDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Length(6, 6)
  @Matches(/^[A-Z0-9]+$/)
  code!: string;

  @IsString()
  carId!: string;
}
