import type { MeasureType, PlanEntity, PlanWarningCode, Vec2 } from '@plan2quote/core';
import { compensatedSum } from './vec.js';
import { arcLength, normalisedSweep } from './arc.js';
import {
  isEffectivelyClosed,
  isSelfIntersecting,
  netAreaOfLoops,
  pathLength,
  ringArea,
  ringContains,
  type Ring,
} from './polygon.js';
import { findDuplicates } from './dedupe.js';

/**
 * The measurement engine.
 *
 * Input: the entities of one layer. Output: one number, the list of entity ids
 * that produced it, and every reason a human might want to distrust it.
 *
 * There is no model in this file, no network call, and no configuration that
 * could make the same input produce a different number tomorrow.
 */

export interface MeasureOptions {
  measureType: MeasureType;
  /** Vertical extent in metres. Required for `volume`. */
  height?: number;
  /** Wall thickness in metres. When set, `volume` is computed from length × height × thickness. */
  thickness?: number;
  /** Exclude coincident duplicates from the sum. On by default — see `dedupe.ts`. */
  excludeDuplicates?: boolean;
  /**
   * Treat a closed ring fully inside a larger ring on the same layer as a hole.
   * Correct for slabs, floors and roofs; wrong for a layer that happens to hold
   * many nested independent shapes, so it is switchable per line.
   */
  subtractNestedRings?: boolean;
}

export interface MeasureWarning {
  code: PlanWarningCode;
  message: string;
  ref?: string;
}

export interface MeasureResult {
  value: number;
  /** Entity ids that contributed. The clickthrough target on the quantity row. */
  provenance: string[];
  warnings: MeasureWarning[];
  /** Per-entity contribution, so the UI can show where a surprising total came from. */
  breakdown: { entityId: string; value: number }[];
  /** Ids excluded as coincident duplicates. */
  duplicatesExcluded: string[];
}

const EMPTY: MeasureResult = {
  value: 0,
  provenance: [],
  warnings: [],
  breakdown: [],
  duplicatesExcluded: [],
};

export function measure(entities: readonly PlanEntity[], options: MeasureOptions): MeasureResult {
  const excludeDuplicates = options.excludeDuplicates ?? true;

  let working = entities;
  const duplicatesExcluded: string[] = [];
  const warnings: MeasureWarning[] = [];

  if (excludeDuplicates) {
    const groups = findDuplicates(entities);
    if (groups.length > 0) {
      const dropped = new Set(groups.flatMap((g) => g.dropped));
      for (const id of dropped) duplicatesExcluded.push(id);
      working = entities.filter((e) => !dropped.has(e.id));
      warnings.push({
        code: 'duplicate_geometry',
        message: `נמצאו ${dropped.size} ישויות כפולות באותו מיקום והוצאו מהחישוב. לחץ לבדיקה.`,
      });
    }
  }

  if (working.length === 0) {
    return { ...EMPTY, warnings, duplicatesExcluded };
  }

  switch (options.measureType) {
    case 'length':
      return finish(measureLength(working), warnings, duplicatesExcluded);
    case 'area':
      return finish(measureArea(working, options.subtractNestedRings ?? true), warnings, duplicatesExcluded);
    case 'count':
      return finish(measureCount(working), warnings, duplicatesExcluded);
    case 'volume':
      return finish(measureVolume(working, options), warnings, duplicatesExcluded);
    case 'weight':
      // Weight is never geometric — it comes from a material density on the price
      // book, applied to a volume line. Measuring it here would be inventing data.
      return {
        ...EMPTY,
        warnings: [
          ...warnings,
          {
            code: 'unsupported_entity',
            message: 'משקל אינו נמדד מהתוכנית — הוא מחושב מנפח × צפיפות החומר במחירון.',
          },
        ],
        duplicatesExcluded,
      };
  }
}

