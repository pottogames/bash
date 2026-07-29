import { describe, expect, it } from 'vitest';
import type { PlanEntity, Vec2 } from '@plan2quote/core';
import { measure } from '../src/measure.js';

let seq = 0;
const id = () => `e${++seq}`;

function polyline(vertices: Vec2[], closed: boolean, layerKey = 'L', blockPath: string[] = []): PlanEntity {
  return { id: id(), kind: 'polyline', layerKey, blockPath, vertices, closed };
}

function block(name: string, position: Vec2, layerKey = 'L', blockPath: string[] = []): PlanEntity {
  return { id: id(), kind: 'block', layerKey, blockPath, name, position, rotation: 0, scale: { x: 1, y: 1 } };
}

function circle(center: Vec2, radius: number, layerKey = 'L', blockPath: string[] = []): PlanEntity {
  return { id: id(), kind: 'circle', layerKey, blockPath, center, radius };
}

const rect = (w: number, h: number, ox = 0, oy = 0): Vec2[] => [
  { x: ox, y: oy },
  { x: ox + w, y: oy },
  { x: ox + w, y: oy + h },
  { x: ox, y: oy + h },
];

describe('measure — length', () => {
  it('sums polyline perimeters and open runs', () => {
    const result = measure(
      [
        polyline(rect(5, 4), true),
        polyline([{ x: 0, y: 0 }, { x: 3, y: 4 }], false),
      ],
      { measureType: 'length' },
    );
    expect(result.value).toBe(23); // 18 + 5
    expect(result.provenance).toHaveLength(2);
  });

  it('includes circle circumference and arc length', () => {
    const arc: PlanEntity = {
      id: id(),
      kind: 'arc',
      layerKey: 'L',
      blockPath: [],
      center: { x: 0, y: 0 },
      radius: 4,
      startAngle: 0,
      endAngle: Math.PI / 2,
    };
    const result = measure([circle({ x: 0, y: 0 }, 2), arc], { measureType: 'length' });
    expect(result.value).toBeCloseTo(2 * Math.PI * 2 + 2 * Math.PI, 10);
  });

  it('ignores text, points and dimensions', () => {
    const text: PlanEntity = {
      id: id(),
      kind: 'text',
      layerKey: 'L',
      blockPath: [],
      position: { x: 0, y: 0 },
      value: 'סלון',
      height: 0.25,
      rotation: 0,
    };
    const result = measure([polyline(rect(5, 4), true), text], { measureType: 'length' });
    expect(result.value).toBe(18);
    expect(result.provenance).toHaveLength(1);
  });

  it('warns instead of throwing on a one-point polyline', () => {
    const result = measure([polyline([{ x: 1, y: 1 }], false)], { measureType: 'length' });
    expect(result.value).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('degenerate_geometry');
  });
});

describe('measure — area', () => {
  it('measures a single room', () => {
    const result = measure([polyline(rect(5, 4), true)], { measureType: 'area' });
    expect(result.value).toBe(20);
  });

  it('subtracts a shaft drawn inside a slab on the same layer', () => {
    const result = measure([polyline(rect(10, 10), true), polyline(rect(2, 2, 4, 4), true)], {
      measureType: 'area',
    });
    expect(result.value).toBe(96);
    expect(result.warnings.some((w) => w.message.includes('חור'))).toBe(true);
  });

  it('adds both rings when nesting subtraction is switched off', () => {
    const result = measure([polyline(rect(10, 10), true), polyline(rect(2, 2, 4, 4), true)], {
      measureType: 'area',
      subtractNestedRings: false,
    });
    expect(result.value).toBe(104);
  });

  it('resolves hatch islands', () => {
    const hatch: PlanEntity = {
      id: id(),
      kind: 'hatch',
      layerKey: 'L',
      blockPath: [],
      loops: [{ vertices: rect(10, 10) }, { vertices: rect(3, 3, 1, 1) }],
    };
    const result = measure([hatch], { measureType: 'area' });
    expect(result.value).toBe(91);
  });

  it('auto-closes a negligible gap and says so', () => {
    const nearlyClosed = [...rect(10, 10), { x: 0, y: 0.0002 }];
    const result = measure([polyline(nearlyClosed, false)], { measureType: 'area' });
    expect(result.value).toBeCloseTo(100, 3);
    expect(result.warnings.map((w) => w.code)).toContain('open_polygon_autoclosed');
  });

  it('skips a genuinely open polyline rather than inventing a room', () => {
    const open = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const result = measure([polyline(open, false)], { measureType: 'area' });
    expect(result.value).toBe(0);
  });

  it('flags a self-intersecting polygon', () => {
    const bowtie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    const result = measure([polyline(bowtie, true)], { measureType: 'area' });
    expect(result.warnings.map((w) => w.code)).toContain('self_intersecting_polygon');
  });
});

