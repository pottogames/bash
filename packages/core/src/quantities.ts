import type { MeasureType, QuantityUnit } from './units.js';
import type { TradeCode } from './trades.js';
import type { PlanWarningCode } from './plan.js';

/**
 * One measured row of the bill of quantities.
 *
 * `value` is produced only by the geometry package — pure arithmetic over
 * coordinates, no estimation anywhere in the path. `provenance` lists the exact
 * entity ids that were summed, so clicking a row highlights precisely those
 * shapes on the drawing. If a number cannot be traced back to entity ids, it
 * does not belong in this table.
 */
export interface QuantityLine {
  id: string;
  planId: string;
  floorId: string | null;
  layerKey: string;
  trade: TradeCode;
  measureType: MeasureType;
  /** Hebrew description, defaults to the layer's display name. */
  description: string;
  /** The measured number, in metres / m² / m³ / units. Never rounded in storage. */
  value: number;
  unit: QuantityUnit;
  /** Multiplier for repeated floors ("typical floor × 8"). Defaults to 1. */
  floorMultiplier: number;
  /** Waste allowance, e.g. 0.1 for 10%. Applied on top of `value × floorMultiplier`. */
  wasteFactor: number;
  /** Entity ids that were summed. The clickthrough target. */
  provenance: string[];
  /** Problems detected while measuring this specific row. */
  warnings: { code: PlanWarningCode; message: string }[];
  /** `true` once a human has looked at the row and accepted it. */
  approved: boolean;
}

/** `value × floorMultiplier × (1 + wasteFactor)` — the number that gets priced. */
export function billableQuantity(line: Pick<QuantityLine, 'value' | 'floorMultiplier' | 'wasteFactor'>): number {
  return line.value * line.floorMultiplier * (1 + line.wasteFactor);
}

/**
 * Default waste allowances by trade, from common Israeli practice.
 * Every one of these is editable per project — they are a starting point, not
 * a claim about your supplier.
 */
export const DEFAULT_WASTE_FACTOR: Partial<Record<TradeCode, number>> = {
  flooring: 0.1,
  masonry: 0.05,
  plaster: 0.07,
  drywall: 0.1,
  painting: 0.05,
  structure: 0.03,
  waterproofing: 0.08,
  roofing: 0.08,
};

export function defaultWasteFactor(trade: TradeCode): number {
  return DEFAULT_WASTE_FACTOR[trade] ?? 0;
}
