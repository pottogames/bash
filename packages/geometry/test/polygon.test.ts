import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@plan2quote/core';
import {
  isEffectivelyClosed,
  isSelfIntersecting,
  netAreaOfLoops,
  pathLength,
  pointInPolygon,
  ringArea,
  ringContains,
  signedArea,
} from '../src/polygon.js';

const rect = (w: number, h: number, ox = 0, oy = 0): Vec2[] => [
  { x: ox, y: oy },
  { x: ox + w, y: oy },
  { x: ox + w, y: oy + h },
  { x: ox, y: oy + h },
];

describe('signedArea', () => {
  it('measures a 5×4 rectangle as 20 m²', () => {
    expect(signedArea(rect(5, 4))).toBe(20);
  });

  it('is negative for clockwise winding', () => {
    expect(signedArea([...rect(5, 4)].reverse())).toBe(-20);
  });

  it('is zero for fewer than three vertices', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0);
  });

  it('measures a right triangle exactly', () => {
    expect(signedArea([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }])).toBe(6);
  });

  it('stays exact on site coordinates', () => {
    // The whole point of translating to the first vertex: at Israeli grid
    // coordinates the textbook shoelace form differences two ~4·10¹⁰ products
    // to recover 20, and loses most of its significant digits doing it.
    expect(signedArea(rect(5, 4, 220_000, 630_000))).toBeCloseTo(20, 9);
  });

  it('handles an L-shaped room', () => {
    // 10×10 square with a 4×4 bite taken out of the top-right corner.
    const l: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 6 },
      { x: 6, y: 6 },
      { x: 6, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(signedArea(l)).toBe(84);
  });
});

describe('pathLength', () => {
  it('measures the perimeter of a 5×4 rectangle as 18 m', () => {
    expect(pathLength({ vertices: rect(5, 4) }, true)).toBe(18);
  });

  it('omits the closing side when the chain is open', () => {
    expect(pathLength({ vertices: rect(5, 4) }, false)).toBe(14);
  });

  it('is zero for a single point', () => {
    expect(pathLength({ vertices: [{ x: 1, y: 1 }] }, true)).toBe(0);
  });
});

describe('pointInPolygon', () => {
  const square = rect(10, 10);

  it('accepts an interior point', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
  });

  it('rejects an exterior point', () => {
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false);
  });

  it('is not confused by a ray passing exactly through vertices', () => {
    // y = 0 and y = 10 are vertex rows. On a rectilinear plan every vertex sits
    // on a round coordinate, so this case is the norm rather than an edge case.
    expect(pointInPolygon({ x: 5, y: 0.0001 }, square)).toBe(true);
    expect(pointInPolygon({ x: -1, y: 0 }, square)).toBe(false);
    expect(pointInPolygon({ x: 15, y: 10 }, square)).toBe(false);
  });

  it('handles a concave polygon', () => {
    const arrow: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(pointInPolygon({ x: 2, y: 5 }, arrow)).toBe(true);
    expect(pointInPolygon({ x: 8, y: 5 }, arrow)).toBe(false);
  });
});

describe('ringContains', () => {
  it('detects a shaft inside a slab', () => {
    expect(ringContains(rect(10, 10), rect(2, 2, 4, 4))).toBe(true);
  });

  it('rejects a disjoint ring', () => {
    expect(ringContains(rect(10, 10), rect(2, 2, 40, 40))).toBe(false);
  });

  it('rejects a partially overlapping ring', () => {
    expect(ringContains(rect(10, 10), rect(4, 4, 8, 8))).toBe(false);
  });

  it('does not treat a coincident ring as contained', () => {
    // Same outline pasted twice: every sample lies on the boundary, so nothing
    // is decisive and we must not report containment.
    expect(ringContains(rect(10, 10), rect(10, 10))).toBe(false);
  });
});

describe('netAreaOfLoops', () => {
  it('subtracts a hole', () => {
    const net = netAreaOfLoops([{ vertices: rect(10, 10) }, { vertices: rect(2, 2, 4, 4) }]);
    expect(net).toBe(96);
  });

  it('handles an island inside a hole (even-odd nesting)', () => {
    // 10×10 slab, 6×6 opening, 2×2 pier standing in the opening.
    const net = netAreaOfLoops([
      { vertices: rect(10, 10) },
      { vertices: rect(6, 6, 2, 2) },
      { vertices: rect(2, 2, 4, 4) },
    ]);
    expect(net).toBe(100 - 36 + 4);
  });

  it('adds two disjoint rooms', () => {
    const net = netAreaOfLoops([{ vertices: rect(5, 4) }, { vertices: rect(3, 2, 20, 20) }]);
    expect(net).toBe(26);
  });

  it('ignores degenerate loops', () => {
    const net = netAreaOfLoops([{ vertices: rect(5, 4) }, { vertices: [{ x: 0, y: 0 }] }]);
    expect(net).toBe(20);
  });
});

describe('isSelfIntersecting', () => {
  it('flags a bow tie', () => {
    const bowtie: Vec2[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(isSelfIntersecting(bowtie)).toBe(true);
  });

  it('passes a simple rectangle', () => {
    expect(isSelfIntersecting(rect(5, 4))).toBe(false);
  });

  it('passes a concave but simple polygon', () => {
    expect(
      isSelfIntersecting([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 5 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    ).toBe(false);
  });
});

describe('isEffectivelyClosed', () => {
  it('accepts a sub-millimetre gap on a long ring', () => {
    const almost = [...rect(10, 10), { x: 0, y: 0.0003 }];
    expect(isEffectivelyClosed(almost)).toBe(true);
  });

  it('rejects a gap large enough to be intentional', () => {
    const open = [...rect(10, 10), { x: 0, y: 3 }];
    expect(isEffectivelyClosed(open)).toBe(false);
  });
});

describe('ringArea with bulges', () => {
  it('measures a full circle expressed as two bulged segments', () => {
    // The DXF idiom for a circular polyline: two vertices, bulge 1 on each,
    // giving two half-turns. Diameter 10 → area 25π.
    const area = ringArea({
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      bulges: [1, 1],
    });
    expect(area).toBeCloseTo(Math.PI * 25, 10);
  });

  it('adds the bay window bulge to a rectangle', () => {
    // 10×4 room whose 10 m side bows out by a half-circle of radius 5.
    const straight = ringArea({ vertices: rect(10, 4) });
    const bowed = ringArea({
      vertices: rect(10, 4),
      // Segment 2 runs from (10,4) to (0,4); a bulge of 1 sweeps it outward.
      bulges: [0, 0, 1, 0],
    });
    expect(straight).toBe(40);
    expect(bowed).toBeCloseTo(40 + (Math.PI * 25) / 2, 9);
  });

  it('is unaffected by zero bulges', () => {
    expect(ringArea({ vertices: rect(5, 4), bulges: [0, 0, 0, 0] })).toBe(20);
  });
});
