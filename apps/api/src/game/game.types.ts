import type { CarState, CarStats, GameStatePayload, TrackDef } from '@vector-racers/shared';

/** Persisted in Redis `game:{roomId}` while status is RACING. */
export interface StoredRaceGame {
  roomId: string;
  replayId: string;
  playerOrder: string[];
  race: {
    cars: Record<string, CarState>;
    turnIndex: number;
    track: TrackDef;
    moveSeq: number;
    carStatsByUserId: Record<string, CarStats>;
  };
}

export interface PlayerJoinedPlayer {
  userId: string;
  username: string;
  carId: string;
  position: number;
  laps: number;
  isReady: boolean;
}

export interface StateUpdatePayload {
  gameState: GameStatePayload;
  lastMove: { userId: string; input: { inputX: number; inputY: number } };
  moveSeq: number;
}

export interface GameEndResultRow {
  userId: string;
  laps: number;
  finishPosition: number;
}