describe('measure — count', () => {
  it('counts block instances, not the lines their symbol is made of', () => {
    // A socket symbol is a block containing several lines. Counting geometry
    // would give 6; counting inserts gives 2, which is what gets installed.
    const entities: PlanEntity[] = [
      block('SOCKET', { x: 0, y: 0 }),
      block('SOCKET', { x: 5, y: 0 }),
      polyline([{ x: 0, y: 0 }, { x: 0.1, y: 0 }], false, 'L', ['SOCKET']),
      polyline([{ x: 0, y: 0 }, { x: 0, y: 0.1 }], false, 'L', ['SOCKET']),
      polyline([{ x: 5, y: 0 }, { x: 5.1, y: 0 }], false, 'L', ['SOCKET']),
    ];
    const result = measure(entities, { measureType: 'count' });
    expect(result.value).toBe(2);
  });

  it('falls back to points when there are no blocks', () => {
    const pt: PlanEntity = { id: id(), kind: 'point', layerKey: 'L', blockPath: [], position: { x: 1, y: 1 } };
    const pt2: PlanEntity = { id: id(), kind: 'point', layerKey: 'L', blockPath: [], position: { x: 2, y: 2 } };
    expect(measure([pt, pt2], { measureType: 'count' }).value).toBe(2);
  });

  it('counts bare circles as a last resort and warns about it', () => {
    const result = measure([circle({ x: 0, y: 0 }, 1), circle({ x: 5, y: 0 }, 1)], {
      measureType: 'count',
    });
    expect(result.value).toBe(2);
    expect(result.warnings.some((w) => w.message.includes('עיגולים'))).toBe(true);
  });

  it('reports an empty layer rather than a silent zero', () => {
    const text: PlanEntity = {
      id: id(),
      kind: 'text',
      layerKey: 'L',
      blockPath: [],
      position: { x: 0, y: 0 },
      value: 'x',
      height: 1,
      rotation: 0,
    };
    const result = measure([text], { measureType: 'count' });
    expect(result.value).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('empty_layer');
  });
});

describe('measure — volume', () => {
  it('extrudes a slab footprint upward', () => {
    const result = measure([polyline(rect(5, 4), true)], { measureType: 'volume', height: 0.2 });
    expect(result.value).toBeCloseTo(4, 10);
  });

  it('extrudes a wall centreline with a thickness', () => {
    const wall = polyline([{ x: 0, y: 0 }, { x: 10, y: 0 }], false);
    const result = measure([wall], { measureType: 'volume', height: 2.8, thickness: 0.2 });
    expect(result.value).toBeCloseTo(5.6, 10);
  });

  it('refuses to guess a height', () => {
    const result = measure([polyline(rect(5, 4), true)], { measureType: 'volume' });
    expect(result.value).toBe(0);
    expect(result.warnings[0]!.message).toContain('גובה');
  });
});

describe('measure — weight', () => {
  it('declines to derive weight from geometry', () => {
    const result = measure([polyline(rect(5, 4), true)], { measureType: 'weight' });
    expect(result.value).toBe(0);
    expect(result.warnings[0]!.message).toContain('צפיפות');
  });
});

describe('measure — duplicates', () => {
  it('excludes a wall copied onto itself', () => {
    const a = polyline(rect(5, 4), true);
    const b = polyline(rect(5, 4), true);
    const result = measure([a, b], { measureType: 'area' });
    expect(result.value).toBe(20);
    expect(result.duplicatesExcluded).toHaveLength(1);
    expect(result.warnings.map((w) => w.code)).toContain('duplicate_geometry');
  });

  it('catches a duplicate traced from a different corner and direction', () => {
    const a = polyline(rect(5, 4), true);
    const shifted = [...rect(5, 4).slice(2), ...rect(5, 4).slice(0, 2)].reverse();
    const b = polyline(shifted, true);
    const result = measure([a, b], { measureType: 'length' });
    expect(result.value).toBe(18);
  });

  it('keeps both when duplicate exclusion is switched off', () => {
    const result = measure([polyline(rect(5, 4), true), polyline(rect(5, 4), true)], {
      measureType: 'area',
      excludeDuplicates: false,
    });
    expect(result.value).toBe(40);
  });

  it('does not treat two genuinely different rooms as duplicates', () => {
    const result = measure([polyline(rect(5, 4), true), polyline(rect(5, 4, 100, 0), true)], {
      measureType: 'area',
    });
    expect(result.value).toBe(40);
    expect(result.duplicatesExcluded).toHaveLength(0);
  });
});
