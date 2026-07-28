/**
 * Unit handling.
 *
 * Rule for the whole system: **every internal number is in metres** (or m², m³).
 * Conversion happens exactly once, at the parser boundary, and the factor that
 * was used is recorded on the plan so a human can audit it later.
 *
 * There is no guessing here. If we cannot prove the drawing's unit we say so
 * and the UI blocks quoting until somebody calibrates.
 */

/** Linear units we accept from a drawing file. */
export type LinearUnit =
  | 'mm'
  | 'cm'
  | 'dm'
  | 'm'
  | 'km'
  | 'in'
  | 'ft'
  | 'yd'
  | 'mil'
  | 'unitless';

/** Exact metres-per-unit factors. Imperial values are the international definitions. */
const METRES_PER_UNIT: Record<Exclude<LinearUnit, 'unitless'>, number> = {
  mm: 0.001,
  cm: 0.01,
  dm: 0.1,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  yd: 0.9144,
  mil: 0.0000254,
};

/**
 * AutoCAD `$INSUNITS` header codes.
 * Only the codes that can plausibly appear in an architectural drawing are
 * mapped; anything else is deliberately left out so it surfaces as `unknown`
 * rather than being silently coerced to metres.
 */
const INSUNITS: Readonly<Record<number, LinearUnit>> = {
  0: 'unitless',
  1: 'in',
  2: 'ft',
  4: 'mm',
  5: 'cm',
  6: 'm',
  7: 'km',
  9: 'mil',
  10: 'yd',
  14: 'dm',
};

export function linearUnitFromInsunits(code: number | undefined): LinearUnit | undefined {
  if (code === undefined) return undefined;
  return INSUNITS[code];
}

/** Metres per one drawing unit. Throws for `unitless` — callers must handle it explicitly. */
export function metresPerUnit(unit: LinearUnit): number {
  if (unit === 'unitless') {
    throw new Error('metresPerUnit: "unitless" has no defined scale; calibrate first');
  }
  return METRES_PER_UNIT[unit];
}

export function isKnownUnit(unit: LinearUnit): unit is Exclude<LinearUnit, 'unitless'> {
  return unit !== 'unitless';
}

/** What a quantity is measured in. Drives which geometric routine runs. */
export type MeasureType = 'length' | 'area' | 'volume' | 'count' | 'weight';

/** The unit a bill-of-quantities line is priced in. */
export type QuantityUnit = "m'" | 'm²' | 'm³' | "יח'" | 'טון' | 'קג' | 'קומפ';

export const DEFAULT_UNIT_FOR_MEASURE: Record<MeasureType, QuantityUnit> = {
  length: "m'",
  area: 'm²',
  volume: 'm³',
  count: "יח'",
  weight: 'טון',
};

/**
 * Rounds to a fixed number of decimals using half-away-from-zero, which is what
 * a quantity surveyor expects — `Math.round` is half-up and therefore biased on
 * negatives, and `toFixed` has known binary-representation surprises.
 */
export function roundTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const f = 10 ** decimals;
  const scaled = value * f;
  // Nudge by one ulp-ish epsilon so 1.005 * 100 === 100.49999999999999 rounds to 1.01.
  const corrected = scaled + Math.sign(scaled) * Number.EPSILON * Math.abs(scaled);
  return (corrected < 0 ? -Math.round(-corrected) : Math.round(corrected)) / f;
}
