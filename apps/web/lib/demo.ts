import type { PlanEntity, Vec2 } from '@plan2quote/core';

/**
 * A worked example, used by the screens until a Supabase project is connected.
 *
 * These are real layer names off real Israeli drawings — the messy ones, not a
 * tidy sample: mixed Hebrew and Latin, AIA codes, a `Layer1`, a `defpoints`, a
 * duplicate, and one that says nothing at all. The screens run the actual
 * classifier and the actual geometry engine over this, so what you see is what
 * the engine produces, not a mock-up of it.
 */

export interface DemoLayer {
  sourceKey: string;
  sourceName: string;
  displayName?: string;
  entities: PlanEntity[];
}

let seq = 0;
const id = () => `demo-${++seq}`;

function rect(w: number, h: number, ox = 0, oy = 0): Vec2[] {
  return [
    { x: ox, y: oy },
    { x: ox + w, y: oy },
    { x: ox + w, y: oy + h },
    { x: ox, y: oy + h },
  ];
}

function rooms(layerKey: string, specs: [number, number, number, number][]): PlanEntity[] {
  return specs.map(([w, h, ox, oy]) => ({
    id: id(),
    kind: 'polyline' as const,
    layerKey,
    blockPath: [],
    vertices: rect(w, h, ox, oy),
    closed: true,
  }));
}

function runs(layerKey: string, specs: [number, number, number, number][]): PlanEntity[] {
  return specs.map(([x1, y1, x2, y2]) => ({
    id: id(),
    kind: 'polyline' as const,
    layerKey,
    blockPath: [],
    vertices: [
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ],
    closed: false,
  }));
}

function symbols(layerKey: string, name: string, count: number): PlanEntity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: id(),
    kind: 'block' as const,
    layerKey,
    blockPath: [],
    name,
    position: { x: (i % 6) * 2.4, y: Math.floor(i / 6) * 2.1 },
    rotation: 0,
    scale: { x: 1, y: 1 },
  }));
}

function labels(layerKey: string, count: number): PlanEntity[] {
  return Array.from({ length: count }, (_, i) => ({
    id: id(),
    kind: 'text' as const,
    layerKey,
    blockPath: [],
    position: { x: i * 1.5, y: 0 },
    value: `הערה ${i + 1}`,
    height: 0.25,
    rotation: 0,
  }));
}

export const DEMO_LAYERS: DemoLayer[] = [
  {
    sourceKey: 'ריצוף-קרמיקה',
    sourceName: 'ריצוף-קרמיקה',
    // 4 rooms, with a shaft inside the largest so the island subtraction shows.
    entities: [
      ...rooms('ריצוף-קרמיקה', [
        [5.2, 4.1, 0, 0],
        [3.4, 3.0, 6, 0],
        [2.8, 2.2, 0, 5],
        [1.2, 1.2, 1.5, 1.4],
      ]),
    ],
  },
  {
    sourceKey: 'חשמל-שקעים-ק2',
    sourceName: 'חשמל-שקעים-ק2',
    entities: symbols('חשמל-שקעים-ק2', 'SOCKET', 23),
  },
  {
    sourceKey: 'E-LITE',
    sourceName: 'E-LITE',
    entities: symbols('E-LITE', 'LUMINAIRE', 14),
  },
  {
    sourceKey: 'אינסטלציה-דלוחין',
    sourceName: 'אינסטלציה-דלוחין',
    entities: runs('אינסטלציה-דלוחין', [
      [0, 0, 12.4, 0],
      [12.4, 0, 12.4, 6.8],
      [3.2, 0, 3.2, 4.4],
      [7.1, 0, 7.1, 4.4],
    ]),
  },
  {
    sourceKey: 'M-DUCT',
    sourceName: 'M-DUCT',
    entities: runs('M-DUCT', [
      [0, 7, 14, 7],
      [14, 7, 14, 2],
      [5, 7, 5, 3.5],
    ]),
  },
  {
    sourceKey: 'קירות בלוקים 20',
    sourceName: 'קירות בלוקים 20',
    entities: runs('קירות בלוקים 20', [
      [0, 0, 12.4, 0],
      [12.4, 0, 12.4, 8.2],
      [12.4, 8.2, 0, 8.2],
      [0, 8.2, 0, 0],
      [5.2, 0, 5.2, 4.1],
    ]),
  },
  {
    sourceKey: 'A-WALL-FULL-DEMO',
    sourceName: 'A-WALL-FULL-DEMO',
    entities: runs('A-WALL-FULL-DEMO', [
      [2, 2, 6, 2],
      [6, 2, 6, 5],
    ]),
  },
  {
    sourceKey: 'מחיצות גבס',
    sourceName: 'מחיצות גבס',
    entities: runs('מחיצות גבס', [
      [1, 1, 4.5, 1],
      [4.5, 1, 4.5, 3.2],
      [8, 1, 8, 4],
    ]),
  },
  {
    sourceKey: 'Layer1',
    sourceName: 'Layer1',
    entities: rooms('Layer1', [
      [2.1, 1.8, 0, 0],
      [2.1, 1.8, 4, 0],
    ]),
  },
  {
    sourceKey: 'defpoints',
    sourceName: 'defpoints',
    entities: labels('defpoints', 4),
  },
  {
    sourceKey: 'הערות ומידות',
    sourceName: 'הערות ומידות',
    entities: labels('הערות ומידות', 31),
  },
  {
    sourceKey: 'ספרינקלרים',
    sourceName: 'ספרינקלרים',
    entities: symbols('ספרינקלרים', 'SPRINKLER', 18),
  },
];

