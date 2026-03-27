import type { CarState, CarStats, MoveInput, TrackDef } from "./types";

type TrackWithCarStats = TrackDef & Partial<CarStats>;

type TrackProgressResult = { progress: number; distSq: number };

function hypot2(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function getClosestCenterLineSegment(
  x: number,
  y: number,
  waypoints: TrackDef["waypoints"],
  segmentLengths: number[],
  prefixLengths: number[]
): {
  segmentIndex: number;
  // Parametric projection on segment, clamped to [0, 1].
  t: number;
  // Squared distance from point to closest point on that segment.
  distSq: number;
  // Distance along cyclic polyline to projected point.
  along: number;
} | null {
  const n = waypoints.length;
  if (n < 2) return null;

  let best:
    | {
        segmentIndex: number;
        t: number;
        distSq: number;
        along: number;
      }
    | null = null;

  const eps = 1e-12;

  for (let i = 0; i < n; i++) {
    const [ax, ay] = waypoints[i]!;
    const [bx, by] = waypoints[(i + 1) % n]!;

    const abx = bx - ax;
    const aby = by - ay;
    const apx = x - ax;
    const apy = y - ay;
    const denom = abx * abx + aby * aby;

    let t = 0;
    if (denom > 0) {
      t = (apx * abx + apy * aby) / denom;
      t = clamp01(t);
    }

    const px = ax + abx * t;
    const py = ay + aby * t;
    const dx = x - px;
    const dy = y - py;
    const distSq = dx * dx + dy * dy;

    const len = segmentLengths[i]!;
    const along = prefixLengths[i]! + len * t;

    if (!best) {
      best = { segmentIndex: i, t, distSq, along };
      continue;
    }

    const distDiff = distSq - best.distSq;
    if (distDiff < -eps) {
      best = { segmentIndex: i, t, distSq, along };
      continue;
    }

    if (Math.abs(distDiff) <= eps) {
      // Deterministic tie-break: choose smaller segment index.
      if (i < best.segmentIndex) {
        best = { segmentIndex: i, t, distSq, along };
      }
    }
  }

  return best;
}

/**
 * Deterministic progress along cyclic center-line polyline.
 * Returns progress in [0..1) and the squared distance to the closest segment.
 */
export function trackProgress(
  x: number,
  y: number,
  waypoints: TrackDef["waypoints"]
): TrackProgressResult {
  const n = waypoints.length;
  if (n < 2) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  const segmentLengths: number[] = new Array(n).fill(0);
  const prefixLengths: number[] = new Array(n).fill(0);
  let totalLength = 0;

  for (let i = 0; i < n; i++) {
    const [ax, ay] = waypoints[i]!;
    const [bx, by] = waypoints[(i + 1) % n]!;

    const len = hypot2(bx - ax, by - ay);
    segmentLengths[i] = len;
    prefixLengths[i] = totalLength;
    totalLength += len;
  }

  if (totalLength <= 0) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  const closest = getClosestCenterLineSegment(x, y, waypoints, segmentLengths, prefixLengths);
  if (!closest) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  let p = closest.along / totalLength;
  if (p >= 1 - 1e-12) p = 0;
  p = clamp01(p);

  return { progress: p, distSq: closest.distSq };
}

function getCarStats(track: TrackWithCarStats): CarStats {
  // TASK-008 tests pass car stats via extra fields on `track`.
  // In production these may come from game state; we default to 1 to keep applyMove robust.
  return {
    speed: track.speed ?? 1,
    acceleration: track.acceleration ?? 1,
    grip: track.grip ?? 1,
    mass: track.mass ?? 1,
  };
}

export function applyMove(state: CarState, input: MoveInput, track: TrackDef): CarState {
  const stats = getCarStats(track as TrackWithCarStats);

  const MAX_THRUST = 82 * stats.speed;
  const thrustMag = hypot2(input.inputX, input.inputY);
  const thrustNorm = MAX_THRUST > 0 ? clamp(thrustMag / MAX_THRUST, 0, 1) : 0;

  const MAX_INERTIA = 0.74 * (1 - stats.grip * 0.4);
  const inertiaRate = stats.mass;
  const inertia = Math.min(MAX_INERTIA, inertiaRate * thrustNorm);

  const offTrackPenalty = 0.4;

  // Compute off-track state before movement to apply penalty to ctrl.
  const { distSq: distSqNow } = trackProgress(state.x, state.y, track.waypoints);
  const halfWidthSq = track.halfWidth * track.halfWidth;
  const offTrackNow = distSqNow > halfWidthSq;

  const ctrlBase = (1 - inertia) * stats.acceleration;
  const ctrlEffective = offTrackNow ? ctrlBase * (1 - offTrackPenalty) : ctrlBase;

  // Velocity update (pure kinematics; deterministic with a fixed step).
  const vxNew = state.vx + input.inputX * ctrlEffective;
  const vyNew = state.vy + input.inputY * ctrlEffective;

  const xNew = state.x + vxNew;
  const yNew = state.y + vyNew;

  // Progress / lap counting after movement.
  const { progress: newProg, distSq: distSqNew } = trackProgress(xNew, yNew, track.waypoints);

  const offTrackNew = distSqNew > halfWidthSq;

  const prevMid = state.mid;
  const prevProg = state.prog;

  let newLaps = state.laps;
  let newMid = newProg > 0.42;

  if (prevMid && prevProg > 0.82 && newProg < 0.18) {
    newLaps += 1;
    newMid = false;
  }

  return {
    x: xNew,
    y: yNew,
    vx: vxNew,
    vy: vyNew,
    laps: newLaps,
    mid: newMid,
    prog: newProg,
    offTrack: offTrackNew,
  };
}

/*
import type { CarState, CarStats, MoveInput, TrackDef } from "./types";

type TrackForPhysics = TrackDef & Partial<CarStats>;

const OFFTRACK_PENALTY = 0.4;
const MID_THRESHOLD = 0.42;
const LAP_MID_EXIT_PROG_THRESHOLD = 0.82;
const LAP_MID_REENTRY_PROG_THRESHOLD = 0.18;

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function clamp01(n: number): number {
  return clamp(n, 0, 1);
}

function hypot2(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function isFiniteNumber(n: number): boolean {
  return Number.isFinite(n);
}

function resolveCarStats(track: TrackForPhysics): Required<CarStats> {
  const speedRaw = track.speed;
  const accelerationRaw = track.acceleration;
  const gripRaw = track.grip;
  const massRaw = track.mass;

  const speed = typeof speedRaw === "number" && isFiniteNumber(speedRaw) ? speedRaw : 1;
  const acceleration =
    typeof accelerationRaw === "number" && isFiniteNumber(accelerationRaw) ? accelerationRaw : 1;
  const grip = typeof gripRaw === "number" && isFiniteNumber(gripRaw) ? gripRaw : 0.5;
  const mass = typeof massRaw === "number" && isFiniteNumber(massRaw) ? massRaw : 1;

  return {
    speed: clamp01(speed),
    acceleration: clamp01(acceleration),
    grip: clamp01(grip),
    mass: clamp01(mass),
  };
}

function resolveClampedInput(input: MoveInput, maxThrust: number): { x: number; y: number } {
  const ix = isFiniteNumber(input.inputX) ? input.inputX : 0;
  const iy = isFiniteNumber(input.inputY) ? input.inputY : 0;
  const mag = Math.hypot(ix, iy);
  if (mag <= 0 || maxThrust <= 0) return { x: 0, y: 0 };
  if (mag <= maxThrust) return { x: ix, y: iy };

  const scale = maxThrust / mag;
  return { x: ix * scale, y: iy * scale };
}

type ClosestSegmentResult = {
  segmentIndex: number;
  // Parametric projection on segment, clamped to [0, 1].
  t: number;
  // Squared distance from point to closest point on that segment.
  distSq: number;
  // Distance along cyclic polyline to projected point.
  along: number;
};

function getClosestCenterLineSegment(
  x: number,
  y: number,
  waypoints: TrackDef["waypoints"],
  segmentLengths: number[],
  prefixLengths: number[],
): ClosestSegmentResult | null {
  const n = waypoints.length;
  if (n < 2) return null;

  let best: ClosestSegmentResult | null = null;
  // Epsilon for deterministic tie-breaks in floating comparisons.
  const eps = 1e-12;

  for (let i = 0; i < n; i++) {
    const [ax, ay] = waypoints[i]!;
    const [bx, by] = waypoints[(i + 1) % n]!;
    const abx = bx - ax;
    const aby = by - ay;
    const apx = x - ax;
    const apy = y - ay;
    const denom = abx * abx + aby * aby;

    let t = 0;
    if (denom > 0) {
      t = (apx * abx + apy * aby) / denom;
      t = clamp01(t);
    }

    const px = ax + abx * t;
    const py = ay + aby * t;
    const dx = x - px;
    const dy = y - py;
    const distSq = dx * dx + dy * dy;

    const len = segmentLengths[i]!;
    const along = prefixLengths[i]! + len * t;

    if (!best) {
      best = { segmentIndex: i, t, distSq, along };
      continue;
    }

    const distDiff = distSq - best.distSq;
    if (distDiff < -eps) {
      best = { segmentIndex: i, t, distSq, along };
      continue;
    }

    if (Math.abs(distDiff) <= eps) {
      // Deterministic tie-break: choose smaller segment index.
      if (i < best.segmentIndex) {
        best = { segmentIndex: i, t, distSq, along };
      }
    }
  }

  return best;
}

function trackProgress(x: number, y: number, track: TrackDef): { progress: number; distSq: number } {
  const waypoints = track.waypoints;
  const n = waypoints.length;
  if (n < 2) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  const segmentLengths: number[] = new Array(n).fill(0);
  const prefixLengths: number[] = new Array(n).fill(0);
  let totalLength = 0;
  for (let i = 0; i < n; i++) {
    const [ax, ay] = waypoints[i]!;
    const [bx, by] = waypoints[(i + 1) % n]!;
    const len = hypot2(bx - ax, by - ay);
    segmentLengths[i] = len;
    prefixLengths[i] = totalLength;
    totalLength += len;
  }

  if (totalLength <= 0) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  const closest = getClosestCenterLineSegment(x, y, waypoints, segmentLengths, prefixLengths);
  if (!closest) return { progress: 0, distSq: Number.POSITIVE_INFINITY };

  // Normalize 0..1 along cyclic path. Ensure stable wrap: 1 -> 0.
  let p = closest.along / totalLength;
  if (p >= 1 - 1e-12) p = 0;
  p = clamp01(p);

  return { progress: p, distSq: closest.distSq };
}

export function applyMove(state: CarState, input: MoveInput, track: TrackForPhysics): CarState {
  const car = resolveCarStats(track);

  const maxThrust = 82 * car.speed;
  const clampedInput = resolveClampedInput(input, maxThrust);
  const inputMag = Math.hypot(clampedInput.x, clampedInput.y);

  // Inertia model: deterministic, grip-limited by MAX_INERTIA and accumulated via inertiaRate=mass.
  // Using normalized thrust request so stronger inputs increase inertia consistently.
  const maxInertia = 0.74 * (1 - car.grip * 0.4);
  const inertiaCap = Math.max(0, maxInertia);
  const thrustNorm = maxThrust > 0 ? clamp01(inputMag / maxThrust) : 0;
  const inertiaRate = car.mass;
  const inertia = clamp(inertiaRate * thrustNorm, 0, inertiaCap);

  // Control effectiveness.
  const ctrl = (1 - inertia) * car.acceleration;

  const { distSq: prevDistSq } = trackProgress(state.x, state.y, track);
  const offTrackNow = prevDistSq > track.halfWidth * track.halfWidth;

  const offTrackPenalty = OFFTRACK_PENALTY;
  const ctrlEffective = ctrl * (offTrackNow ? 1 - offTrackPenalty : 1);

  const ax = clampedInput.x * ctrlEffective;
  const ay = clampedInput.y * ctrlEffective;

  // Discrete time step integration (deterministic): update velocity then position.
  const vxNew = state.vx + ax;
  const vyNew = state.vy + ay;
  const xNew = state.x + vxNew;
  const yNew = state.y + vyNew;

  const { progress: newProg, distSq: newDistSq } = trackProgress(xNew, yNew, track);
  const offTrackNew = newDistSq > track.halfWidth * track.halfWidth;

  const prevProg = state.prog;
  const prevMid = state.mid;
  let laps = state.laps;
  let mid = newProg > MID_THRESHOLD;

  const lapIncrement =
    prevMid &&
    prevProg > LAP_MID_EXIT_PROG_THRESHOLD &&
    newProg < LAP_MID_REENTRY_PROG_THRESHOLD;

  if (lapIncrement) {
    laps += 1;
    mid = false;
  }

  // If lap counter reached/exceeded lapCount, keep counting deterministically; clamping is out of scope.

  return {
    x: xNew,
    y: yNew,
    vx: vxNew,
    vy: vyNew,
    laps,
    mid,
    prog: newProg,
    offTrack: offTrackNew,
  };
}

*/

