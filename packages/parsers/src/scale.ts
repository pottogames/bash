import type { DimensionEntity, LinearUnit, PlanScale, PlanWarning, Vec2 } from '@plan2quote/core';
import { linearUnitFromInsunits, metresPerUnit } from '@plan2quote/core';
import { distance } from '@plan2quote/geometry';

/**
 * Scale resolution.
 *
 * An error anywhere else in this system costs one line of a quote. An error
 * here multiplies through every number in it, and it does so silently: a plan
 * read at the wrong scale looks completely normal, it is just wrong by a factor
 * of ten. So this module is built around one rule — **never infer what the file
 * already states, and never state what could only be inferred.**
 *
 * Order of resolution:
 *   1. `$INSUNITS` from the file header. Authoritative, confidence 1.
 *   2. Cross-check against DIMENSION entities. Cannot improve confidence, but
 *      can destroy it — a drawing whose geometry was scaled without rescaling
 *      its dimension text is the classic way a plan lies about itself.
 *   3. With no header unit, infer from dimension text. Confidence caps below 1
 *      and the UI blocks quoting until somebody confirms.
 *   4. Manual two-point calibration. The user's word, confidence 1.
 */

/** Tolerance for calling a dimension's text and its geometry "in agreement". */
const AGREEMENT_TOLERANCE = 0.005; // 0.5%

/** Standard unit factors we are willing to snap an inferred ratio onto. */
const SNAP_CANDIDATES: readonly LinearUnit[] = ['mm', 'cm', 'dm', 'm', 'in', 'ft'];

/** How far an inferred ratio may sit from a standard factor and still snap to it. */
const SNAP_TOLERANCE = 0.02; // 2%

export interface ScaleResolution {
  scale: PlanScale;
  warnings: PlanWarning[];
}

/**
 * Resolves scale from the header unit, then audits it against the drawing's own
 * dimensions.
 */
export function resolveScale(
  insunits: number | undefined,
  dimensions: readonly DimensionEntity[],
  rawBounds: { min: Vec2; max: Vec2 } | null,
): ScaleResolution {
  const headerUnit = linearUnitFromInsunits(insunits);

  if (headerUnit && headerUnit !== 'unitless') {
    const factor = metresPerUnit(headerUnit);
    const audit = auditAgainstDimensions(dimensions);
    const warnings: PlanWarning[] = [];

    let confidence = 1;
    let reason = `הקובץ מצהיר על יחידות ${unitLabel(headerUnit)} בכותרת ($INSUNITS). לא נדרשה שום הערכה.`;

    if (audit.checked > 0 && audit.agreementRatio < 0.8) {
      // The header says one thing and the drawing's own dimension text says
      // another. We keep the header value — it is still the better guess — but
      // the confidence drop is what puts a banner on every quantity screen.
      confidence = 0.5;
      reason =
        `הקובץ מצהיר על יחידות ${unitLabel(headerUnit)}, אך רק ${audit.agreed} מתוך ${audit.checked} ` +
        `מידות בתוכנית תואמות לזה. ייתכן שהגאומטריה שונתה בלי לעדכן את הטקסט. נדרשת בדיקה ידנית.`;
      warnings.push({
        code: 'scale_disagreement',
        message: reason,
      });
    }

    return {
      scale: {
        source: 'native_units',
        metresPerSourceUnit: factor,
        unit: headerUnit,
        confidence,
        reason,
        agreement: audit.checked > 0 ? { agreed: audit.agreed, checked: audit.checked } : undefined,
      },
      warnings,
    };
  }

  const inferred = inferFromDimensions(dimensions);
  if (inferred) return inferred;

  return {
    scale: {
      source: 'unknown',
      metresPerSourceUnit: 1,
      unit: 'unitless',
      confidence: 0,
      reason:
        'הקובץ לא מצהיר על יחידות ולא נמצאו מידות שניתן להסיק מהן קנה מידה. ' +
        'יש לכייל ידנית: סמן קו שאורכו ידוע והזן את אורכו האמיתי.',
    },
    warnings: [
      {
        code: 'unknown_units',
        message: 'לא ניתן לקבוע קנה מידה. חישוב כמויות והצעת מחיר חסומים עד לכיול ידני.',
      },
      ...(rawBounds ? [] : []),
    ],
  };
}

/**
 * Compares each dimension's printed value against the distance it actually
 * spans, in drawing units.
 *
 * A dimension entity measures in drawing units by definition, so on an
 * untouched file the two are equal. They diverge when somebody scaled the
 * geometry and left the annotation behind, or applied a DIMLFAC factor.
 */
export function auditAgainstDimensions(dimensions: readonly DimensionEntity[]): {
  checked: number;
  agreed: number;
  agreementRatio: number;
} {
  let checked = 0;
  let agreed = 0;

  for (const dim of dimensions) {
    if (dim.displayedValue === undefined) continue;
    const geometric = distance(dim.from, dim.to);
    if (geometric <= 0) continue;
    checked++;
    const error = Math.abs(dim.displayedValue - geometric) / geometric;
    if (error <= AGREEMENT_TOLERANCE) agreed++;
  }

  return { checked, agreed, agreementRatio: checked === 0 ? 0 : agreed / checked };
}

/**
 * Infers metres-per-drawing-unit from dimension text when the header is silent.
 *
 * The reasoning, made explicit because it is the one place in the pipeline that
 * involves an assumption:
 *
 *   - A dimension's printed value is written for a human, so it is in a unit a
 *     human reads: millimetres, centimetres or metres.
 *   - Under each of those three readings the ratio `printedInMetres / rawSpan`
 *     is a candidate for metres-per-drawing-unit.
 *   - Only readings that land on a real unit — within 2% of mm, cm, dm, m, inch
 *     or foot — are kept. Nobody draws in 0.0037 m units.
 *   - The reading that the most dimensions agree on wins, and the agreement
 *     fraction becomes the confidence.
 *
 * Confidence is capped at 0.85. This is an inference, and it is labelled as one
 * everywhere it is shown.
 */
