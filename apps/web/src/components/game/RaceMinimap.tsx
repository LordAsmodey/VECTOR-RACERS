"use client";

import type { CarState, TrackDef } from "@vector-racers/shared";

export interface RaceMinimapProps {
  track: TrackDef;
  cars: Record<string, CarState>;
  /** Highlight this player dot. */
  highlightUserId?: string;
  className?: string;
}

function carColor(userId: string, highlight: boolean): string {
  if (highlight) {
    return "#ff2ea6";
  }
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h * 31 + userId.charCodeAt(i)!) >>> 0;
  }
  const hue = h % 360;
  return `hsl(${hue} 85% 58%)`;
}

export function RaceMinimap({
  track,
  cars,
  highlightUserId,
  className,
}: RaceMinimapProps) {
  const wp = track.waypoints;
  if (wp.length < 2) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of wp) {
    const [x, y] = p;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (const c of Object.values(cars)) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }

  const pad = track.halfWidth * 2 + 40;
  minX -= pad;
  maxX += pad;
  minY -= pad;
  maxY += pad;
  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;

  const toSvg = (x: number, y: number): [number, number] => [
    ((x - minX) / bw) * 200,
    ((y - minY) / bh) * 120,
  ];

  const linePts = wp
    .map(([x, y]) => {
      const [sx, sy] = toSvg(x, y);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className={className}
      viewBox="0 0 200 120"
      width={200}
      height={120}
      role="img"
      aria-label="Track minimap"
    >
      <title>Track minimap</title>
      <rect width="200" height="120" fill="rgba(2,3,8,0.85)" rx="6" />
      <polyline
        points={linePts}
        fill="none"
        stroke="rgba(0, 245, 255, 0.45)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {Object.entries(cars).map(([id, c]) => {
        const [cx, cy] = toSvg(c.x, c.y);
        const hi = id === highlightUserId;
        return (
          <circle
            key={id}
            cx={cx}
            cy={cy}
            r={hi ? 5 : 3.5}
            fill={carColor(id, hi)}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.5"
          />
        );
      })}
    </svg>
  );
}
