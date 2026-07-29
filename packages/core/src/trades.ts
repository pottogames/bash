/**
 * Trade taxonomy.
 *
 * These are the built-in trades. An organisation can add its own on top of
 * them (`trades` table, `is_custom = true`) — nothing in the engine treats this
 * list as closed, it is just the set that ships with sensible default rules.
 */

export type TradeCode =
  | 'earthworks'
  | 'structure'
  | 'masonry'
  | 'waterproofing'
  | 'plaster'
  | 'drywall'
  | 'flooring'
  | 'painting'
  | 'electrical'
  | 'lowvoltage'
  | 'plumbing'
  | 'hvac'
  | 'fire'
  | 'aluminum'
  | 'carpentry'
  | 'doors_windows'
  | 'roofing'
  | 'elevator'
  | 'landscape'
  | 'demolition'
  /** Text, dimensions, title blocks, grids. Never priced, never measured. */
  | 'annotation'
  /** Recognised as drawing content but not yet assigned to anybody. */
  | 'unassigned';

export interface TradeMeta {
  code: TradeCode;
  /** Hebrew label — this is what the UI shows. */
  he: string;
  /** English label, used in exports and in AIA layer-code matching. */
  en: string;
  /** Chip colour, `oklch` so light/dark stay perceptually even. */
  color: string;
  /** What this trade is usually measured in — a default, always overridable. */
  defaultMeasure: 'length' | 'area' | 'volume' | 'count';
  /** `false` for annotation: it never produces a bill-of-quantities line. */
  billable: boolean;
}

export const TRADES: readonly TradeMeta[] = [
  { code: 'earthworks', he: 'עבודות עפר', en: 'Earthworks', color: 'oklch(0.62 0.09 60)', defaultMeasure: 'volume', billable: true },
  { code: 'structure', he: 'שלד ובטון', en: 'Structure', color: 'oklch(0.55 0.03 250)', defaultMeasure: 'volume', billable: true },
  { code: 'masonry', he: 'בנייה ובלוקים', en: 'Masonry', color: 'oklch(0.63 0.11 40)', defaultMeasure: 'area', billable: true },
  { code: 'waterproofing', he: 'איטום', en: 'Waterproofing', color: 'oklch(0.55 0.10 200)', defaultMeasure: 'area', billable: true },
  { code: 'plaster', he: 'טיח', en: 'Plaster', color: 'oklch(0.70 0.06 80)', defaultMeasure: 'area', billable: true },
  { code: 'drywall', he: 'גבס', en: 'Drywall', color: 'oklch(0.72 0.05 110)', defaultMeasure: 'area', billable: true },
  { code: 'flooring', he: 'ריצוף וחיפוי', en: 'Flooring', color: 'oklch(0.65 0.12 25)', defaultMeasure: 'area', billable: true },
  { code: 'painting', he: 'צבע', en: 'Painting', color: 'oklch(0.70 0.13 330)', defaultMeasure: 'area', billable: true },
  { code: 'electrical', he: 'חשמל', en: 'Electrical', color: 'oklch(0.78 0.16 90)', defaultMeasure: 'count', billable: true },
  { code: 'lowvoltage', he: 'תקשורת ומתח נמוך', en: 'Low voltage', color: 'oklch(0.70 0.11 145)', defaultMeasure: 'count', billable: true },
  { code: 'plumbing', he: 'אינסטלציה', en: 'Plumbing', color: 'oklch(0.62 0.14 240)', defaultMeasure: 'length', billable: true },
  { code: 'hvac', he: 'מיזוג אוויר', en: 'HVAC', color: 'oklch(0.72 0.10 195)', defaultMeasure: 'count', billable: true },
  { code: 'fire', he: 'כיבוי אש', en: 'Fire protection', color: 'oklch(0.58 0.19 25)', defaultMeasure: 'count', billable: true },
  { code: 'aluminum', he: 'אלומיניום', en: 'Aluminium', color: 'oklch(0.72 0.03 240)', defaultMeasure: 'area', billable: true },
  { code: 'carpentry', he: 'נגרות', en: 'Carpentry', color: 'oklch(0.58 0.09 55)', defaultMeasure: 'count', billable: true },
  { code: 'doors_windows', he: 'דלתות וחלונות', en: 'Doors & windows', color: 'oklch(0.66 0.10 300)', defaultMeasure: 'count', billable: true },
  { code: 'roofing', he: 'גגות', en: 'Roofing', color: 'oklch(0.52 0.08 170)', defaultMeasure: 'area', billable: true },
  { code: 'elevator', he: 'מעליות', en: 'Elevators', color: 'oklch(0.50 0.06 285)', defaultMeasure: 'count', billable: true },
  { code: 'landscape', he: 'פיתוח וגינון', en: 'Landscape', color: 'oklch(0.68 0.14 140)', defaultMeasure: 'area', billable: true },
  { code: 'demolition', he: 'הריסה', en: 'Demolition', color: 'oklch(0.48 0.10 20)', defaultMeasure: 'volume', billable: true },
  { code: 'annotation', he: 'הערות וסימונים', en: 'Annotation', color: 'oklch(0.60 0.01 250)', defaultMeasure: 'count', billable: false },
  { code: 'unassigned', he: 'לא משויך', en: 'Unassigned', color: 'oklch(0.65 0.01 250)', defaultMeasure: 'count', billable: false },
] as const;

const BY_CODE = new Map<TradeCode, TradeMeta>(TRADES.map((t) => [t.code, t]));

export function tradeMeta(code: TradeCode): TradeMeta {
  const meta = BY_CODE.get(code);
  if (!meta) throw new Error(`tradeMeta: unknown trade "${code}"`);
  return meta;
}

export function isBillableTrade(code: TradeCode): boolean {
  return tradeMeta(code).billable;
}
