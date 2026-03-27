"use client";

import type React from "react";
import { useCallback, useEffect, useRef } from "react";
import {
  applyMove,
  type CarState,
  type CarStats,
  type MoveInput,
  type TrackDef,
} from "@vector-racers/shared";

/** TASK-012: CarState plus stable id for trails and labels (zip from `GameStatePayload`). */
export type TrackRendererCar = CarState & {
  playerId: string;
  label?: string;
};

export interface TrackRendererProps {
  track: TrackDef;
  cars: TrackRendererCar[];
  currentPlayerId: string;
  /** Drag / thrust UI only when local user may submit a move. */
  localPlayerId: string;
  carStatsByUserId?: Record<string, CarStats>;
  onMoveInput: (input: MoveInput) => void;
  className?: string;
  style?: React.CSSProperties;
}

const TRAIL_MAX = 55;
const MAX_THRUST_BASE = 82;
const GRID_SPACING_CSS = 24;
const DESIGN_BG = "#020308";
const NEON_CYAN = "#00f5ff";
const NEON_MAGENTA = "#ff2ea6";
const NEON_LIME = "#7fff5a";
const TRACK_FILL = "rgba(0, 255, 136, 0.07)";
const TRACK_EDGE_OUTER = "#00ff88";
const TRACK_EDGE_INNER = "#00cc6a";

function dedupeClosedLoop(wp: [number, number][]): [number, number][] {
  if (wp.length < 2) return wp;
  const a = wp[0]!;
  const b = wp[wp.length - 1]!;
  if (a[0] === b[0] && a[1] === b[1]) return wp.slice(0, -1);
  return wp;
}

/** Offset a closed centerline perpendicular to smoothed tangents (vertex bisectors). */
function offsetClosedLoop(
  waypoints: [number, number][],
  halfWidth: number,
  side: 1 | -1,
): [number, number][] {
  const n = waypoints.length;
  if (n < 2) return [];
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const prev = waypoints[(i - 1 + n) % n]!;
    const cur = waypoints[i]!;
    const next = waypoints[(i + 1) % n]!;
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    const nx = -ty * side;
    const ny = tx * side;
    out.push([cur[0] + nx * halfWidth, cur[1] + ny * halfWidth]);
  }
  return out;
}

function worldBounds(
  track: TrackDef,
  center: [number, number][],
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const pad = track.halfWidth * 1.35 + 48;
  for (const [x, y] of center) {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + pad);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 400, minY: 0, maxY: 400 };
  }
  return { minX, maxX, minY, maxY };
}

function mergeTrackWithStats(
  track: TrackDef,
  stats: CarStats | undefined,
): TrackDef & Partial<CarStats> {
  if (!stats) return track;
  return {
    ...track,
    speed: stats.speed,
    acceleration: stats.acceleration,
    grip: stats.grip,
    mass: stats.mass,
  };
}

function maxThrust(stats: CarStats | undefined): number {
  const s = stats?.speed ?? 1;
  return MAX_THRUST_BASE * s;
}

function pushTrailSample(
  map: Map<string, [number, number][]>,
  id: string,
  x: number,
  y: number,
): void {
  let buf = map.get(id);
  if (!buf) {
    buf = [];
    map.set(id, buf);
  }
  const last = buf[buf.length - 1];
  if (last && last[0] === x && last[1] === y) return;
  buf.push([x, y]);
  while (buf.length > TRAIL_MAX) buf.shift();
}

type ViewTransform = {
  minX: number;
  minY: number;
  scale: number;
  padX: number;
  padY: number;
};

function makeView(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  cssW: number,
  cssH: number,
  inset: number,
): ViewTransform {
  const gw = Math.max(bounds.maxX - bounds.minX, 1);
  const gh = Math.max(bounds.maxY - bounds.minY, 1);
  const cw = Math.max(cssW - inset * 2, 1);
  const ch = Math.max(cssH - inset * 2, 1);
  const scale = Math.min(cw / gw, ch / gh);
  const usedW = gw * scale;
  const usedH = gh * scale;
  const padX = (cssW - usedW) / 2;
  const padY = (cssH - usedH) / 2;
  return { minX: bounds.minX, minY: bounds.minY, scale, padX, padY };
}

function cssToWorld(v: ViewTransform, x: number, y: number): { x: number; y: number } {
  return {
    x: (x - v.padX) / v.scale + v.minX,
    y: (y - v.padY) / v.scale + v.minY,
  };
}