export const ALL_DEMO_ENTITIES: PlanEntity[] = DEMO_LAYERS.flatMap((l) => l.entities);

/** The example project's structure, matching the schema's five levels. */
export const DEMO_STRUCTURE = {
  project: { name: 'מגדל הרצל 42', client: 'יזמות ש. לוי בע״מ', city: 'תל אביב', storeyHeight: 2.85 },
  buildings: [
    {
      name: 'בניין A',
      floors: [
        {
          level: -1,
          name: 'מרתף חניה',
          repeatCount: 1,
          grossArea: 780,
          zones: [
            { kind: 'parking', name: 'חניון', netArea: 690, roomCount: null },
            { kind: 'technical', name: 'חדר משאבות', netArea: 24, roomCount: null },
            { kind: 'storage', name: 'מחסנים', netArea: 66, roomCount: null },
          ],
        },
        {
          level: 0,
          name: 'קומת קרקע',
          repeatCount: 1,
          grossArea: 410,
          zones: [
            { kind: 'lobby', name: 'לובי כניסה', netArea: 62, roomCount: null },
            { kind: 'commercial', name: 'חנות 1', netArea: 88, roomCount: null },
            { kind: 'apartment', name: 'דירה 1 (גן)', netArea: 104, roomCount: 4 },
            { kind: 'core', name: 'ליבה — מדרגות ומעליות', netArea: 31, roomCount: null },
          ],
        },
        {
          level: 2,
          name: 'קומה טיפוסית (2–9)',
          repeatCount: 8,
          grossArea: 386,
          zones: [
            { kind: 'apartment', name: 'דירה A', netArea: 92, roomCount: 3.5 },
            { kind: 'apartment', name: 'דירה B', netArea: 104, roomCount: 4 },
            { kind: 'apartment', name: 'דירה C', netArea: 118, roomCount: 4.5 },
            { kind: 'common', name: 'מבואה קומתית', netArea: 18, roomCount: null },
            { kind: 'core', name: 'ליבה', netArea: 31, roomCount: null },
          ],
        },
        {
          level: 10,
          name: 'קומת גג (פנטהאוז)',
          repeatCount: 1,
          grossArea: 290,
          zones: [
            { kind: 'apartment', name: 'פנטהאוז', netArea: 186, roomCount: 6 },
            { kind: 'roof', name: 'גג טכני', netArea: 84, roomCount: null },
          ],
        },
      ],
    },
  ],
} as const;