type Partial_ = Omit<MeasureResult, 'warnings' | 'duplicatesExcluded'> & { warnings: MeasureWarning[] };

function finish(part: Partial_, extra: MeasureWarning[], duplicatesExcluded: string[]): MeasureResult {
  return {
    value: part.value,
    provenance: part.provenance,
    breakdown: part.breakdown,
    warnings: [...extra, ...part.warnings],
    duplicatesExcluded,
  };
}

/* ------------------------------------------------------------------ length */

function measureLength(entities: readonly PlanEntity[]): Partial_ {
  const breakdown: { entityId: string; value: number }[] = [];
  const warnings: MeasureWarning[] = [];

  for (const e of entities) {
    switch (e.kind) {
      case 'polyline': {
        if (e.vertices.length < 2) {
          warnings.push({ code: 'degenerate_geometry', message: 'קו עם פחות משתי נקודות — דולג.', ref: e.id });
          continue;
        }
        breakdown.push({ entityId: e.id, value: pathLength(toRing(e.vertices), e.closed) });
        break;
      }
      case 'circle':
        breakdown.push({ entityId: e.id, value: 2 * Math.PI * e.radius });
        break;
      case 'arc':
        breakdown.push({
          entityId: e.id,
          value: arcLength(e.radius, e.startAngle, e.endAngle),
        });
        break;
      // Points, text, blocks, hatches and dimensions have no length to give.
      default:
        break;
    }
  }

  return sumBreakdown(breakdown, warnings);
}

/* -------------------------------------------------------------------- area */

function measureArea(entities: readonly PlanEntity[], subtractNested: boolean): Partial_ {
  const warnings: MeasureWarning[] = [];
  const breakdown: { entityId: string; value: number }[] = [];

  // Hatches carry their own island structure and are self-contained.
  for (const e of entities) {
    if (e.kind !== 'hatch') continue;
    const loops: Ring[] = e.loops.map((l) => ({ vertices: l.vertices }));
    breakdown.push({ entityId: e.id, value: netAreaOfLoops(loops) });
  }

  for (const e of entities) {
    if (e.kind !== 'circle') continue;
    breakdown.push({ entityId: e.id, value: Math.PI * e.radius * e.radius });
  }

  // Closed polylines are collected first, then resolved against each other so a
  // shaft drawn inside a slab subtracts instead of adding.
  const rings: { id: string; ring: Ring }[] = [];
  for (const e of entities) {
    if (e.kind !== 'polyline') continue;
    if (e.vertices.length < 3) {
      warnings.push({ code: 'degenerate_geometry', message: 'מצולע עם פחות מ-3 נקודות — דולג.', ref: e.id });
      continue;
    }
    if (!e.closed) {
      if (!isEffectivelyClosed(e.vertices)) continue;
      warnings.push({
        code: 'open_polygon_autoclosed',
        message: 'המצולע לא נסגר בקובץ אך הפער זניח — נסגר אוטומטית לצורך חישוב השטח.',
        ref: e.id,
      });
    }
    if (isSelfIntersecting(e.vertices)) {
      warnings.push({
        code: 'self_intersecting_polygon',
        message: 'המצולע חותך את עצמו — השטח שלו לא אמין. נדרשת בדיקה ידנית.',
        ref: e.id,
      });
    }
    rings.push({ id: e.id, ring: toRing(e.vertices) });
  }

  if (rings.length > 0) {
    if (!subtractNested) {
      for (const { id, ring } of rings) breakdown.push({ entityId: id, value: ringArea(ring) });
    } else {
      const areas = rings.map((r) => ringArea(r.ring));
      for (let i = 0; i < rings.length; i++) {
        const depth = rings.reduce(
          (d, other, j) =>
            i !== j && areas[j]! > areas[i]! && ringContains(other.ring.vertices, rings[i]!.ring.vertices)
              ? d + 1
              : d,
          0,
        );
        const sign = depth % 2 === 0 ? 1 : -1;
        if (sign < 0) {
          warnings.push({
            code: 'degenerate_geometry',
            message: 'מצולע נמצא בתוך מצולע גדול יותר באותה שכבה וחושב כחור (הופחת מהשטח).',
            ref: rings[i]!.id,
          });
        }
        breakdown.push({ entityId: rings[i]!.id, value: sign * areas[i]! });
      }
    }
  }

  return sumBreakdown(breakdown, warnings);
}

