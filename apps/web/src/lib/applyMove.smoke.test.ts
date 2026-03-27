import { describe, expect, it } from "vitest";

import { applyMove } from "@vector-racers/shared";
import type { CarStats, TrackDef } from "@vector-racers/shared";

describe("apps/web smoke: shared physics import", () => {
  function clone<T>(value: T): T {
    if (typeof globalThis.structuredClone === "function") {
      return globalThis.structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  it("applyMove is deterministic and does not mutate inputs", () => {
    const waypoints: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];

    // Note: TrackDef in shared requires `waypoints`, `halfWidth`, `lapCount`.
    // We additionally pass optional CarStats fields because physics.ts supports TrackDef & Partial<CarStats>.
    const track: TrackDef & Partial<CarStats> = {
      waypoints,
      halfWidth: 1,
      lapCount: 10,
      speed: 1,
      acceleration: 1,
      grip: 0.5,
      mass: 1,
    };

    const input = { inputX: 0.2, inputY: 0 };
    const state = {
      x: 5,
      y: 0,
      vx: 0,
      vy: 0,
      laps: 0,
      mid: false,
      prog: 0,
      offTrack: false,
    };

    const trackBefore = clone(track);
    const inputBefore = clone(input);
    const stateBefore = clone(state);

    const out1 = applyMove(state, input, track);

    // Side-effect check: inputs should remain unchanged.
    expect(state).toStrictEqual(stateBefore);
    expect(input).toStrictEqual(inputBefore);
    expect(track).toStrictEqual(trackBefore);

    // Determinism check: same args -> same output.
    const out2 = applyMove(stateBefore, inputBefore, trackBefore);
    expect(out1).toStrictEqual(out2);
  });
});

