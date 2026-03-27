import type { RoomStatus } from '@vector-racers/db';

/** Serialized JSON stored in Redis hash `room:{id}` field `payload`. */
export interface RoomPlayerSnapshot {
  userId: string;
  carId: string;
  position: number;
  laps: number;
  isReady: boolean;
}

export interface RoomRedisSnapshot {
  id: string;
  code: string;
  status: RoomStatus;
  trackId: string;
  maxPlayers: number;
  createdAt: string;
  players: RoomPlayerSnapshot[];
}
