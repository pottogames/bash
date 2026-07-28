import type { PlanEntity, Vec2 } from '@plan2quote/core';
import { EPS } from './vec.js';

/**
 * Duplicate-geometry detection.
 *
 * Drawings that have been through a few hands almost always contain doubled
 * entities — a line copied onto itself, a hatch pasted twice, a block exploded
 * without deleting the original. Nothing renders differently, so nobody
 * notices, and the quantity comes out exactly twice what it should be. This is
 * the single most common way a plan-derived take-off is wrong, and it is
 * entirely mechanical to catch.
 *
 * We never delete anything. Duplicates are reported, excluded from the default
 * sum, and listed in the UI so a human can put one back if the drawing really
 * did mean two coincident walls.
 */

/** Quantises to the tolerance grid so float noise cannot split a duplicate pair. */
function q(n: number): string {
  return (Math.round(n / EPS) * EPS).toFixed(4);
}

function qp(p: Vec2): string {
  return `${q(p.x)},${q(p.y)}`;
}

/**
 * A canonical string for an entity's shape, independent of how it is stored.
 *
 * Vertex chains are normalised for both starting point and direction, because a
 * rectangle traced clockwise from its top-right corner is the same rectangle as
 * one traced counter-clockwise from its bottom-left, and CAD copy operations
 * produce exactly that kind of difference.
 */
export function geometryKey(entity: PlanEntity): string | null {
  switch (entity.kind) {
    case 'polyline': {
      const pts = entity.vertices.map(qp);
      if (pts.length === 0) return null;
      return `poly:${entity.closed ? 'c' : 'o'}:${canonicalChain(pts, entity.closed)}`;
    }
    case 'circle':
      return `circ:${qp(entity.center)}:${q(entity.radius)}`;
    case 'arc':
      return `arc:${qp(entity.center)}:${q(entity.radius)}:${q(entity.startAngle)}:${q(entity.endAngle)}`;
    case 'point':
      return `pt:${qp(entity.position)}`;
    case 'block':
      return `blk:${entity.name}:${qp(entity.position)}:${q(entity.rotation)}:${q(entity.scale.x)}:${q(entity.scale.y)}`;
    case 'hatch':
      return `hatch:${entity.loops.map((l) => canonicalChain(l.vertices.map(qp), true)).sort().join('|')}`;
    // Text and dimensions are annotation; duplicating them costs nothing.
    default:
      return null;
  }
}

/**
 * Rotates a closed chain to start at its smallest element and picks the
 * lexicographically smaller of the two traversal directions. For open chains
 * only the direction is normalised — the endpoints are meaningful.
 */
function canonicalChain(points: string[], closed: boolean): string {
  if (points.length === 0) return '';
  const forward = closed ? rotateToMin(points) : points;
  const backward = closed ? rotateToMin([...points].reverse()) : [...points].reverse();
  const f = forward.join(';');
  const b = backward.join(';');
  return f <= b ? f : b;
}

function rotateToMin(points: string[]): string[] {
  let best = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i]! < points[best]!) best = i;
  }
  return [...points.slice(best), ...points.slice(0, best)];
}

export interface DuplicateGroup {
  key: string;
  /** The entity we keep. */
  keep: string;
  /** Entities identical to it, excluded from the sum. */
  dropped: string[];
}

/** Groups entities by canonical shape. Only groups with more than one member are returned. */
export function findDuplicates(entities: readonly PlanEntity[]): DuplicateGroup[] {
  const byKey = new Map<string, string[]>();
  for (const e of entities) {
    const key = geometryKey(e);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(e.id);
    else byKey.set(key, [e.id]);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, ids] of byKey) {
    if (ids.length > 1) groups.push({ key, keep: ids[0]!, dropped: ids.slice(1) });
  }
  return groups;
}
