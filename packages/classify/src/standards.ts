import type { MeasureType, TradeCode } from '@plan2quote/core';

/**
 * Standard CAD layer-name codes.
 *
 * When a drawing follows the AIA CAD Layer Guidelines (or the ISO 13567 family
 * that most European offices use), the layer name *is* a machine-readable
 * classification and there is nothing to infer at all: `E-LITE` is lighting,
 * full stop. Those names are checked before the keyword dictionary and score
 * higher, because a convention beats a guess.
 *
 * Format: `<discipline>-<major>-<minor>-<status>`, e.g. `A-WALL-FULL-NEWW`.
 */

export interface StandardCode {
  /** Discipline + major, e.g. `E-LITE`. Compared case-insensitively. */
  code: string;
  trade: TradeCode;
  measureType: MeasureType;
  label: string;
}

/** Discipline letters on their own — a weaker signal, used when the major code is unrecognised. */
export const AIA_DISCIPLINES: Readonly<Record<string, TradeCode>> = {
  a: 'unassigned', // Architectural covers many trades; the major code decides.
  s: 'structure',
  m: 'hvac',
  e: 'electrical',
  p: 'plumbing',
  f: 'fire',
  c: 'earthworks', // Civil
  l: 'landscape',
  t: 'lowvoltage',
  q: 'carpentry', // Equipment / fittings
  g: 'annotation', // General
  x: 'annotation', // Xref / external
  z: 'annotation',
};

export const AIA_CODES: readonly StandardCode[] = [
  // Architectural
  { code: 'a-wall', trade: 'masonry', measureType: 'area', label: 'קירות אדריכליים' },
  { code: 'a-door', trade: 'doors_windows', measureType: 'count', label: 'דלתות' },
  { code: 'a-glaz', trade: 'aluminum', measureType: 'area', label: 'זיגוג וחלונות' },
  { code: 'a-flor', trade: 'flooring', measureType: 'area', label: 'ריצוף' },
  { code: 'a-clng', trade: 'drywall', measureType: 'area', label: 'תקרות' },
  { code: 'a-roof', trade: 'roofing', measureType: 'area', label: 'גג' },
  { code: 'a-cols', trade: 'structure', measureType: 'count', label: 'עמודים' },
  { code: 'a-eqpm', trade: 'carpentry', measureType: 'count', label: 'ציוד' },
  { code: 'a-furn', trade: 'carpentry', measureType: 'count', label: 'ריהוט' },
  { code: 'a-area', trade: 'annotation', measureType: 'area', label: 'סימון שטחים' },
  { code: 'a-anno', trade: 'annotation', measureType: 'count', label: 'הערות' },

  // Structural
  { code: 's-beam', trade: 'structure', measureType: 'length', label: 'קורות' },
  { code: 's-cols', trade: 'structure', measureType: 'count', label: 'עמודים' },
  { code: 's-fndn', trade: 'structure', measureType: 'volume', label: 'יסודות' },
  { code: 's-slab', trade: 'structure', measureType: 'area', label: 'רצפות בטון' },
  { code: 's-wall', trade: 'structure', measureType: 'area', label: 'קירות בטון' },
  { code: 's-grid', trade: 'annotation', measureType: 'count', label: 'צירים' },

  // Mechanical
  { code: 'm-hvac', trade: 'hvac', measureType: 'count', label: 'מיזוג אוויר' },
  { code: 'm-duct', trade: 'hvac', measureType: 'length', label: 'תעלות מיזוג' },
  { code: 'm-pipe', trade: 'hvac', measureType: 'length', label: 'צנרת מכנית' },
  { code: 'm-eqpm', trade: 'hvac', measureType: 'count', label: 'ציוד מכני' },

  // Electrical
  { code: 'e-lite', trade: 'electrical', measureType: 'count', label: 'תאורה' },
  { code: 'e-powr', trade: 'electrical', measureType: 'count', label: 'כוח ושקעים' },
  { code: 'e-comm', trade: 'lowvoltage', measureType: 'count', label: 'תקשורת' },
  { code: 'e-secn', trade: 'lowvoltage', measureType: 'count', label: 'ביטחון' },
  { code: 'e-fire', trade: 'fire', measureType: 'count', label: 'גילוי אש' },
  { code: 'e-eqpm', trade: 'electrical', measureType: 'count', label: 'ציוד חשמלי' },

  // Plumbing
  { code: 'p-sanr', trade: 'plumbing', measureType: 'length', label: 'ביוב ודלוחין' },
  { code: 'p-domw', trade: 'plumbing', measureType: 'length', label: 'מים קרים/חמים' },
  { code: 'p-strm', trade: 'plumbing', measureType: 'length', label: 'ניקוז מי גשם' },
  { code: 'p-fixt', trade: 'plumbing', measureType: 'count', label: 'כלים סניטריים' },
  { code: 'p-pipe', trade: 'plumbing', measureType: 'length', label: 'צנרת' },

  // Fire protection
  { code: 'f-prot', trade: 'fire', measureType: 'count', label: 'כיבוי אש' },
  { code: 'f-sprn', trade: 'fire', measureType: 'count', label: 'מתזים' },
  { code: 'f-alrm', trade: 'fire', measureType: 'count', label: 'גילוי וכריזה' },

  // Civil / landscape
  { code: 'c-topo', trade: 'earthworks', measureType: 'area', label: 'טופוגרפיה' },
  { code: 'c-road', trade: 'landscape', measureType: 'area', label: 'כבישים' },
  { code: 'l-plnt', trade: 'landscape', measureType: 'count', label: 'נטיעות' },
  { code: 'l-site', trade: 'landscape', measureType: 'area', label: 'פיתוח' },
  { code: 'l-walk', trade: 'landscape', measureType: 'area', label: 'שבילים' },
];

const BY_CODE = new Map(AIA_CODES.map((c) => [c.code, c]));

/**
 * Matches a layer name against the standards.
 *
 * Only the first two segments are considered — the minor code (`FULL`) and
 * status (`NEWW`, `DEMO`, `EXST`) vary too much between offices to be worth
 * matching, with one exception: a `DEMO` status flips the trade to demolition
 * no matter what the major code says, because that is what the drawing means.
 */
export function matchStandard(layerName: string): { match: StandardCode; demolition: boolean } | null {
  const parts = layerName.toLowerCase().trim().split(/[-_]/).filter(Boolean);
  if (parts.length < 2) return null;

  const key = `${parts[0]}-${parts[1]}`;
  const match = BY_CODE.get(key);
  if (!match) return null;

  const demolition = parts.slice(2).some((p) => p === 'demo' || p === 'remv' || p === 'remo');
  return { match, demolition };
}

/** Falls back to the discipline letter when the major code is not recognised. */
export function matchDiscipline(layerName: string): TradeCode | null {
  const parts = layerName.toLowerCase().trim().split(/[-_]/).filter(Boolean);
  const first = parts[0];
  if (!first || first.length !== 1 || parts.length < 2) return null;
  const trade = AIA_DISCIPLINES[first];
  return trade && trade !== 'unassigned' ? trade : null;
}
