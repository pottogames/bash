import type { LinearUnit, MeasureType } from './units.js';
import type { TradeCode } from './trades.js';

/** A point in plan space. Always metres by the time it reaches `CanonicalPlan`. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The primitive kinds every parser must reduce its input to.
 *
 * Deliberately small: the measurement engine only knows these eight, so adding
 * a new input format can never quietly introduce a shape nothing can measure.
 */
export type EntityKind =
  | 'polyline'
  | 'circle'
  | 'arc'
  | 'point'
  | 'text'
  | 'block'
  | 'hatch'
  | 'dimension';

interface EntityBase {
  /** Stable within one parse. Used as the provenance anchor from a quantity line. */
  id: string;
  kind: EntityKind;
  /** `Layer.sourceKey` this entity belongs to. */
  layerKey: string;
  /**
   * Block nesting path, outermost first, empty for model-space entities.
   * Geometry that came out of a block still contributes to length/area, but the
   * *count* of a block comes from the `block` marker entity, never from its
   * expanded children — that is what stops a 12-line outlet symbol counting as 12.
   */
  blockPath: string[];
  /** Native handle from the source file (DXF handle, PDF object id). For audit. */
  handle?: string;
}

export interface PolylineEntity extends EntityBase {
  kind: 'polyline';
  vertices: Vec2[];
  closed: boolean;
  /** Set when the parser closed an almost-closed polyline itself. Surfaces as a warning. */
  autoClosed?: boolean;
  /** Constant width, if the source carried one (DXF LWPOLYLINE). Metres. */
  width?: number;
}

export interface CircleEntity extends EntityBase {
  kind: 'circle';
  center: Vec2;
  radius: number;
}

export interface ArcEntity extends EntityBase {
  kind: 'arc';
  center: Vec2;
  radius: number;
  /** Radians, counter-clockwise, sweeping from `startAngle` to `endAngle`. */
  startAngle: number;
  endAngle: number;
}

export interface PointEntity extends EntityBase {
  kind: 'point';
  position: Vec2;
}

export interface TextEntity extends EntityBase {
  kind: 'text';
  position: Vec2;
  value: string;
  height: number;
  rotation: number;
}

export interface BlockEntity extends EntityBase {
  kind: 'block';
  name: string;
  position: Vec2;
  rotation: number;
  scale: Vec2;
}

export interface HatchEntity extends EntityBase {
  kind: 'hatch';
  /**
   * Boundary loops. Containment decides outer-vs-island at measure time rather
   * than trusting the file's flags, which CAD exporters get wrong often enough
   * to matter.
   */
  loops: { vertices: Vec2[] }[];
  patternName?: string;
}

export interface DimensionEntity extends EntityBase {
  kind: 'dimension';
  /** The two points the dimension spans, in plan coordinates. */
  from: Vec2;
  to: Vec2;
  /**
   * The number the drawing *displays*, parsed from the dimension text, in the
   * drawing's own display units. Comparing this against `|to - from|` is how we
   * verify scale without asking anybody anything.
   */
  displayedValue?: number;
  text?: string;
}

export type PlanEntity =
  | PolylineEntity
  | CircleEntity
  | ArcEntity
  | PointEntity
  | TextEntity
  | BlockEntity
  | HatchEntity
  | DimensionEntity;

/** A layer as it existed in the source file, before any human touched it. */
export interface Layer {
  /**
   * The file's own identifier for the layer, normalised only for whitespace.
   * **Never changes.** Re-importing a revised drawing matches on this, which is
   * why renaming a layer in the UI survives the next revision.
   */
  sourceKey: string;
  /** The name exactly as it appeared in the file. Shown as secondary text in the UI. */
  sourceName: string;
  /** ACI colour index or RGB from the file, for the canvas preview. */
  color?: string;
  frozen: boolean;
  /** `false` for layers switched off in the file — kept, but excluded by default. */
  visible: boolean;
  entityCount: number;
}

