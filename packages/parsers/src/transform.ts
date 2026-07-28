import type { Vec2 } from '@plan2quote/core';

/**
 * 2-D affine transforms, used to place block contents into model space.
 *
 * Blocks nest — a flat contains a kitchen block contains a tap block — and each
 * level carries its own position, rotation and scale. Composing them as
 * matrices rather than applying position/rotation/scale in sequence is what
 * keeps a rotated block inside a mirrored block inside a scaled block landing
 * where AutoCAD draws it.
 *
 * Layout is `[a c e; b d f]`, the same convention as SVG and canvas.
 */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** `first` then `second`, i.e. the matrix product `second × first`. */
export function compose(second: Matrix, first: Matrix): Matrix {
  return {
    a: second.a * first.a + second.c * first.b,
    b: second.b * first.a + second.d * first.b,
    c: second.a * first.c + second.c * first.d,
    d: second.b * first.c + second.d * first.d,
    e: second.a * first.e + second.c * first.f + second.e,
    f: second.b * first.e + second.d * first.f + second.f,
  };
}

export function applyMatrix(m: Matrix, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** The transform a DXF INSERT applies: translate ∘ rotate ∘ scale. */
export function insertMatrix(position: Vec2, rotationRadians: number, scaleX: number, scaleY: number): Matrix {
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  return {
    a: cos * scaleX,
    b: sin * scaleX,
    c: -sin * scaleY,
    d: cos * scaleY,
    e: position.x,
    f: position.y,
  };
}

/**
 * Uniform scale factor implied by a matrix, taken as the geometric mean of the
 * two axis scales. Used for radii and text heights.
 *
 * When the axes differ, a circle genuinely becomes an ellipse and no single
 * radius is correct — the caller checks `isAnisotropic` and warns rather than
 * pretending otherwise.
 */
export function uniformScale(m: Matrix): number {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  return Math.sqrt(sx * sy);
}

export function isAnisotropic(m: Matrix, tolerance = 0.01): boolean {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  if (sx === 0 || sy === 0) return false;
  return Math.abs(sx - sy) / Math.max(sx, sy) > tolerance;
}

/** Rotation the matrix imposes, in radians. Added to arc start/end angles. */
export function rotationOf(m: Matrix): number {
  return Math.atan2(m.b, m.a);
}

/**
 * `true` when the transform flips handedness (a negative scale on exactly one
 * axis). A mirrored block reverses arc sweep direction, and getting that wrong
 * turns a door swing inside out.
 */
export function isMirrored(m: Matrix): boolean {
  return m.a * m.d - m.b * m.c < 0;
}
