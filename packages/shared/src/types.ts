/**
 * Shared gameplay/physics types.
 * No Prisma/DB runtime deps here (must be safe for client/server).
 */

export interface CarState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  laps: number;
  mid: boolean;
  prog: number;
  offTrack: boolean;
}

export interface MoveInput {
  inputX: number;
  inputY: number;
}

export interface CarStats {
  speed: number; // 0..1 multipliers
  acceleration: number; // 0..1 multipliers
  grip: number; // 0..1 multipliers
  mass: number; // 0..1 multipliers
}

export interface TrackDef {
  waypoints: [number, number][];
  halfWidth: number;
  lapCount: number;
}

/**
 * Race state over Socket.io (TASK-010 server → client payloads; TASK-011 client).
 */
export interface GameStatePayload {
  cars: Record<string, CarState>;
  /** Index into `playerOrder` for the player allowed to `submit_move`. */
  turnIndex: number;
  track: TrackDef;
  /** Monotonic per room; incremented after each accepted `submit_move`. */
  moveSeq: number;
  /** Same as `playerOrder[turnIndex]` when the race is active. */
  currentPlayerId: string;
  /** Turn order (matches server `StoredRaceGame.playerOrder`). */
  playerOrder: string[];
  /** Per-player car stats for client-side `applyMove` (same merge as server physics track). */
  carStatsByUserId: Record<string, CarStats>;
}

/** Row in `game_end` payload (TASK-010 / TASK-011). */
export interface GameEndResultRow {
  userId: string;
  laps: number;
  finishPosition: number;
}

/** One player row in `player_joined` Socket.io payload (TASK-010 / TASK-014). */
export interface RoomLobbyPlayer {
  userId: string;
  username: string;
  carId: string;
  position: number;
  laps: number;
  isReady: boolean;
}

/** One row in `Replay.movesJson` (TASK-004 / TASK-010). */
export interface ReplayMoveEntry {
  moveSeq: number;
  userId: string;
  input: MoveInput;
  resultingStateHash?: string;
}

