import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { INestApplicationContext } from '@nestjs/common';
import { Server, ServerOptions } from 'socket.io';
import Redis from 'ioredis';

/**
 * Horizontally scales Socket.io via Redis pub/sub (TASK-010).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapter: ReturnType<typeof createAdapter> | null = null;

  constructor(app: INestApplicationContext) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL?.trim();
    if (!url) {
      throw new Error(
        'REDIS_URL is required for the Socket.io Redis adapter (TASK-010).',
      );
    }
    const pubClient = new Redis(url, { maxRetriesPerRequest: 3 });
    const subClient = pubClient.duplicate();
    this.adapter = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    if (this.adapter) {
      server.adapter(this.adapter);
    }
    return server;
  }
}
