import type { Vec2 } from '@plan2quote/core';
import { distance, EPS } from './vec.js';

/**
 * Arc handling.
 *
 * DXF polylines encode curved segments as a *bulge* on the starting vertex:
 * `bulge = tan(θ/4)`, where θ is the arc's included angle, positive when the
 * arc turns counter-clockwise from the start vertex to the next one.
 *
 * Everything below works from that identity in closed form. We never tessellate
 * in order to measure — a 64-segment approximation of a circle is 0.16% short,
 * which on a 300 m² curved balcony is half a square metre of flooring somebody
 * pays for. Tessellation exists here only for drawing on a canvas.
 */

export interface ArcGeometry {
  center: Vec2;
  radius: number;
  /** Signed included angle in radians. Negative means the arc turns clockwise. */
  includedAngle: number;
  startAngle: number;
  endAngle: number;
}

/** Resolves a bulge-encoded polyline segment into explicit arc geometry. */
export function bulgeToArc(from: Vec2, to: Vec2, bulge: number): ArcGeometry | null {
  if (bulge === 0) return null;
  const chord = distance(from, to);
  if (chord <= EPS) return null;

  const includedAngle = 4 * Math.atan(bulge);
  const half = includedAngle / 2;
  const sinHalf = Math.sin(half);
  if (Math.abs(sinHalf) < 1e-12) return null;

  const radius = chord / (2 * sinHalf);

  // Centre sits on the chord's perpendicular bisector, offset by the apothem.
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const dirX = (to.x - from.x) / chord;
  const dirY = (to.y - from.y) / chord;
  // Perpendicular, rotated +90°.
  const apothem = radius * Math.cos(half);
  const center: Vec2 = { x: midX - dirY * apothem, y: midY + dirX * apothem };

  const startAngle = Math.atan2(from.y - center.y, from.x - center.x);
  const endAngle = Math.atan2(to.y - center.y, to.x - center.x);

  return { center, radius: Math.abs(radius), includedAngle, startAngle, endAngle };
}

/** Exact arc length of a bulged segment. Falls back to the chord when `bulge` is 0. */
export function bulgeSegmentLength(from: Vec2, to: Vec2, bulge: number): number {
  const chord = distance(from, to);
  if (bulge === 0) return chord;
  const includedAngle = 4 * Math.atan(bulge);
  const sinHalf = Math.sin(includedAngle / 2);
  if (Math.abs(sinHalf) < 1e-12) return chord;
  const radius = Math.abs(chord / (2 * sinHalf));
  return radius * Math.abs(includedAngle);
}

/**
 * Signed area of the circular segment cut off by a bulged chord.
 *
 * `A = R²/2 · (θ − sin θ)`. The expression is odd in θ, so the sign already
 * matches the ring's winding: adding it to the shoelace sum of the vertices
 * gives the exact area of a polyline with curved sides.
 */
export function bulgeSegmentArea(from: Vec2, to: Vec2, bulge: number): number {
  if (bulge === 0) return 0;
  const chord = distance(from, to);
  if (chord <= EPS) return 0;
  const theta = 4 * Math.atan(bulge);
  const sinHalf = Math.sin(theta / 2);
  if (Math.abs(sinHalf) < 1e-12) return 0;
  const radius = chord / (2 * sinHalf);
  return (radius * radius * (theta - Math.sin(theta))) / 2;
}

/** Arc length between two angles on a circle, respecting sweep direction. */
export function arcLength(radius: number, startAngle: number, endAngle: number): number {
  return radius * normalisedSweep(startAngle, endAngle);
}

/** Counter-clockwise sweep from `start` to `end`, always in `[0, 2π)`. */
export function normalisedSweep(startAngle: number, endAngle: number): number {
  const TAU = Math.PI * 2;
  let sweep = endAngle - startAngle;
  while (sweep < 0) sweep += TAU;
  while (sweep >= TAU) sweep -= TAU;
  return sweep;
}

/**
 * Points along an arc, dense enough that the chord never deviates from the true
 * arc by more than `tolerance` metres. For rendering only — measurement uses the
 * closed forms above.
 */
export function tessellateArc(
  center: Vec2,
  radius: number,
  startAngle: number,
  sweep: number,
  tolerance = 0.002,
): Vec2[] {
  if (radius <= 0) return [];
  // Sagitta of one segment: s = R(1 − cos(Δ/2)). Solve for Δ at s = tolerance.
  const ratio = Math.max(-1, Math.min(1, 1 - tolerance / radius));
  const maxStep = 2 * Math.acos(ratio);
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(maxStep, 1e-6)));
  const out: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = startAngle + (sweep * i) / steps;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}
