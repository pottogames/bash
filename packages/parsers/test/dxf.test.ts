import { describe, expect, it } from 'vitest';
import { measure } from '@plan2quote/geometry';
import { classifyPlan } from '@plan2quote/classify';
import { parseDxf, parseDimensionText } from '../src/dxf.js';
import { buildDxf, circle, dimension, line, lwpolyline, text } from './fixtures.js';

const room = (w: number, h: number): [number, number][] => [
  [0, 0],
  [w, 0],
  [w, h],
  [0, h],
];

describe('units and scale', () => {
  it('converts a millimetre drawing to metres', () => {
    // 5000 × 4000 mm is a 5 × 4 m room.
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', room(5000, 4000))],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });

    expect(plan.scale.source).toBe('native_units');
    expect(plan.scale.unit).toBe('mm');
    expect(plan.scale.metresPerSourceUnit).toBe(0.001);
    expect(plan.scale.confidence).toBe(1);

    const area = measure(plan.entities, { measureType: 'area' });
    expect(area.value).toBeCloseTo(20, 9);
  });

  it('converts a centimetre drawing to metres', () => {
    const dxf = buildDxf({
      insunits: 5,
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', room(500, 400))],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.unit).toBe('cm');
    expect(measure(plan.entities, { measureType: 'area' }).value).toBeCloseTo(20, 9);
  });

  it('leaves a metre drawing alone', () => {
    const dxf = buildDxf({
      insunits: 6,
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', room(5, 4))],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.metresPerSourceUnit).toBe(1);
    expect(measure(plan.entities, { measureType: 'area' }).value).toBeCloseTo(20, 9);
  });

  it('blocks quoting when the file declares no units and has no dimensions', () => {
    const dxf = buildDxf({
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', room(5000, 4000))],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.source).toBe('unknown');
    expect(plan.scale.confidence).toBe(0);
    expect(plan.warnings.map((w) => w.code)).toContain('unknown_units');
  });

  it('infers millimetres from a dimension typed in metres', () => {
    // A 5000-unit span annotated "5.00" can only mean the drawing is in mm.
    const dxf = buildDxf({
      layers: [{ name: 'ריצוף' }, { name: 'מידות' }],
      entities: [
        lwpolyline('ריצוף', room(5000, 4000)),
        dimension('מידות', [0, 0], [5000, 0], '5.00'),
        dimension('מידות', [0, 0], [4000, 0], '4.00'),
        dimension('מידות', [0, 0], [3000, 0], '3.00'),
      ],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.source).toBe('dimension_inference');
    expect(plan.scale.unit).toBe('mm');
    expect(plan.scale.confidence).toBeGreaterThan(0.8);
    expect(measure(plan.entities.filter((e) => e.layerKey === 'ריצוף'), { measureType: 'area' }).value).toBeCloseTo(20, 6);
  });

  it('drops confidence when the header and the dimension text disagree', () => {
    // Header says metres, but a 5000-unit span is annotated "5.00" — the
    // geometry was scaled and the annotation was not.
    const dxf = buildDxf({
      insunits: 6,
      layers: [{ name: 'מידות' }],
      entities: [
        dimension('מידות', [0, 0], [5000, 0], '5.00'),
        dimension('מידות', [0, 0], [4000, 0], '4.00'),
      ],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.source).toBe('native_units');
    expect(plan.scale.confidence).toBeLessThan(1);
    expect(plan.warnings.map((w) => w.code)).toContain('scale_disagreement');
  });

  it('keeps full confidence when the dimensions agree with the header', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'מידות' }],
      entities: [
        dimension('מידות', [0, 0], [5000, 0], '5000'),
        dimension('מידות', [0, 0], [4000, 0], '4000'),
      ],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.scale.confidence).toBe(1);
    expect(plan.scale.agreement).toEqual({ agreed: 2, checked: 2 });
  });
});

describe('parseDimensionText', () => {
  it('ignores the <> placeholder', () => {
    expect(parseDimensionText('<>')).toBeUndefined();
    expect(parseDimensionText('~<> מ׳')).toBeUndefined();
  });

  it('reads a decimal with either separator', () => {
    expect(parseDimensionText('5.00')).toBe(5);
    expect(parseDimensionText('5,00')).toBe(5);
  });

  it('reads a number wrapped in text', () => {
    expect(parseDimensionText('אורך 3.25 מ׳')).toBe(3.25);
  });

  it('returns undefined for empty or non-numeric text', () => {
    expect(parseDimensionText('')).toBeUndefined();
    expect(parseDimensionText('לפי מדידה')).toBeUndefined();
  });
});

describe('layers', () => {
  it('reads layer names from the LAYER table and counts entities', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'חשמל' }, { name: 'ריצוף' }, { name: 'הערות' }],
      entities: [
        lwpolyline('ריצוף', room(5000, 4000)),
        circle('חשמל', [1000, 1000], 100),
        circle('חשמל', [2000, 1000], 100),
        text('הערות', [0, 0], 'סלון'),
      ],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    const byKey = Object.fromEntries(plan.layers.map((l) => [l.sourceKey, l.entityCount]));
    expect(byKey['חשמל']).toBe(2);
    expect(byKey['ריצוף']).toBe(1);
    expect(byKey['הערות']).toBe(1);
  });

  it('synthesises a layer that entities reference but the table never declared', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [],
      entities: [lwpolyline('שכבה-רפאים', room(1000, 1000))],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.layers.map((l) => l.sourceKey)).toContain('שכבה-רפאים');
  });

  it('reports an empty declared layer', () => {
    const dxf = buildDxf({ insunits: 4, layers: [{ name: 'ריק' }], entities: [] });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(plan.warnings.some((w) => w.code === 'empty_layer' && w.ref === 'ריק')).toBe(true);
  });
});

