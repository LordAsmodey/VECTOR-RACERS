import { IsNotEmpty, IsString, Length } from 'class-validator';

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  @Length(32, 2048)
  refreshToken!: string;
}
