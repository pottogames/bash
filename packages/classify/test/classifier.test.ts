import { describe, expect, it } from 'vitest';
import type { PlanEntity, Vec2 } from '@plan2quote/core';
import { classifyLayer, classifyPlan, ruleFromCorrection, type OrgRule } from '../src/classifier.js';

let seq = 0;
const id = () => `c${++seq}`;

function blocks(n: number, layerKey = 'L'): PlanEntity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: id(),
    kind: 'block' as const,
    layerKey,
    blockPath: [],
    name: 'SYM',
    position: { x: i, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  }));
}

function closedPolys(n: number, layerKey = 'L'): PlanEntity[] {
  const square = (o: number): Vec2[] => [
    { x: o, y: 0 },
    { x: o + 1, y: 0 },
    { x: o + 1, y: 1 },
    { x: o, y: 1 },
  ];
  return Array.from({ length: n }, (_, i) => ({
    id: id(),
    kind: 'polyline' as const,
    layerKey,
    blockPath: [],
    vertices: square(i * 2),
    closed: true,
  }));
}

function openPolys(n: number, layerKey = 'L'): PlanEntity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: id(),
    kind: 'polyline' as const,
    layerKey,
    blockPath: [],
    vertices: [
      { x: i, y: 0 },
      { x: i + 5, y: 0 },
    ],
    closed: false,
  }));
}

function texts(n: number, layerKey = 'L'): PlanEntity[] {
  return Array.from({ length: n }, (_, i) => ({
    id: id(),
    kind: 'text' as const,
    layerKey,
    blockPath: [],
    position: { x: i, y: 0 },
    value: 'הערה',
    height: 0.2,
    rotation: 0,
  }));
}

describe('Hebrew layer names', () => {
  const cases: [string, string][] = [
    ['חשמל', 'electrical'],
    ['חשמל-תאורה', 'electrical'],
    ['שקעים קומה 2', 'electrical'],
    ['אינסטלציה-דלוחין', 'plumbing'],
    ['צנרת מים', 'plumbing'],
    ['מיזוג אוויר', 'hvac'],
    ['תעלות מיזוג', 'hvac'],
    ['ספרינקלרים', 'fire'],
    ['גילוי אש ועשן', 'fire'],
    ['בטון-קורות', 'structure'],
    ['יסודות', 'structure'],
    ['בלוקים', 'masonry'],
    ['מחיצות גבס', 'drywall'],
    ['טיח פנים', 'plaster'],
    ['ריצוף קרמיקה', 'flooring'],
    ['איטום גגות', 'waterproofing'],
    ['אלומיניום-ויטרינות', 'aluminum'],
    ['דלתות', 'doors_windows'],
    ['נגרות-ארונות', 'carpentry'],
    ['מעליות', 'elevator'],
    ['עבודות עפר', 'earthworks'],
    ['פיתוח וגינון', 'landscape'],
    ['הריסה', 'demolition'],
  ];

  for (const [name, expected] of cases) {
    it(`classifies "${name}" as ${expected}`, () => {
      const result = classifyLayer({ sourceKey: name, sourceName: name });
      expect(result.trade).toBe(expected);
      expect(result.confidence).toBeGreaterThan(0.4);
    });
  }

  it('is unaffected by Hebrew final letters and plural endings', () => {
    const singular = classifyLayer({ sourceKey: 'a', sourceName: 'מעלית' });
    const plural = classifyLayer({ sourceKey: 'b', sourceName: 'מעליות' });
    expect(singular.trade).toBe(plural.trade);
  });

  it('strips a leading conjunction', () => {
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'וחשמל' }).trade).toBe('electrical');
  });
});

describe('AIA layer standards', () => {
  const cases: [string, string][] = [
    ['E-LITE', 'electrical'],
    ['E-POWR-NEWW', 'electrical'],
    ['P-SANR', 'plumbing'],
    ['M-DUCT', 'hvac'],
    ['F-SPRN', 'fire'],
    ['S-BEAM', 'structure'],
    ['S-FNDN', 'structure'],
    ['A-DOOR', 'doors_windows'],
    ['A-FLOR-FNSH', 'flooring'],
    ['A-GLAZ', 'aluminum'],
    ['L-PLNT', 'landscape'],
    ['E-COMM', 'lowvoltage'],
  ];

  for (const [name, expected] of cases) {
    it(`reads ${name} as ${expected}`, () => {
      const result = classifyLayer({ sourceKey: name, sourceName: name });
      expect(result.trade).toBe(expected);
      expect(result.source).toBe('layer_standard');
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  }

  it('reads the measurement type from the standard', () => {
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'S-BEAM' }).measureType).toBe('length');
    expect(classifyLayer({ sourceKey: 'b', sourceName: 'A-FLOR' }).measureType).toBe('area');
    expect(classifyLayer({ sourceKey: 'c', sourceName: 'E-LITE' }).measureType).toBe('count');
  });

  it('a DEMO status overrides the trade', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'A-WALL-FULL-DEMO' });
    expect(result.trade).toBe('demolition');
    expect(result.evidence.some((e) => e.matched === 'DEMO')).toBe(true);
  });

  it('falls back to the discipline letter for an unknown major code', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'P-XXXX' });
    expect(result.trade).toBe('plumbing');
    expect(result.confidence).toBeLessThan(0.9);
  });
});

