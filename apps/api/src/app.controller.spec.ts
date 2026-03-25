import { Test, TestingModule } from '@nestjs/testing';
import { VECTOR_RACERS_SHARED_VERSION } from '@vector-racers/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return health string with shared package version', () => {
      expect(appController.getHello()).toBe(
        `Vector Racers API — @vector-racers/shared ${VECTOR_RACERS_SHARED_VERSION}`,
      );
    });
  });
});
