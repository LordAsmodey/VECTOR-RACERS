import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChampionshipsService } from './championships.service';
import { CompleteChampEventDto } from './dto/complete-champ-event.dto';
import { CreateChampionshipDto } from './dto/create-championship.dto';
import { ListChampionshipsQueryDto } from './dto/list-championships-query.dto';

const CHAMP_VALIDATION_PIPE = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

@Controller('championships')
export class ChampionshipsController {
  constructor(private readonly championshipsService: ChampionshipsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @UsePipes(CHAMP_VALIDATION_PIPE)
  list(@Query() query: ListChampionshipsQueryDto) {
    return this.championshipsService.list(query);
  }

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UsePipes(CHAMP_VALIDATION_PIPE)
  create(@Body() dto: CreateChampionshipDto) {
    return this.championshipsService.create(dto);
  }

  @Get(':id/leaderboard')
  @UseGuards(JwtAuthGuard)
  leaderboard(@Param('id') id: string) {
    return this.championshipsService.getLeaderboard(id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  getOne(@Param('id') id: string) {
    return this.championshipsService.getById(id);
  }

  @Post(':id/start')
  @UseGuards(JwtAuthGuard, AdminGuard)
  start(@Param('id') id: string) {
    return this.championshipsService.startChampionship(id);
  }

  @Post(':id/events/:eventId/complete')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @UsePipes(CHAMP_VALIDATION_PIPE)
  completeEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body() dto: CompleteChampEventDto,
  ) {
    return this.championshipsService.completeChampEvent(id, eventId, dto);
  }
}
