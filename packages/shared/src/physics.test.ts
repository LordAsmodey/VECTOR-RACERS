import { describe, expect, it } from "vitest";

import { applyMove } from "./physics";
import type { CarState, CarStats, MoveInput, TrackDef } from "./types";

type TrackForPhysics = TrackDef & Partial<CarStats>;

function buildTrack(
  waypoints: [number, number][],
  halfWidth: number,
  lapCount: number,
  stats?: Partial<CarStats>,
): TrackForPhysics {
  return {
    waypoints,
    halfWidth,
    lapCount,
    ...(stats ?? {}),
  };
}

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

type TrackProgressResult = { progress: number; distSq: number };

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

function trackProgress(x: number, y: number, track: TrackDef): TrackProgressResult {
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

  let p = closest.along / totalLength;
  if (p >= 1 - 1e-12) p = 0;
  p = clamp01(p);

  return { progress: p, distSq: closest.distSq };
}

function speedOf(state: CarState): number {
  return Math.hypot(state.vx, state.vy);
}

function mkState(partial: Omit<CarState, "offTrack"> & { offTrack?: boolean }): CarState {
  return {
    x: partial.x,
    y: partial.y,
    vx: partial.vx,
    vy: partial.vy,
    laps: partial.laps,
    mid: partial.mid,
    prog: partial.prog,
    offTrack: partial.offTrack ?? false,
  };
}

describe("physics.applyMove (deterministic)", () => {
  const squareWaypoints: [number, number][] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
  ];

  it("Car stays on track when moving slowly", () => {
    const track = buildTrack(squareWaypoints, 1, 10, {
      speed: 1,
      acceleration: 0.25,
      grip: 0.5,
      mass: 1,
    });

    let state = mkState({
      x: 5,
      y: 0,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    });

    const input: MoveInput = { inputX: 0.2, inputY: 0 };

    for (let i = 0; i < 10; i++) {
      state = applyMove(state, input, track);
      expect(state.offTrack).toBe(false);
    }
  });

  it("Car overshoots bend at high speed", () => {
    const track = buildTrack(squareWaypoints, 1, 10, {
      speed: 1,
      acceleration: 1,
      grip: 0.5,
      mass: 1,
    });

    // Start near the bottom-right corner, aligned with bottom segment.
    let state = mkState({
      x: 9.5,
      y: 0,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    });

    const input: MoveInput = { inputX: 1, inputY: 0 };
    const s1 = applyMove(state, input, track);
    const s2 = applyMove(s1, input, track);

    // After a couple of steps the car should exit the track because it keeps moving “straight”.
    expect(s1.offTrack).toBe(false);
    expect(s2.offTrack).toBe(true);
  });

  it("Lap counter increments after full lap (mid exit/reentry)", () => {
    const track = buildTrack(squareWaypoints, 1, 10, {
      speed: 1,
      acceleration: 1,
      grip: 0.5,
      mass: 1,
    });

    // Crafted so that:
    // prev_prog > 0.82 and prev_mid=true, and applying input=0 moves to new_prog < 0.18.
    const x0 = 0;
    const y0 = 6.8; // progress ~= 0.83
    const initialProg = trackProgress(x0, y0, track).progress;

    expect(initialProg).toBeGreaterThan(0.82);

    // Target after one move (input=0): xNew=1, yNew=0 -> new_prog ~= 0.025
    const xNew = 1;
    const yNew = 0;

    const state = mkState({
      x: x0,
      y: y0,
      vx: xNew - x0,
      vy: yNew - y0,
      laps: 0,
      mid: true,
      prog: initialProg,
      offTrack: false,
    });

    const input: MoveInput = { inputX: 0, inputY: 0 };
    const next = applyMove(state, input, track);

    expect(next.laps).toBe(1);
    expect(next.mid).toBe(false);
    expect(next.offTrack).toBe(false);

    // Extra guard: lap increment should have re-entered with new_prog < 0.18.
    const nextProg = trackProgress(next.x, next.y, track).progress;
    expect(nextProg).toBeLessThan(0.18);
  });

  it("Off-track penalty reduces speed gain (ctrl multiplier 0.6)", () => {
    const track = buildTrack(squareWaypoints, 1, 10, {
      speed: 1,
      acceleration: 1,
      grip: 0.5,
      mass: 1,
    });

    const input: MoveInput = { inputX: 2, inputY: 0 };

    const onTrack = mkState({
      x: 5,
      y: 0,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    });

    const offTrack = mkState({
      x: 5,
      y: 1.5, // dist ~= 1.5 > halfWidth => offTrackNow=true
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    });

    const nextOn = applyMove(onTrack, input, track);
    const nextOff = applyMove(offTrack, input, track);

    expect(nextOn.offTrack).toBe(false);
    expect(nextOff.offTrack).toBe(true);

    const speedOn = speedOf(nextOn);
    const speedOff = speedOf(nextOff);

    // offTrackPenalty=0.4 => ctrlEffective multiplier is 0.6 (physics.ts).
    expect(speedOff).toBeCloseTo(speedOn * 0.6, 10);
  });

  it("High-grip car has less inertia (bigger speed gain)", () => {
    const input: MoveInput = { inputX: 82, inputY: 0 };

    const init = mkState({
      x: 5,
      y: 0,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    });

    // Using thrustMag=maxThrust => thrustNorm=1, so inertia clamps to inertiaCap
    // and depends only on grip (see physics.ts).
    const trackLowGrip = buildTrack(squareWaypoints, 2, 10, {
      speed: 1,
      acceleration: 1,
      grip: 0,
      mass: 1,
    });

    const trackHighGrip = buildTrack(squareWaypoints, 2, 10, {
      speed: 1,
      acceleration: 1,
      grip: 1,
      mass: 1,
    });

    const nextLow = applyMove(init, input, trackLowGrip);
    const nextHigh = applyMove(init, input, trackHighGrip);

    const speedLow = speedOf(nextLow);
    const speedHigh = speedOf(nextHigh);

    expect(speedHigh).toBeGreaterThan(speedLow);

    const inertiaLow = 0.74 * (1 - 0 * 0.4);
    const inertiaHigh = 0.74 * (1 - 1 * 0.4);
    const ctrlLow = (1 - inertiaLow) * 1;
    const ctrlHigh = (1 - inertiaHigh) * 1;
    const expectedRatio = ctrlHigh / ctrlLow;

    expect(speedHigh / speedLow).toBeCloseTo(expectedRatio, 10);
  });
});