function drawGridDots(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = "rgba(0, 245, 255, 0.07)";
  for (let x = 0; x < w; x += GRID_SPACING_CSS) {
    for (let y = 0; y < h; y += GRID_SPACING_CSS) {
      ctx.beginPath();
      ctx.arc(x + 0.5, y + 0.5, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function strokeNeonPath(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  color: string,
  lineWidth: number,
  glow: boolean,
): void {
  if (pts.length < 2) return;
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = 12;
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function fillTrackCorridor(
  ctx: CanvasRenderingContext2D,
  outer: [number, number][],
  inner: [number, number][],
): void {
  if (outer.length < 2 || inner.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(outer[0]![0], outer[0]![1]);
  for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i]![0], outer[i]![1]);
  ctx.closePath();
  ctx.moveTo(inner[0]![0], inner[0]![1]);
  for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i]![0], inner[i]![1]);
  ctx.closePath();
  ctx.fillStyle = TRACK_FILL;
  ctx.fill("evenodd");
}

function drawCheckeredStartLine(
  ctx: CanvasRenderingContext2D,
  wp: [number, number][],
  halfWidth: number,
): void {
  if (wp.length < 2) return;
  const a = wp[0]!;
  const b = wp[1]!;
  let dx = b[0] - a[0];
  let dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const nx = -dy;
  const ny = dx;
  const mx = (a[0] + b[0]) * 0.5;
  const my = (a[1] + b[1]) * 0.5;
  const cells = 5;
  const step = (2 * halfWidth) / cells;
  const alongSpan = Math.min(len * 0.14, halfWidth * 0.5);
  for (let i = 0; i < cells; i++) {
    const off = -halfWidth + (i + 0.5) * step;
    const cx = mx + nx * off;
    const cy = my + ny * off;
    const even = i % 2 === 0;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.atan2(dy, dx));
    ctx.fillStyle = even ? "rgba(255,255,255,0.92)" : "rgba(20,20,24,0.95)";
    ctx.fillRect(-alongSpan / 2, -step * 0.45, alongSpan, step * 0.9);
    ctx.restore();
  }
}

function drawCar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  accent: string,
  body: string,
  isSelf: boolean,
  offTrack: boolean,
): void {
  const heading = Math.atan2(vy, vx || 1e-6);
  const rw = isSelf ? 14 : 11;
  const rh = 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(heading);
  if (offTrack) {
    ctx.strokeStyle = "#ff4466";
    ctx.lineWidth = 2;
    ctx.strokeRect(-rw - 2, -rh - 2, (rw + 2) * 2, (rh + 2) * 2);
  }
  ctx.fillStyle = body;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(-rw, -rh, rw * 2, rh * 2, 3);
  } else {
    ctx.rect(-rw, -rh, rw * 2, rh * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.95;
  ctx.beginPath();
  ctx.moveTo(rw - 2, -3);
  ctx.lineTo(rw + 5, 0);
  ctx.lineTo(rw - 2, 3);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(rw - 2, 2);
  ctx.lineTo(rw + 4, 4);
  ctx.lineTo(rw - 2, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawThrustBar(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  pct: number,
): void {
  const w = 10;
  const h = Math.min(140, cssH * 0.35);
  const x = 16;
  const y = cssH - h - 20;
  ctx.save();
  ctx.fillStyle = "rgba(13, 17, 28, 0.85)";
  ctx.strokeStyle = "rgba(0, 245, 255, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, w + 4, h + 28, 4);
  } else {
    ctx.rect(x, y, w + 4, h + 28);
  }
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(x + 2, y + 8, w, h);
  const fillH = h * Math.max(0, Math.min(1, pct));
  const grd = ctx.createLinearGradient(x, y + h, x, y);
  grd.addColorStop(0, NEON_MAGENTA);
  grd.addColorStop(1, NEON_CYAN);
  ctx.fillStyle = grd;
  ctx.fillRect(x + 2, y + 8 + (h - fillH), w, fillH);
  ctx.fillStyle = "rgba(232, 244, 255, 0.85)";
  ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("THRUST", x + w / 2 + 2, y + h + 22);
  ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
  ctx.fillText(`${Math.round(pct * 100)}%`, x + w / 2 + 2, y + h + 36);
  ctx.restore();
}

export function TrackRenderer({
  track,
  cars,
  currentPlayerId,
  localPlayerId,
  carStatsByUserId,
  onMoveInput,
  className,
  style,
}: TrackRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef<TrackRendererProps>({
    track,
    cars,
    currentPlayerId,
    localPlayerId,
    carStatsByUserId,
    onMoveInput,
    className,
    style,
  });
  propsRef.current = {
    track,
    cars,
    currentPlayerId,
    localPlayerId,
    carStatsByUserId,
    onMoveInput,
    className,
    style,
  };

  const trailsRef = useRef<Map<string, [number, number][]>>(new Map());
  const dragRef = useRef<{ pointerId: number } | null>(null);
  const previewRef = useRef<{ ix: number; iy: number; thrustPct: number } | null>(null);
  const rafRef = useRef<number>(0);
  const resizeCanvas = useCallback(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const w = el.clientWidth;
    const h = el.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.width / dpr;
    const cssH = canvas.height / dpr;

    const p = propsRef.current;
    const center = dedupeClosedLoop(p.track.waypoints);
    const bounds = worldBounds(p.track, center);
    const view = makeView(bounds, cssW, cssH, 12);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = DESIGN_BG;
    ctx.fillRect(0, 0, cssW, cssH);
    drawGridDots(ctx, cssW, cssH);

    ctx.save();
    ctx.translate(view.padX, view.padY);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.minX, -view.minY);

    const outer = offsetClosedLoop(center, p.track.halfWidth, 1);
    const inner = offsetClosedLoop(center, p.track.halfWidth, -1);
    fillTrackCorridor(ctx, outer, inner);
    strokeNeonPath(ctx, outer, TRACK_EDGE_OUTER, 2.2 / view.scale, true);
    strokeNeonPath(ctx, inner, TRACK_EDGE_INNER, 1.6 / view.scale, true);

    ctx.save();
    ctx.setLineDash([6 / view.scale, 10 / view.scale]);
    ctx.globalAlpha = 0.35;
    strokeNeonPath(ctx, [...center, center[0]!], TRACK_EDGE_OUTER, 1 / view.scale, false);
    ctx.restore();

    drawCheckeredStartLine(ctx, p.track.waypoints, p.track.halfWidth);

    const myCar = p.cars.find((c) => c.playerId === p.localPlayerId);
    const stats = myCar ? p.carStatsByUserId?.[p.localPlayerId] : undefined;
    const merged = mergeTrackWithStats(p.track, stats);

    for (const car of p.cars) {
      const isSelf = car.playerId === p.localPlayerId;
      const buf = trailsRef.current.get(car.playerId);
      if (buf && buf.length > 1) {
        ctx.save();
        ctx.strokeStyle = isSelf ? "rgba(255,46,166,0.45)" : "rgba(127,255,90,0.4)";
        ctx.lineWidth = 3 / view.scale;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(buf[0]![0], buf[0]![1]);
        for (let i = 1; i < buf.length; i++) ctx.lineTo(buf[i]![0], buf[i]![1]);
        ctx.stroke();
        ctx.restore();
      }
    }

    const canAim = p.localPlayerId === p.currentPlayerId && myCar;
    const preview = previewRef.current;

    if (canAim && myCar) {
      const ghost = applyMove(myCar, { inputX: 0, inputY: 0 }, merged);
      ctx.save();
      ctx.globalAlpha = 0.38;
      drawCar(ctx, ghost.x, ghost.y, ghost.vx, ghost.vy, NEON_CYAN, "#1a3d44", true, ghost.offTrack);
      ctx.restore();
      ctx.fillStyle = NEON_CYAN;
      ctx.font = `${10 / view.scale}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("INERTIA", ghost.x, ghost.y + 14 / view.scale);
    }

    if (canAim && myCar && preview) {
      const land = applyMove(
        myCar,
        { inputX: preview.ix, inputY: preview.iy },
        merged,
      );
      ctx.save();
      ctx.strokeStyle = NEON_CYAN;
      ctx.lineWidth = 2 / view.scale;
      ctx.shadowColor = NEON_CYAN;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(land.x, land.y, 6 / view.scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = NEON_CYAN;
      ctx.beginPath();
      ctx.arc(land.x, land.y, 2.5 / view.scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = NEON_MAGENTA;
      ctx.lineWidth = 2.5 / view.scale;
      ctx.lineCap = "round";
      ctx.shadowColor = NEON_MAGENTA;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(myCar.x, myCar.y);
      const tipX = myCar.x + preview.ix;
      const tipY = myCar.y + preview.iy;
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
      const ang = Math.atan2(preview.iy, preview.ix);
      const ah = 10 / view.scale;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(
        tipX - ah * Math.cos(ang - 0.45),
        tipY - ah * Math.sin(ang - 0.45),
      );
      ctx.lineTo(
        tipX - ah * Math.cos(ang + 0.45),
        tipY - ah * Math.sin(ang + 0.45),
      );
      ctx.closePath();
      ctx.fillStyle = NEON_MAGENTA;
      ctx.fill();
      ctx.restore();
    }

    for (const car of p.cars) {
      const isSelf = car.playerId === p.localPlayerId;
      const accent = isSelf ? NEON_MAGENTA : NEON_LIME;
      const body = isSelf ? "#6b1a4a" : "#1e3d1a";
      drawCar(ctx, car.x, car.y, car.vx, car.vy, accent, body, isSelf, car.offTrack);
      const label =
        car.label ??
        (isSelf ? "YOU" : car.playerId.slice(0, 6).toUpperCase());
      ctx.save();
      const fontPx = 11 / view.scale;
      ctx.font = `bold ${fontPx}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const ly = car.y - 16 / view.scale;
      const tw = ctx.measureText(label).width + 8 / view.scale;
      const th = 12 / view.scale;
      ctx.fillStyle = isSelf ? NEON_MAGENTA : NEON_LIME;
      ctx.fillRect(car.x - tw / 2, ly - th / 2, tw, th);
      ctx.fillStyle = DESIGN_BG;
      ctx.fillText(label, car.x, ly);
      ctx.restore();
    }

    ctx.restore();

    const thrustPct =
      preview?.thrustPct ??
      (myCar ? Math.min(1, Math.hypot(myCar.vx, myCar.vy) / (maxThrust(stats) || 1)) : 0);
    drawThrustBar(ctx, cssW, cssH, thrustPct);
  }, []);

  useEffect(() => {
    let alive = true;
    const loop = () => {
      if (!alive) return;
      const p = propsRef.current;
      for (const car of p.cars) {
        pushTrailSample(trailsRef.current, car.playerId, car.x, car.y);
      }
      paint();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      alive = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [paint]);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(() => {
      resizeCanvas();
      paint();
    });
    ro.observe(containerRef.current);
    resizeCanvas();
    paint();
    return () => ro.disconnect();
  }, [paint, resizeCanvas]);

  const pointerToWorld = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const lx = ((ev.clientX - rect.left) * canvas.width) / rect.width / dpr;
      const ly = ((ev.clientY - rect.top) * canvas.height) / rect.height / dpr;
      const cssW = canvas.width / dpr;
      const cssH = canvas.height / dpr;
      const center = dedupeClosedLoop(propsRef.current.track.waypoints);
      const bounds = worldBounds(propsRef.current.track, center);
      const view = makeView(bounds, cssW, cssH, 12);
      return cssToWorld(view, lx, ly);
    },
    [],
  );

  const onPointerDown = useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    const p = propsRef.current;
    if (p.localPlayerId !== p.currentPlayerId) return;
    const my = p.cars.find((c) => c.playerId === p.localPlayerId);
    if (!my) return;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    dragRef.current = { pointerId: ev.pointerId };
  }, []);

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const p = propsRef.current;
      if (p.localPlayerId !== p.currentPlayerId) return;
      const my = p.cars.find((c) => c.playerId === p.localPlayerId);
      if (!my || !dragRef.current) return;
      const w = pointerToWorld(ev);
      if (!w) return;
      let ix = w.x - my.x;
      let iy = w.y - my.y;
      const stats = p.carStatsByUserId?.[p.localPlayerId];
      const maxT = maxThrust(stats);
      const mag = Math.hypot(ix, iy);
      let thrustPct = maxT > 0 ? Math.min(1, mag / maxT) : 0;
      if (mag > maxT && maxT > 0) {
        ix = (ix / mag) * maxT;
        iy = (iy / mag) * maxT;
        thrustPct = 1;
      }
      previewRef.current = { ix, iy, thrustPct };
    },
    [pointerToWorld],
  );

  const onPointerUp = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== ev.pointerId) return;
      dragRef.current = null;
      const prev = previewRef.current;
      previewRef.current = null;
      const p = propsRef.current;
      if (p.localPlayerId !== p.currentPlayerId) return;
      if (prev && (prev.ix !== 0 || prev.iy !== 0)) {
        p.onMoveInput({ inputX: prev.ix, inputY: prev.iy });
      }
      try {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      } catch {
        /* ignore */
      }
    },
    [],
  );

  const onPointerCancel = useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    dragRef.current = null;
    previewRef.current = null;
    try {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "16 / 10",
        minHeight: 200,
        background: DESIGN_BG,
        cursor: localPlayerId === currentPlayerId ? "crosshair" : "default",
        touchAction: "none",
        userSelect: "none",
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  );
}