describe('entities', () => {
  it('reads a LINE as an open two-point polyline', () => {
    const dxf = buildDxf({
      insunits: 6,
      layers: [{ name: 'קירות' }],
      entities: [line('קירות', [0, 0], [3, 4])],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(measure(plan.entities, { measureType: 'length' }).value).toBeCloseTo(5, 9);
  });

  it('preserves bulges so a curved wall measures as an arc, not a chord', () => {
    // Two vertices 10 m apart, both bulged by 1 — a full circle of radius 5.
    const dxf = buildDxf({
      insunits: 6,
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', [[0, 0], [10, 0]], true, [1, 1])],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    const area = measure(plan.entities, { measureType: 'area' });
    expect(area.value).toBeCloseTo(Math.PI * 25, 6);
  });

  it('keeps bulges unscaled through a unit conversion', () => {
    // Same circle drawn in millimetres. The bulge is a ratio, so it must not be
    // multiplied by the conversion factor.
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'ריצוף' }],
      entities: [lwpolyline('ריצוף', [[0, 0], [10000, 0]], true, [1, 1])],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(measure(plan.entities, { measureType: 'area' }).value).toBeCloseTo(Math.PI * 25, 6);
  });

  it('scales a circle radius with the drawing units', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'עמודים' }],
      entities: [circle('עמודים', [0, 0], 500)],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    expect(measure(plan.entities, { measureType: 'area' }).value).toBeCloseTo(Math.PI * 0.25, 9);
  });

  it('scales text height with the drawing units', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'הערות' }],
      entities: [text('הערות', [0, 0], 'סלון', 250)],
    });
    const plan = parseDxf(dxf, { sourceName: 'test.dxf' });
    const t = plan.entities.find((e) => e.kind === 'text');
    expect(t && t.kind === 'text' && t.height).toBeCloseTo(0.25, 9);
  });

  it('rejects a file that is not DXF at all', () => {
    expect(() => parseDxf('this is not a drawing', { sourceName: 'x.dxf' })).toThrow();
  });
});

describe('end to end', () => {
  it('reads a small flat and produces the quantities a surveyor would count', () => {
    const dxf = buildDxf({
      insunits: 4,
      layers: [{ name: 'ריצוף' }, { name: 'חשמל-שקעים' }, { name: 'קירות בלוקים' }, { name: 'הערות' }],
      entities: [
        // Living room 5 × 4 m with a 1 × 1 m shaft in it.
        lwpolyline('ריצוף', room(5000, 4000)),
        lwpolyline('ריצוף', [[1000, 1000], [2000, 1000], [2000, 2000], [1000, 2000]]),
        // Four sockets.
        circle('חשמל-שקעים', [500, 500], 100),
        circle('חשמל-שקעים', [1500, 500], 100),
        circle('חשמל-שקעים', [2500, 500], 100),
        circle('חשמל-שקעים', [3500, 500], 100),
        // Two wall runs.
        line('קירות בלוקים', [0, 0], [5000, 0]),
        line('קירות בלוקים', [5000, 0], [5000, 4000]),
        text('הערות', [2000, 2000], 'סלון'),
      ],
    });

    const plan = parseDxf(dxf, { sourceName: 'flat.dxf' });
    const classifications = classifyPlan(plan.layers, plan.entities);
    const byLayer = Object.fromEntries(classifications.map((c) => [c.sourceKey, c]));

    expect(byLayer['ריצוף']!.trade).toBe('flooring');
    expect(byLayer['חשמל-שקעים']!.trade).toBe('electrical');
    expect(byLayer['קירות בלוקים']!.trade).toBe('masonry');
    expect(byLayer['הערות']!.trade).toBe('annotation');

    const quantities = classifications
      .filter((c) => c.trade !== 'annotation')
      .map((c) => ({
        trade: c.trade,
        value: measure(
          plan.entities.filter((e) => e.layerKey === c.sourceKey),
          { measureType: c.measureType },
        ).value,
        measureType: c.measureType,
      }));

    const flooring = quantities.find((q) => q.trade === 'flooring')!;
    expect(flooring.measureType).toBe('area');
    // 20 m² less the 1 m² shaft.
    expect(flooring.value).toBeCloseTo(19, 6);

    const electrical = quantities.find((q) => q.trade === 'electrical')!;
    expect(electrical.measureType).toBe('count');
    expect(electrical.value).toBe(4);

    const masonry = quantities.find((q) => q.trade === 'masonry')!;
    expect(masonry.value).toBeCloseTo(9, 6);
  });
});
