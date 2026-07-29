import type { Vec2 } from '@plan2quote/core';
import { compensatedSum, cross, distance, EPS, nearlyEqual, sub } from './vec.js';
import { bulgeSegmentArea, bulgeSegmentLength } from './arc.js';

/**
 * Planar polygon measurement.
 *
 * Every routine here is exact arithmetic over the input coordinates. Nothing
 * samples, nothing approximates, nothing calls out to a service. Given the same
 * vertices you get the same number, today and in three years, which is the only
 * basis on which a subcontractor will ever trust a quantity he did not count
 * himself.
 */

/** A ring, optionally with a bulge per segment (bulge[i] applies from vertex i to i+1). */
export interface Ring {
  vertices: Vec2[];
  bulges?: number[];
}

/**
 * Shoelace signed area. Positive for counter-clockwise winding.
 *
 * Uses the `cross(p[i] - p[0], p[i+1] - p[0])` form rather than the textbook
 * `x[i]·y[i+1] − x[i+1]·y[i]`. They are algebraically identical, but translating
 * to the first vertex keeps the products small; on site coordinates in the
 * 200 000 range the textbook form differences two ~4·10¹⁰ numbers to recover a
 * value of order 10, and loses six significant digits doing it.
 */
export function signedArea(vertices: readonly Vec2[]): number {
  const n = vertices.length;
  if (n < 3) return 0;
  const origin = vertices[0]!;
  const terms: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    terms.push(cross(sub(vertices[i]!, origin), sub(vertices[i + 1]!, origin)));
  }
  return compensatedSum(terms) / 2;
}

/** Unsigned area of a closed ring, including bulge corrections when present. */
export function ringArea(ring: Ring): number {
  const base = signedArea(ring.vertices);
  return Math.abs(base + bulgeAreaCorrection(ring));
}

/** Signed sum of the circular segments cut off by every bulged side. */
export function bulgeAreaCorrection(ring: Ring): number {
  const { vertices, bulges } = ring;
  if (!bulges || bulges.length === 0) return 0;
  const n = vertices.length;
  const terms: number[] = [];
  for (let i = 0; i < n; i++) {
    const b = bulges[i];
    if (!b) continue;
    const from = vertices[i]!;
    const to = vertices[(i + 1) % n]!;
    terms.push(bulgeSegmentArea(from, to, b));
  }
  return compensatedSum(terms);
}

/** Total length along a vertex chain. Adds the closing side when `closed`. */
export function pathLength(ring: Ring, closed: boolean): number {
  const { vertices, bulges } = ring;
  const n = vertices.length;
  if (n < 2) return 0;
  const last = closed ? n : n - 1;
  const terms: number[] = [];
  for (let i = 0; i < last; i++) {
    const from = vertices[i]!;
    const to = vertices[(i + 1) % n]!;
    terms.push(bulgeSegmentLength(from, to, bulges?.[i] ?? 0));
  }
  return compensatedSum(terms);
}

/**
 * Point-in-polygon by crossing number.
 *
 * The `(yi > y) !== (yj > y)` guard counts each crossing exactly once even when
 * the ray passes through a vertex, which is the failure mode that makes naive
 * implementations misclassify points on a rectilinear plan — where vertices sit
 * on round coordinates and therefore collide with the ray constantly.
 */
export function pointInPolygon(point: Vec2, vertices: readonly Vec2[]): boolean {
  let inside = false;
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if (a.y > point.y !== b.y > point.y) {
      const t = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
      if (point.x < t) inside = !inside;
    }
  }
  return inside;
}

/** `true` when `point` lies within `tolerance` of any side of the ring. */
export function pointOnBoundary(point: Vec2, vertices: readonly Vec2[], tolerance = EPS): boolean {
  const n = vertices.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    if (distanceToSegment(point, vertices[j]!, vertices[i]!) <= tolerance) return true;
  }
  return false;
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

/**
 * Containment test used to build the island hierarchy.
 *
 * Vertices alone are not enough: two rings can share every vertex position and
 * still be different shapes. Edge midpoints are sampled as well, and any vertex
 * that sits *on* the outer boundary is ignored rather than counted as outside,
 * because coincident edges are normal in CAD hatch boundaries.
 */
export function ringContains(outer: readonly Vec2[], inner: readonly Vec2[]): boolean {
  if (outer.length < 3 || inner.length < 3) return false;
  const samples: Vec2[] = [];
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i]!;
    const b = inner[(i + 1) % inner.length]!;
    samples.push(a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  }
  let decisive = 0;
  for (const s of samples) {
    if (pointOnBoundary(s, outer)) continue;
    decisive++;
    if (!pointInPolygon(s, outer)) return false;
  }
  return decisive > 0;
}

/**
 * Net area of a set of boundary loops, using even-odd nesting.
 *
 * A loop nested at even depth adds; at odd depth it subtracts. This is what
 * makes a room with a lift shaft in it measure correctly, and it is derived
 * from containment rather than from the file's own outer/inner flags — CAD
 * exporters mislabel those often enough that trusting them costs real money.
 */
export function netAreaOfLoops(loops: readonly Ring[]): number {
  const usable = loops.filter((l) => l.vertices.length >= 3);
  if (usable.length === 0) return 0;

  const areas = usable.map((l) => ringArea(l));
  const depths = usable.map((_, i) =>
    usable.reduce(
      (depth, other, j) =>
        i !== j && areas[j]! > areas[i]! && ringContains(other.vertices, usable[i]!.vertices)
          ? depth + 1
          : depth,
      0,
    ),
  );

  return compensatedSum(areas.map((a, i) => (depths[i]! % 2 === 0 ? a : -a)));
}

/**
 * Reports self-intersection, which almost always means the polygon is not what
 * the draughtsman intended and its area is meaningless. O(n²), which is fine:
 * architectural rings are tens of vertices, not thousands.
 */
export function isSelfIntersecting(vertices: readonly Vec2[]): boolean {
  const n = vertices.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % n]!;
    for (let j = i + 1; j < n; j++) {
      // Skip adjacent sides — they share an endpoint by construction.
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsProperlyIntersect(a1, a2, vertices[j]!, vertices[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

function segmentsProperlyIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const d1 = cross(sub(p4, p3), sub(p1, p3));
  const d2 = cross(sub(p4, p3), sub(p2, p3));
  const d3 = cross(sub(p2, p1), sub(p3, p1));
  const d4 = cross(sub(p2, p1), sub(p4, p1));
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/**
 * Whether an open vertex chain is close enough to closed that treating it as a
 * polygon is safe. Architects routinely leave a sub-millimetre gap; refusing to
 * measure those would make the system useless, and closing gaps of arbitrary
 * size would make it wrong. `toleranceRatio` bounds the gap relative to the
 * ring's own perimeter, so the rule scales with the drawing.
 */
export function isEffectivelyClosed(vertices: readonly Vec2[], toleranceRatio = 0.001): boolean {
  if (vertices.length < 3) return false;
  const first = vertices[0]!;
  const last = vertices[vertices.length - 1]!;
  if (nearlyEqual(first, last)) return true;
  const gap = distance(first, last);
  const perimeter = pathLength({ vertices: [...vertices] }, false);
  if (perimeter <= 0) return false;
  return gap / perimeter <= toleranceRatio;
}
