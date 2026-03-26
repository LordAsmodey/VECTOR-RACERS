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