/* ------------------------------------------------------------------- count */

function measureCount(entities: readonly PlanEntity[]): Partial_ {
  const warnings: MeasureWarning[] = [];

  // Block markers are the right unit of counting: one INSERT is one socket,
  // however many lines its symbol is drawn from. Geometry expanded out of a
  // block is deliberately ignored here.
  const blocks = entities.filter((e) => e.kind === 'block' && e.blockPath.length === 0);
  if (blocks.length > 0) {
    return sumBreakdown(
      blocks.map((e) => ({ entityId: e.id, value: 1 })),
      warnings,
    );
  }

  const points = entities.filter((e) => e.kind === 'point');
  if (points.length > 0) {
    return sumBreakdown(
      points.map((e) => ({ entityId: e.id, value: 1 })),
      warnings,
    );
  }

  // Last resort: some older drawings mark fixtures with a bare circle. Say so,
  // because it is the one counting rule here that involves an assumption.
  const circles = entities.filter((e) => e.kind === 'circle' && e.blockPath.length === 0);
  if (circles.length > 0) {
    warnings.push({
      code: 'unsupported_entity',
      message: 'לא נמצאו בלוקים בשכבה — נספרו עיגולים כסמלים. מומלץ לאמת ידנית.',
    });
    return sumBreakdown(
      circles.map((e) => ({ entityId: e.id, value: 1 })),
      warnings,
    );
  }

  warnings.push({ code: 'empty_layer', message: 'אין בשכבה ישויות שניתן לספור.' });
  return { value: 0, provenance: [], breakdown: [], warnings };
}

/* ------------------------------------------------------------------ volume */

function measureVolume(entities: readonly PlanEntity[], options: MeasureOptions): Partial_ {
  const { height, thickness } = options;

  if (height === undefined || height <= 0) {
    return {
      value: 0,
      provenance: [],
      breakdown: [],
      warnings: [
        {
          code: 'degenerate_geometry',
          message: 'נפח דורש גובה. הזן גובה בשורת הכמות — התוכנית לבדה לא מכילה אותו.',
        },
      ],
    };
  }

  // With a thickness we are extruding a wall along its centreline; without one
  // we are extruding a slab upward from its footprint. Both are exact once the
  // extra dimension is supplied — the ambiguity is in the input, not the maths.
  if (thickness !== undefined && thickness > 0) {
    const base = measureLength(entities);
    return {
      value: base.value * height * thickness,
      provenance: base.provenance,
      breakdown: base.breakdown.map((b) => ({ entityId: b.entityId, value: b.value * height * thickness })),
      warnings: base.warnings,
    };
  }

  const base = measureArea(entities, options.subtractNestedRings ?? true);
  return {
    value: base.value * height,
    provenance: base.provenance,
    breakdown: base.breakdown.map((b) => ({ entityId: b.entityId, value: b.value * height })),
    warnings: base.warnings,
  };
}

/* ------------------------------------------------------------------ shared */

function sumBreakdown(
  breakdown: { entityId: string; value: number }[],
  warnings: MeasureWarning[],
): Partial_ {
  return {
    value: compensatedSum(breakdown.map((b) => b.value)),
    provenance: breakdown.map((b) => b.entityId),
    breakdown,
    warnings,
  };
}

function toRing(vertices: readonly Vec2[]): Ring {
  return { vertices: [...vertices] };
}

/** Total sweep of an arc, exposed for the canvas renderer. */
export { normalisedSweep };
