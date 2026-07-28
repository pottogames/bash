import { describe, expect, it } from 'vitest';
import { arcLength, bulgeSegmentArea, bulgeSegmentLength, bulgeToArc, normalisedSweep, tessellateArc } from '../src/arc.js';

describe('bulgeToArc', () => {
  it('resolves a semicircle', () => {
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    expect(arc).not.toBeNull();
    expect(arc!.radius).toBeCloseTo(5, 12);
    expect(arc!.center.x).toBeCloseTo(5, 12);
    expect(arc!.center.y).toBeCloseTo(0, 12);
    expect(arc!.includedAngle).toBeCloseTo(Math.PI, 12);
  });

  it('puts the centre on the other side for a negative bulge', () => {
    const ccw = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.5)!;
    const cw = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.5)!;
    expect(ccw.radius).toBeCloseTo(cw.radius, 12);
    expect(Math.sign(ccw.center.y)).toBe(-Math.sign(cw.center.y));
    expect(ccw.center.y).toBeCloseTo(-cw.center.y, 12);
  });

  it('returns null for a straight segment', () => {
    expect(bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBeNull();
  });

  it('returns null for a zero-length chord', () => {
    expect(bulgeToArc({ x: 3, y: 3 }, { x: 3, y: 3 }, 1)).toBeNull();
  });

  it('resolves a quarter arc to the expected radius', () => {
    // bulge = tan(θ/4); a 90° arc gives tan(22.5°).
    const bulge = Math.tan(Math.PI / 8);
    const arc = bulgeToArc({ x: 0, y: 0 }, { x: 10, y: 0 }, bulge)!;
    // Chord of a 90° arc is R√2, so R = 10/√2.
    expect(arc.radius).toBeCloseTo(10 / Math.SQRT2, 10);
    expect(arc.includedAngle).toBeCloseTo(Math.PI / 2, 10);
  });
});

describe('bulgeSegmentLength', () => {
  it('returns the chord for a straight segment', () => {
    expect(bulgeSegmentLength({ x: 0, y: 0 }, { x: 3, y: 4 }, 0)).toBe(5);
  });

  it('returns half a circumference for a semicircle', () => {
    expect(bulgeSegmentLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBeCloseTo(Math.PI * 5, 12);
  });

  it('is symmetric in the sign of the bulge', () => {
    const a = bulgeSegmentLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.4);
    const b = bulgeSegmentLength({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.4);
    expect(a).toBeCloseTo(b, 12);
  });

  it('exceeds the chord it spans', () => {
    const chord = 10;
    expect(bulgeSegmentLength({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.2)).toBeGreaterThan(chord);
  });
});

describe('bulgeSegmentArea', () => {
  it('is half a disc for a semicircle', () => {
    expect(bulgeSegmentArea({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBeCloseTo((Math.PI * 25) / 2, 10);
  });

  it('flips sign with the bulge', () => {
    const pos = bulgeSegmentArea({ x: 0, y: 0 }, { x: 10, y: 0 }, 0.3);
    const neg = bulgeSegmentArea({ x: 0, y: 0 }, { x: 10, y: 0 }, -0.3);
    expect(pos).toBeCloseTo(-neg, 12);
    expect(pos).toBeGreaterThan(0);
  });

  it('is zero without a bulge', () => {
    expect(bulgeSegmentArea({ x: 0, y: 0 }, { x: 10, y: 0 }, 0)).toBe(0);
  });
});

describe('arcLength and sweep', () => {
  it('measures a quarter circle', () => {
    expect(arcLength(4, 0, Math.PI / 2)).toBeCloseTo(2 * Math.PI, 12);
  });

  it('wraps a sweep that crosses the branch cut', () => {
    // From 350° to 10° is 20°, not −340°.
    const sweep = normalisedSweep((350 * Math.PI) / 180, (10 * Math.PI) / 180);
    expect(sweep).toBeCloseTo((20 * Math.PI) / 180, 12);
  });
});

describe('tessellateArc', () => {
  it('subdivides finely enough to stay within tolerance', () => {
    const tolerance = 0.002;
    const radius = 5;
    const pts = tessellateArc({ x: 0, y: 0 }, radius, 0, Math.PI * 2, tolerance);
    // The chord of one step must not deviate from the arc by more than the
    // tolerance: sagitta = R(1 − cos(Δ/2)).
    const step = (Math.PI * 2) / (pts.length - 1);
    const sagitta = radius * (1 - Math.cos(step / 2));
    expect(sagitta).toBeLessThanOrEqual(tolerance + 1e-12);
  });

  it('returns nothing for a degenerate radius', () => {
    expect(tessellateArc({ x: 0, y: 0 }, 0, 0, Math.PI)).toEqual([]);
  });

  it('closes the loop it was asked for', () => {
    const pts = tessellateArc({ x: 0, y: 0 }, 3, 0, Math.PI / 2);
    expect(pts[0]!.x).toBeCloseTo(3, 12);
    expect(pts.at(-1)!.y).toBeCloseTo(3, 12);
  });
});
