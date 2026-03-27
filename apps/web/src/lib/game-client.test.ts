import { describe, expect, it } from "vitest";

import {
  GAME_STATE_RECONCILE_POSITION_THRESHOLD_WORLD,
  maxCarPositionDriftWorld,
} from "./game-client";

const baseCar = {
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  laps: 0,
  mid: false,
  prog: 0,
  offTrack: false,
};

describe("maxCarPositionDriftWorld", () => {
  it("returns 0 for identical maps", () => {
    expect(
      maxCarPositionDriftWorld({ a: baseCar }, { a: baseCar }),
    ).toBe(0);
  });

  it("returns Euclidean distance for one car delta", () => {
    expect(
      maxCarPositionDriftWorld(
        { a: baseCar },
        { a: { ...baseCar, x: 3, y: 4 } },
      ),
    ).toBe(5);
  });

  it("returns Infinity when a user id is missing on one side", () => {
    expect(
      maxCarPositionDriftWorld({ a: baseCar }, { b: baseCar }),
    ).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("TASK-011 threshold constant", () => {
  it("matches vector-racers-tasks.md reconciliation note (2 world units)", () => {
    expect(GAME_STATE_RECONCILE_POSITION_THRESHOLD_WORLD).toBe(2);
  });
});
