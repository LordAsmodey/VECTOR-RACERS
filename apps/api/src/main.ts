import './load-env';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './game/redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  // Prefer API_PORT so root `PORT` (often used by Next/other tools) does not collide with Nest.
  const raw = process.env.API_PORT ?? process.env.PORT;
  const port = Number(raw) || 3001;
  try {
    await app.listen(port);
    Logger.log(`Listening on http://localhost:${port}`, 'Bootstrap');
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'EADDRINUSE') {
      Logger.error(
        `Port ${port} is already in use — stop the old API (e.g. lsof -iTCP:${port} -sTCP:LISTEN, kill PID) or set API_PORT to a free port.`,
      );
    }
    throw err;
  }
}
bootstrap();