export function inferFromDimensions(dimensions: readonly DimensionEntity[]): ScaleResolution | null {
  const usable = dimensions.filter((d) => d.displayedValue !== undefined && d.displayedValue > 0);
  if (usable.length === 0) return null;

  const votes = new Map<LinearUnit, number>();

  for (const dim of usable) {
    const span = distance(dim.from, dim.to);
    if (span <= 0) continue;

    for (const textUnit of ['mm', 'cm', 'm'] as const) {
      const printedInMetres = dim.displayedValue! * metresPerUnit(textUnit);
      // A printed dimension in a building is between 1 cm and 200 m. Readings
      // outside that are not plausible annotations and are dropped before they
      // can vote.
      if (printedInMetres < 0.01 || printedInMetres > 200) continue;

      const ratio = printedInMetres / span;
      const snapped = snapToStandardUnit(ratio);
      if (snapped) votes.set(snapped, (votes.get(snapped) ?? 0) + 1);
    }
  }

  if (votes.size === 0) {
    return {
      scale: {
        source: 'unknown',
        metresPerSourceUnit: 1,
        unit: 'unitless',
        confidence: 0,
        reason:
          `נמצאו ${usable.length} מידות בתוכנית, אך אף אחת מהן לא מובילה ליחידת מידה סטנדרטית. ` +
          'נדרש כיול ידני.',
      },
      warnings: [
        {
          code: 'scale_disagreement',
          message: 'המידות בתוכנית לא עקביות עם אף יחידת מידה מוכרת. יש לכייל ידנית.',
        },
      ],
    };
  }

  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1]);
  const [unit, count] = ranked[0]!;
  const agreement = count / usable.length;
  const confidence = Math.min(0.85, agreement);

  const warnings: PlanWarning[] = [];
  if (usable.length < 3) {
    warnings.push({
      code: 'no_dimensions_found',
      message: `קנה המידה הוסק מ-${usable.length} מידות בלבד. מומלץ לאמת ידנית לפני הפקת הצעת מחיר.`,
    });
  }
  if (ranked.length > 1 && ranked[1]![1] === count) {
    warnings.push({
      code: 'scale_disagreement',
      message: `המידות תומכות באותה מידה ב-${unitLabel(unit)} וב-${unitLabel(ranked[1]![0])}. חובה לאמת ידנית.`,
    });
  }

  return {
    scale: {
      source: 'dimension_inference',
      metresPerSourceUnit: metresPerUnit(unit),
      unit,
      confidence,
      reason:
        `הקובץ לא מצהיר על יחידות. ${count} מתוך ${usable.length} מידות בתוכנית עקביות עם ` +
        `יחידות ${unitLabel(unit)}. זו הסקה, לא נתון מהקובץ — מומלץ לאמת.`,
      agreement: { agreed: count, checked: usable.length },
    },
    warnings,
  };
}

/** Snaps a raw ratio onto a standard unit factor, or rejects it. */
export function snapToStandardUnit(ratio: number): LinearUnit | null {
  if (!Number.isFinite(ratio) || ratio <= 0) return null;
  for (const unit of SNAP_CANDIDATES) {
    const factor = metresPerUnit(unit);
    if (Math.abs(ratio - factor) / factor <= SNAP_TOLERANCE) return unit;
  }
  return null;
}

/**
 * Two-point calibration: a user draws across something whose real length they
 * know and types that length. This is a measurement, not a guess, so it carries
 * full confidence and overrides everything above it.
 */
export function calibrateManually(
  a: Vec2,
  b: Vec2,
  realLengthMetres: number,
): ScaleResolution | { error: string } {
  const span = distance(a, b);
  if (span <= 0) return { error: 'שתי הנקודות זהות — לא ניתן לכייל.' };
  if (!(realLengthMetres > 0)) return { error: 'האורך האמיתי חייב להיות גדול מאפס.' };

  const factor = realLengthMetres / span;
  const snapped = snapToStandardUnit(factor);

  return {
    scale: {
      source: 'manual_calibration',
      metresPerSourceUnit: factor,
      unit: snapped ?? 'unitless',
      confidence: 1,
      reason: snapped
        ? `כויל ידנית: ${realLengthMetres} מ׳ על פני ${span.toFixed(2)} יחידות שרטוט, מה שתואם יחידות ${unitLabel(snapped)}.`
        : `כויל ידנית: ${realLengthMetres} מ׳ על פני ${span.toFixed(2)} יחידות שרטוט.`,
    },
    warnings: snapped
      ? []
      : [
          {
            code: 'unknown_units',
            message:
              'הכיול הידני לא נופל על יחידת מידה סטנדרטית. זה תקין אם התוכנית סרוקה, ' +
              'אך שווה לוודא שהקו שנמדד אכן באורך שהוזן.',
          },
        ],
  };
}

function unitLabel(unit: LinearUnit): string {
  const labels: Record<LinearUnit, string> = {
    mm: 'מילימטר',
    cm: 'סנטימטר',
    dm: 'דצימטר',
    m: 'מטר',
    km: 'קילומטר',
    in: 'אינץ׳',
    ft: 'רגל',
    yd: 'יארד',
    mil: 'מיל',
    unitless: 'ללא יחידות',
  };
  return labels[unit];
}
