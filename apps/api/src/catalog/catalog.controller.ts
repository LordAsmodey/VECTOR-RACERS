import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('cars')
  @UseGuards(JwtAuthGuard)
  listCars() {
    return this.catalogService.listCars();
  }

  @Get('tracks')
  @UseGuards(JwtAuthGuard)
  listTracks() {
    return this.catalogService.listTracks();
  }
}
