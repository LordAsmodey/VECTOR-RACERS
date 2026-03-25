import { Injectable } from '@nestjs/common';
import { VECTOR_RACERS_SHARED_VERSION } from '@vector-racers/shared';

@Injectable()
export class AppService {
  getHello(): string {
    return `Vector Racers API — @vector-racers/shared ${VECTOR_RACERS_SHARED_VERSION}`;
  }
}
