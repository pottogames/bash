import type { MeasureType, PlanEntity, TradeCode } from '@plan2quote/core';

/**
 * Evidence taken from what a layer *contains* rather than what it is called.
 *
 * This is what rescues the layers every project has — `Layer1`, `0`, `שכבה 3`,
 * `Copy of A-WALL` — where the name says nothing. It cannot name a trade on its
 * own (a layer full of blocks could be sockets or trees), but it settles the
 * measurement type reliably, and it identifies pure-annotation layers with
 * near-certainty.
 */

export interface LayerStats {
  total: number;
  blocks: number;
  points: number;
  texts: number;
  hatches: number;
  dimensions: number;
  closedPolylines: number;
  openPolylines: number;
  circles: number;
  arcs: number;
  /** Entities that came from inside a block definition. */
  nested: number;
}

export function computeLayerStats(entities: readonly PlanEntity[]): LayerStats {
  const stats: LayerStats = {
    total: entities.length,
    blocks: 0,
    points: 0,
    texts: 0,
    hatches: 0,
    dimensions: 0,
    closedPolylines: 0,
    openPolylines: 0,
    circles: 0,
    arcs: 0,
    nested: 0,
  };

  for (const e of entities) {
    if (e.blockPath.length > 0) stats.nested++;
    switch (e.kind) {
      case 'block':
        stats.blocks++;
        break;
      case 'point':
        stats.points++;
        break;
      case 'text':
        stats.texts++;
        break;
      case 'hatch':
        stats.hatches++;
        break;
      case 'dimension':
        stats.dimensions++;
        break;
      case 'circle':
        stats.circles++;
        break;
      case 'arc':
        stats.arcs++;
        break;
      case 'polyline':
        if (e.closed) stats.closedPolylines++;
        else stats.openPolylines++;
        break;
    }
  }

  return stats;
}

export interface GeometricHint {
  measureType: MeasureType;
  /** 0–1. How clear-cut the entity mix is. */
  confidence: number;
  /** Hebrew sentence for the evidence list. */
  explanation: string;
  /** Set only when the contents are unambiguously non-constructive. */
  trade?: TradeCode;
}

/**
 * Reads the entity mix and returns the measurement type it implies.
 *
 * The thresholds are ratios rather than counts so they hold for a layer with
 * eight entities and one with eight thousand.
 */
export function inferFromGeometry(stats: LayerStats): GeometricHint {
  if (stats.total === 0) {
    return { measureType: 'count', confidence: 0, explanation: 'השכבה ריקה — אין ממה להסיק.' };
  }

  const annotationish = stats.texts + stats.dimensions;
  if (annotationish / stats.total >= 0.8) {
    return {
      measureType: 'count',
      confidence: 0.9,
      trade: 'annotation',
      explanation: `${pct(annotationish, stats.total)} מהישויות הן טקסט או מידות — שכבת סימון, לא שכבה נמדדת.`,
    };
  }

  // Only top-level inserts count as symbols; geometry expanded out of a block
  // is the symbol's own drawing, not another symbol.
  const symbols = stats.blocks + stats.points;
  const drawn = stats.total - stats.nested;
  if (drawn > 0 && symbols / drawn >= 0.6) {
    return {
      measureType: 'count',
      confidence: 0.85,
      explanation: `${pct(symbols, drawn)} מהישויות הן בלוקים או נקודות — שכבה של סמלים שנספרים ביחידות.`,
    };
  }

  if (stats.hatches > 0 && stats.hatches / stats.total >= 0.3) {
    return {
      measureType: 'area',
      confidence: 0.8,
      explanation: `${pct(stats.hatches, stats.total)} מהישויות הן הצללות (hatch) — מסמנות שטח.`,
    };
  }

  const polylines = stats.closedPolylines + stats.openPolylines;
  if (polylines > 0) {
    const closedRatio = stats.closedPolylines / polylines;
    if (closedRatio >= 0.7) {
      return {
        measureType: 'area',
        confidence: 0.7,
        explanation: `${pct(stats.closedPolylines, polylines)} מהמצולעים סגורים — נמדד כשטח.`,
      };
    }
    if (closedRatio <= 0.3) {
      return {
        measureType: 'length',
        confidence: 0.7,
        explanation: `${pct(stats.openPolylines, polylines)} מהקווים פתוחים — נמדד כאורך.`,
      };
    }
    return {
      measureType: 'length',
      confidence: 0.4,
      explanation: 'תערובת של קווים פתוחים וסגורים — ברירת מחדל לאורך, כדאי לאמת.',
    };
  }

  if (stats.circles + stats.arcs > 0) {
    return {
      measureType: 'count',
      confidence: 0.5,
      explanation: 'השכבה מכילה בעיקר עיגולים וקשתות — ככל הנראה סמלים.',
    };
  }

  return { measureType: 'count', confidence: 0.2, explanation: 'לא ניתן להסיק סוג מדידה מתוכן השכבה.' };
}

function pct(part: number, whole: number): string {
  return `${Math.round((part / whole) * 100)}%`;
}
