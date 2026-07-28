import type { Vec2 } from '@plan2quote/core';

/**
 * Tolerance used throughout the geometry package, in metres.
 *
 * 0.5 mm. Chosen because it is below the precision any architect draws to, but
 * above the float noise you get after a block transform chain, so two lines a
 * draughtsman meant to be coincident compare equal and two he meant to be
 * distinct do not.
 */
export const EPS = 5e-4;

export function sub(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(a: Vec2, k: number): Vec2 {
  return { x: a.x * k, y: a.y * k };
}

export function cross(a: Vec2, b: Vec2): number {
  return a.x * b.y - a.y * b.x;
}

export function dot(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function nearlyEqual(a: Vec2, b: Vec2, eps = EPS): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}

/**
 * Kahan-compensated sum.
 *
 * A floor slab can be a thousand short segments; naive accumulation of a
 * thousand `1e-3`-scale terms against a `1e3`-scale running total loses digits
 * exactly where a quantity surveyor would notice. This costs nothing and
 * removes the question.
 */
export function compensatedSum(values: Iterable<number>): number {
  let sum = 0;
  let c = 0;
  for (const v of values) {
    const y = v - c;
    const t = sum + y;
    c = t - sum - y;
    sum = t;
  }
  return sum;
}

/** Axis-aligned bounding box of a point set. Returns `null` for an empty set. */
export function bounds(points: readonly Vec2[]): { min: Vec2; max: Vec2 } | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}
