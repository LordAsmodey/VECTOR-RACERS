import { Injectable } from '@nestjs/common';

/** Counters for observability (Prometheus can wrap these in TASK-022+). */
@Injectable()
export class RoomSyncMetrics {
  postgresSyncFailures = 0;
}
