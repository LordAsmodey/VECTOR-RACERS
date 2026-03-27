import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedUserContext } from '../auth/strategies/jwt.strategy';
import { CreateRoomDto } from './dto/create-room.dto';
import { JoinRoomDto } from './dto/join-room.dto';
import { PublicRoomsQueryDto } from './dto/public-rooms-query.dto';
import { RoomsService } from './rooms.service';

type AuthedRequest = { user: AuthenticatedUserContext };

const ROOMS_VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UsePipes(ROOMS_VALIDATION_PIPE)
  create(@Request() req: AuthedRequest, @Body() dto: CreateRoomDto) {
    return this.roomsService.create(req.user.userId, dto);
  }

  @Post('join')
  @UseGuards(JwtAuthGuard)
  @UsePipes(ROOMS_VALIDATION_PIPE)
  join(@Request() req: AuthedRequest, @Body() dto: JoinRoomDto) {
    return this.roomsService.join(req.user.userId, dto);
  }

  @Get('public')
  @UsePipes(ROOMS_VALIDATION_PIPE)
  listPublic(@Query() query: PublicRoomsQueryDto) {
    return this.roomsService.listPublic(query);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Param('id') id: string) {
    return this.roomsService.findOne(id);
  }
}