describe('organisation rules', () => {
  const rules: OrgRule[] = [
    { id: '1', pattern: 'שכבה-7', matchType: 'exact', trade: 'plumbing', measureType: 'length' },
    { id: '2', pattern: 'קבלן-א', matchType: 'contains', trade: 'masonry', hitCount: 3 },
    { id: '3', pattern: '^tmp\\d+$', matchType: 'regex', trade: 'annotation' },
  ];

  it('an exact rule beats everything else', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'שכבה-7', orgRules: rules });
    expect(result.trade).toBe('plumbing');
    expect(result.source).toBe('org_rule');
    expect(result.confidence).toBe(0.98);
  });

  it('an organisation rule overrides the keyword dictionary', () => {
    const override: OrgRule[] = [{ id: '9', pattern: 'חשמל-ישן', matchType: 'exact', trade: 'demolition' }];
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'חשמל-ישן', orgRules: override });
    expect(result.trade).toBe('demolition');
  });

  it('matches a contains rule', () => {
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'x-קבלן-א-2', orgRules: rules }).trade).toBe('masonry');
  });

  it('matches a regex rule', () => {
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'tmp42', orgRules: rules }).trade).toBe('annotation');
  });

  it('survives a malformed stored regex', () => {
    const broken: OrgRule[] = [{ id: '1', pattern: '([', matchType: 'regex', trade: 'masonry' }];
    expect(() => classifyLayer({ sourceKey: 'a', sourceName: 'anything', orgRules: broken })).not.toThrow();
  });

  it('prefers the more-confirmed rule within a tier', () => {
    const competing: OrgRule[] = [
      { id: '1', pattern: 'abc', matchType: 'contains', trade: 'masonry', hitCount: 1 },
      { id: '2', pattern: 'abc', matchType: 'contains', trade: 'flooring', hitCount: 9 },
    ];
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'xx-abc-yy', orgRules: competing }).trade).toBe('flooring');
  });

  it('builds an exact rule from a correction rather than guessing a pattern', () => {
    const rule = ruleFromCorrection('שכבה משונה 12', 'plumbing', 'length');
    expect(rule.matchType).toBe('exact');
    expect(rule.pattern).toBe('שכבה משונה 12');
  });
});

describe('manual assignment', () => {
  it('short-circuits every other source', () => {
    const result = classifyLayer({
      sourceKey: 'a',
      sourceName: 'E-LITE',
      manual: { trade: 'plumbing', measureType: 'volume' },
    });
    expect(result.trade).toBe('plumbing');
    expect(result.measureType).toBe('volume');
    expect(result.confidence).toBe(1);
    expect(result.source).toBe('manual');
  });
});

describe('geometric evidence', () => {
  it('recognises an annotation layer from its contents alone', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'Layer1', entities: texts(10) });
    expect(result.trade).toBe('annotation');
    expect(result.source).toBe('geometry_hint');
  });

  it('infers count from a layer of blocks', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'שכבה 3', entities: blocks(8) });
    expect(result.measureType).toBe('count');
    expect(result.trade).toBe('unassigned');
  });

  it('infers area from closed polygons', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'Copy of 12', entities: closedPolys(9) });
    expect(result.measureType).toBe('area');
  });

  it('infers length from open lines', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: '0', entities: openPolys(9) });
    expect(result.measureType).toBe('length');
  });

  it('leaves an unnameable layer at zero confidence rather than guessing a trade', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'Layer1', entities: openPolys(5) });
    expect(result.trade).toBe('unassigned');
    expect(result.confidence).toBe(0);
    expect(result.evidence.some((e) => e.kind === 'none')).toBe(true);
  });
});

describe('measurement-type overrides in the name', () => {
  it('lets an explicit unit word win', () => {
    // Sockets are normally counted; this layer says it holds areas.
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'חשמל - שטח' });
    expect(result.trade).toBe('electrical');
    expect(result.measureType).toBe('area');
  });

  it('reads "אורך" as a length instruction', () => {
    expect(classifyLayer({ sourceKey: 'a', sourceName: 'ריצוף אורך' }).measureType).toBe('length');
  });
});

describe('ambiguity', () => {
  it('lowers confidence and names the alternative when two trades fit', () => {
    const result = classifyLayer({ sourceKey: 'a', sourceName: 'קירות גבס ובלוקים' });
    expect(['drywall', 'masonry']).toContain(result.trade);
    expect(result.confidence).toBeLessThan(0.95);
  });

  it('every classification carries at least one piece of evidence', () => {
    const names = ['חשמל', 'E-LITE', 'Layer1', 'A-WALL-DEMO', ''];
    for (const name of names) {
      const result = classifyLayer({ sourceKey: name, sourceName: name });
      expect(result.evidence.length).toBeGreaterThan(0);
      for (const e of result.evidence) expect(e.explanation.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic across repeated runs', () => {
    const once = classifyLayer({ sourceKey: 'a', sourceName: 'חשמל-תאורה-קומה2', entities: blocks(5) });
    const twice = classifyLayer({ sourceKey: 'a', sourceName: 'חשמל-תאורה-קומה2', entities: blocks(5) });
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });
});

describe('classifyPlan', () => {
  it('groups entities by layer and classifies each one', () => {
    const entities: PlanEntity[] = [...blocks(4, 'ELEC'), ...closedPolys(4, 'FLOOR'), ...texts(5, 'TEXT')];
    const results = classifyPlan(
      [
        { sourceKey: 'ELEC', sourceName: 'חשמל-שקעים' },
        { sourceKey: 'FLOOR', sourceName: 'ריצוף' },
        { sourceKey: 'TEXT', sourceName: 'הערות' },
      ],
      entities,
    );
    expect(results.map((r) => r.trade)).toEqual(['electrical', 'flooring', 'annotation']);
    expect(results[0]!.measureType).toBe('count');
    expect(results[1]!.measureType).toBe('area');
  });

  it('applies manual overrides by layer key', () => {
    const results = classifyPlan([{ sourceKey: 'ELEC', sourceName: 'חשמל' }], [], {
      manual: { ELEC: { trade: 'fire', measureType: 'length' } },
    });
    expect(results[0]!.trade).toBe('fire');
  });
});
