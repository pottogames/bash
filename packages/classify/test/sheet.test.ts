import { describe, expect, it } from 'vitest';
import type { PlanEntity, Vec2 } from '@plan2quote/core';
import { detectSheetKind } from '../src/sheet.js';

let seq = 0;
const id = () => `s${++seq}`;

function text(value: string): PlanEntity {
  return {
    id: id(),
    kind: 'text',
    layerKey: 'TEXT',
    blockPath: [],
    position: { x: 0, y: 0 },
    value,
    height: 0.2,
    rotation: 0,
  };
}

function closedPolys(n: number): PlanEntity[] {
  const square = (o: number): Vec2[] => [
    { x: o, y: 0 },
    { x: o + 3, y: 0 },
    { x: o + 3, y: 3 },
    { x: o, y: 3 },
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: id(),
    kind: 'polyline' as const,
    layerKey: 'ROOMS',
    blockPath: [],
    vertices: square(i * 4),
    closed: true,
  }));
}

describe('details sheets', () => {
  it('recognises the waterproofing details sheet and blocks measurement', () => {
    // The sheet the customer sent: six numbered waterproofing details, each at
    // its own scale, with plenty of hatched concrete that would otherwise
    // measure as real floor area.
    const entities: PlanEntity[] = [
      text("פרט מס' 1"),
      text("פרט מס' 2"),
      text("פרט מס' 3"),
      text("פרט מס' 4"),
      text("פרט מס' 5"),
      text("פרט מס' 6"),
      text('פרט איטום גג באזור מעקה'),
      text('קנה מידה 1:5'),
      text('קנה מידה 1:10'),
      text('גיליון פרטי בניה'),
      ...closedPolys(30),
    ];

    const result = detectSheetKind(entities);
    expect(result.kind).toBe('detail_sheet');
    expect(result.measurable).toBe(false);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.detailLabels.length).toBeGreaterThanOrEqual(2);
    expect(result.scaleNotations).toEqual(expect.arrayContaining(['1:5', '1:10']));
    expect(result.reasons.some((r) => r.includes('כתב הכמויות'))).toBe(true);
  });

  it('does not fire on a single detail cross-reference in a floor plan', () => {
    const entities: PlanEntity[] = [
      text('תוכנית קומה 3'),
      text("ראה פרט מס' 4"),
      text('קנה מידה 1:50'),
      ...closedPolys(20),
    ];
    const result = detectSheetKind(entities);
    expect(result.kind).toBe('floor_plan');
    expect(result.measurable).toBe(true);
  });

  it('ignores an unnumbered "פרט" inside an ordinary note', () => {
    // "according to the manufacturer's detail" appears on half the drawings
    // ever made and must not turn a plan into a details sheet.
    const entities: PlanEntity[] = [
      text('תוכנית קומה טיפוסית'),
      text('לפי פרט היצרן'),
      text('איטום לפי פרט מאושר'),
      ...closedPolys(15),
    ];
    expect(detectSheetKind(entities).kind).toBe('floor_plan');
  });
});

describe('multiple scales', () => {
  it('refuses to measure a sheet carrying two different scales', () => {
    const entities: PlanEntity[] = [text('1:50'), text('1:20'), ...closedPolys(20)];
    const result = detectSheetKind(entities);
    expect(result.measurable).toBe(false);
    expect(result.scaleNotations).toEqual(['1:50', '1:20']);
  });

  it('accepts a single repeated scale notation', () => {
    const entities: PlanEntity[] = [
      text('תוכנית קומה'),
      text('קנה מידה 1:50'),
      text('קנ״מ 1:50'),
      ...closedPolys(20),
    ];
    const result = detectSheetKind(entities);
    expect(result.scaleNotations).toEqual(['1:50']);
    expect(result.measurable).toBe(true);
  });
});

describe('sections and elevations', () => {
  it('recognises a sections sheet', () => {
    const entities: PlanEntity[] = [
      text('חתך א-א'),
      text('חתך ב-ב'),
      text('חתך ג-ג'),
      ...closedPolys(12),
    ];
    const result = detectSheetKind(entities);
    expect(result.kind).toBe('section');
    expect(result.measurable).toBe(false);
  });

  it('recognises an elevations sheet', () => {
    const entities: PlanEntity[] = [
      text('חזית צפונית'),
      text('חזית דרומית'),
      text('חזית מזרחית'),
      ...closedPolys(12),
    ];
    expect(detectSheetKind(entities).kind).toBe('elevation');
  });

  it('lets a floor plan win when both terms appear', () => {
    const entities: PlanEntity[] = [
      text('תוכנית קומה 2'),
      text('תוכנית קומה טיפוסית'),
      text('סימון חתך א-א'),
      ...closedPolys(25),
    ];
    expect(detectSheetKind(entities).kind).toBe('floor_plan');
  });
});

describe('schedules and site plans', () => {
  it('recognises a door schedule', () => {
    const entities: PlanEntity[] = [text('רשימת דלתות'), text('מקרא'), ...closedPolys(2)];
    const result = detectSheetKind(entities);
    expect(result.kind).toBe('schedule');
    expect(result.measurable).toBe(false);
  });

  it('recognises a site plan and keeps it measurable', () => {
    const entities: PlanEntity[] = [text('מפת מדידה'), ...closedPolys(20)];
    const result = detectSheetKind(entities);
    expect(result.kind).toBe('site_plan');
    expect(result.measurable).toBe(true);
  });
});

describe('fallbacks', () => {
  it('treats an unlabelled sheet full of closed geometry as a plan, at low confidence', () => {
    const result = detectSheetKind(closedPolys(30));
    expect(result.kind).toBe('floor_plan');
    expect(result.measurable).toBe(true);
    expect(result.confidence).toBeLessThan(0.5);
  });

  it('refuses to guess for an almost empty sheet', () => {
    const result = detectSheetKind([text('שרטוט'), ...closedPolys(2)]);
    expect(result.kind).toBe('unknown');
    expect(result.measurable).toBe(false);
    expect(result.confidence).toBe(0);
  });

  it('always explains itself', () => {
    for (const entities of [closedPolys(30), [text("פרט מס' 1"), text("פרט מס' 2")], []]) {
      const result = detectSheetKind(entities);
      expect(result.reasons.length).toBeGreaterThan(0);
      for (const r of result.reasons) expect(r.length).toBeGreaterThan(10);
    }
  });

  it('is deterministic', () => {
    const entities = [text("פרט מס' 1"), text("פרט מס' 2"), text('1:5'), ...closedPolys(10)];
    expect(JSON.stringify(detectSheetKind(entities))).toBe(JSON.stringify(detectSheetKind(entities)));
  });
});