/** Where the plan's scale came from, in descending order of trust. */
export type ScaleSource =
  /** DXF/DWG `$INSUNITS` — the drawing states its own unit. Nothing to infer. */
  | 'native_units'
  /** IFC length unit from the file header. Equally authoritative. */
  | 'ifc_units'
  /** Derived by comparing dimension text against measured geometry. */
  | 'dimension_inference'
  /** A human drew a line and typed its real length. */
  | 'manual_calibration'
  /** Nothing worked. Quoting is blocked. */
  | 'unknown';

export interface PlanScale {
  source: ScaleSource;
  /** Multiply any raw source coordinate by this to get metres. */
  metresPerSourceUnit: number;
  /** The unit we believe the file is drawn in, when we know it. */
  unit: LinearUnit;
  /**
   * 0–1. Only ever 1 for `native_units` / `ifc_units`. For inference it is the
   * agreement rate across the dimensions we cross-checked.
   */
  confidence: number;
  /** Human-readable justification. Rendered verbatim in the scale banner. */
  reason: string;
  /** Number of DIMENSION entities that agreed / were checked. */
  agreement?: { agreed: number; checked: number };
}

/**
 * The single shape every parser produces. Everything downstream — measurement,
 * classification, rendering, packaging — reads this and only this, so it has no
 * idea whether the source was a DXF, a PDF or an IFC.
 */
export interface CanonicalPlan {
  /** Format the plan came from, for display and for warning copy. */
  sourceFormat: 'dxf' | 'dwg' | 'pdf_vector' | 'ifc' | 'raster';
  /** Original filename, for provenance. */
  sourceName: string;
  scale: PlanScale;
  layers: Layer[];
  /** All coordinates already multiplied through by `scale.metresPerSourceUnit`. */
  entities: PlanEntity[];
  /** Model-space extents in metres, for fitting the canvas. */
  bounds: { min: Vec2; max: Vec2 };
  /** Non-fatal problems found while parsing. Shown in the import report. */
  warnings: PlanWarning[];
}

export interface PlanWarning {
  code: PlanWarningCode;
  message: string;
  /** Entity or layer the warning points at, when it has one. */
  ref?: string;
}

export type PlanWarningCode =
  | 'unknown_units'
  | 'scale_disagreement'
  | 'no_dimensions_found'
  | 'unsupported_entity'
  | 'degenerate_geometry'
  | 'self_intersecting_polygon'
  | 'open_polygon_autoclosed'
  | 'duplicate_geometry'
  | 'empty_layer';

/**
 * How a layer got its trade. Every assignment carries one, so the UI can always
 * answer "why is this marked as electrical?" with a specific sentence.
 */
export type ClassificationSource =
  /** An organisation rule learned from a previous human correction. Highest trust. */
  | 'org_rule'
  /** Matched a standard CAD layer code (AIA / ISO 13567). */
  | 'layer_standard'
  /** Matched the built-in Hebrew/English keyword dictionary. */
  | 'keyword'
  /** Inferred from what the layer contains, not from its name. */
  | 'geometry_hint'
  /** A person set it by hand. Never overwritten by any rule. */
  | 'manual'
  /** Nothing matched. */
  | 'none';

export interface LayerClassification {
  sourceKey: string;
  trade: TradeCode;
  measureType: MeasureType;
  /** 0–1, computed by the rule engine. Deterministic: same input, same number. */
  confidence: number;
  source: ClassificationSource;
  /**
   * The exact evidence, in order of contribution. Rendered as a list in the
   * "why?" popover — this is the whole reason the rule engine beats a model
   * for this job: the answer is inspectable.
   */
  evidence: ClassificationEvidence[];
}

export interface ClassificationEvidence {
  kind: ClassificationSource;
  /** e.g. `חשמל`, `E-LITE`, `92% blocks` */
  matched: string;
  /** Contribution to the score, 0–1. */
  weight: number;
  /** Hebrew sentence shown to the user. */
  explanation: string;
}
