import type { PlanEntity } from '@plan2quote/core';
import { normaliseFinalForms, stripHebrewMarks } from './normalize.js';

/**
 * Sheet-kind detection.
 *
 * Not every drawing in a project is measurable, and this is the single most
 * expensive thing to get wrong. A details sheet — six waterproofing details at
 * 1:5 and 1:10, each with its own hatched concrete — looks to a measuring
 * engine exactly like a floor plan full of rooms. Measured at the sheet's
 * nominal scale it produces confident, completely fictional square metres, and
 * nothing about the result looks suspicious.
 *
 * So before anything is measured, the sheet has to say what it is. The signals
 * are all textual and all present on any real Israeli drawing:
 *
 *   - repeated `פרט מס׳ N` labels → a details sheet
 *   - two or more *different* scale notations → several viewports, so a single
 *     sheet-wide scale is meaningless
 *   - `חתך` / `חזית` → a vertical drawing, where plan area has no meaning
 *
 * Everything here is a rule over strings found in the file. No inference, and
 * the reasons are shown to the user verbatim.
 */

export type SheetKind =
  /** A floor plan. The only kind that is measured automatically. */
  | 'floor_plan'
  /** Details at large scales, usually several per sheet. */
  | 'detail_sheet'
  | 'section'
  | 'elevation'
  /** Site plan / survey. Measurable, but for landscape and earthworks only. */
  | 'site_plan'
  /** A schedule or legend — doors, windows, finishes. Text, not geometry. */
  | 'schedule'
  | 'unknown';

export interface SheetDetection {
  kind: SheetKind;
  /**
   * `false` blocks automatic take-off. The user can still override per layer,
   * but they have to do it knowingly.
   */
  measurable: boolean;
  confidence: number;
  /** Hebrew sentences, rendered in the import report. */
  reasons: string[];
  /** Distinct scale notations found on the sheet, e.g. `['1:5', '1:10']`. */
  scaleNotations: string[];
  /** Detail labels found, e.g. `['פרט מס׳ 1', 'פרט מס׳ 2']`. */
  detailLabels: string[];
}

/** `1:50`, `קנה מידה 1:5`, `קנ״מ 1:10`, `sc 1:20`. */
const SCALE_NOTATION = /\b1\s*[:：]\s*(\d{1,4})\b/g;

/**
 * A detail label. The number is required — an unnumbered `פרט` appears inside
 * ordinary notes ("לפי פרט היצרן") and would fire on every sheet.
 */
const DETAIL_LABEL = /(?:פרט|detail)\s*(?:מס['׳"]?\s*)?[.:#]?\s*(\d{1,3})\b/gi;

const SECTION_TOKENS = ['חתכ', 'section', 'sect'];
const ELEVATION_TOKENS = ['חזית', 'elevation', 'elev'];
const PLAN_TOKENS = ['תוכנית קומה', 'תכנית קומה', 'קומה', 'floor plan', 'תנוחה'];
const SITE_TOKENS = ['מפת מדידה', 'תנוחה כללית', 'פיתוח שטח', 'site plan', 'survey'];
const SCHEDULE_TOKENS = ['רשימת דלתות', 'רשימת חלונות', 'רשימת גמר', 'schedule', 'מקרא'];

/**
 * Reads every text entity on the sheet and decides what the sheet is.
 *
 * Takes the whole entity list rather than just the text so the geometry can
 * corroborate: a sheet with detail labels but almost no closed polygons is
 * certainly details, while one with many closed rooms is more likely a plan
 * that happens to reference a detail.
 */
export function detectSheetKind(entities: readonly PlanEntity[]): SheetDetection {
  const texts = entities
    .filter((e): e is Extract<PlanEntity, { kind: 'text' }> => e.kind === 'text')
    .map((e) => normalise(e.value))
    .filter((t) => t.length > 0);

  const haystack = texts.join(' | ');
  const reasons: string[] = [];

  const scaleNotations = uniq([...haystack.matchAll(SCALE_NOTATION)].map((m) => `1:${m[1]}`));
  const detailLabels = uniq([...haystack.matchAll(DETAIL_LABEL)].map((m) => m[0].trim()));

  const closedPolys = entities.filter((e) => e.kind === 'polyline' && e.closed).length;
  const hatches = entities.filter((e) => e.kind === 'hatch').length;

  /* ------------------------------------------------------- details sheet */

  // Two or more numbered detail labels is decisive. One could be a cross
  // reference on a floor plan; two means the sheet *is* the details.
  if (detailLabels.length >= 2) {
    reasons.push(
      `נמצאו ${detailLabels.length} פרטים ממוספרים בגיליון (${detailLabels.slice(0, 4).join(', ')}) — זהו גיליון פרטים ולא תוכנית.`,
    );
    if (scaleNotations.length >= 2) {
      reasons.push(
        `הגיליון מכיל ${scaleNotations.length} קני מידה שונים (${scaleNotations.join(', ')}) — לכל פרט קנה מידה משלו, ולכן אין קנה מידה אחד לגיליון.`,
      );
    }
    reasons.push(
      'מדידה אוטומטית חסומה: ההצללות והחתכים בפרטים ייספרו כשטחים אמיתיים ויעוותו את כתב הכמויות.',
    );
    return {
      kind: 'detail_sheet',
      measurable: false,
      confidence: scaleNotations.length >= 2 ? 0.98 : 0.9,
      reasons,
      scaleNotations,
      detailLabels,
    };
  }

  /* --------------------------------------------- several scales, no labels */

  if (scaleNotations.length >= 2) {
    reasons.push(
      `נמצאו ${scaleNotations.length} קני מידה שונים בגיליון (${scaleNotations.join(', ')}). ` +
        'גיליון עם כמה חלוניות בקני מידה שונים לא ניתן למדידה בקנה מידה אחד.',
    );
    return {
      kind: 'unknown',
      measurable: false,
      confidence: 0.8,
      reasons,
      scaleNotations,
      detailLabels,
    };
  }

  /* ------------------------------------------------- sections, elevations */

  const sectionHits = countTokens(haystack, SECTION_TOKENS);
  const elevationHits = countTokens(haystack, ELEVATION_TOKENS);
  const planHits = countTokens(haystack, PLAN_TOKENS);
  const siteHits = countTokens(haystack, SITE_TOKENS);
  const scheduleHits = countTokens(haystack, SCHEDULE_TOKENS);

  if (sectionHits >= 2 && sectionHits > planHits) {
    reasons.push(
      `המילה "חתך" מופיעה ${sectionHits} פעמים ובולטת על פני מונחי תוכנית — זהו גיליון חתכים.`,
      'בחתך, שטח במישור התוכנית חסר משמעות. מדידת שטח חסומה; אורכים ניתנים למדידה ידנית.',
    );
    return { kind: 'section', measurable: false, confidence: 0.8, reasons, scaleNotations, detailLabels };
  }

  if (elevationHits >= 2 && elevationHits > planHits) {
    reasons.push(
      `המילה "חזית" מופיעה ${elevationHits} פעמים — זהו גיליון חזיתות.`,
      'שטחי חזית (טיח חוץ, אלומיניום) נמדדים כאן, אך לא שטחי רצפה. נדרש אישור ידני.',
    );
    return { kind: 'elevation', measurable: false, confidence: 0.8, reasons, scaleNotations, detailLabels };
  }

  if (scheduleHits >= 1 && closedPolys < 5) {
    reasons.push('הגיליון מכיל רשימה או מקרא ומעט מאוד גאומטריה סגורה — אין ממה למדוד.');
    return { kind: 'schedule', measurable: false, confidence: 0.75, reasons, scaleNotations, detailLabels };
  }

  if (siteHits >= 1) {
    reasons.push('זוהו מונחי תנוחה או מפת מדידה — גיליון פיתוח. מדידה מתאימה לעבודות עפר ופיתוח בלבד.');
    return { kind: 'site_plan', measurable: true, confidence: 0.7, reasons, scaleNotations, detailLabels };
  }

  /* ------------------------------------------------------------ floor plan */

  if (planHits >= 1) {
    reasons.push(`זוהו מונחי תוכנית קומה בגיליון (${planHits} מופעים). ניתן למדידה.`);
    return { kind: 'floor_plan', measurable: true, confidence: 0.8, reasons, scaleNotations, detailLabels };
  }

  // Nothing named the sheet. A lot of closed geometry is still much more like a
  // plan than like anything else, so it is measurable — but at low confidence,
  // which puts it in front of a person first.
  if (closedPolys >= 10 || hatches >= 5) {
    reasons.push(
      `לא נמצא בגיליון טקסט שמזהה את סוגו, אך הוא מכיל ${closedPolys} מצולעים סגורים — ככל הנראה תוכנית. מומלץ לאמת.`,
    );
    return { kind: 'floor_plan', measurable: true, confidence: 0.45, reasons, scaleNotations, detailLabels };
  }

  reasons.push('לא ניתן לקבוע מהו סוג הגיליון. יש לבחור ידנית לפני מדידה.');
  return { kind: 'unknown', measurable: false, confidence: 0, reasons, scaleNotations, detailLabels };
}

export const SHEET_KIND_LABEL: Record<SheetKind, string> = {
  floor_plan: 'תוכנית קומה',
  detail_sheet: 'גיליון פרטים',
  section: 'חתכים',
  elevation: 'חזיתות',
  site_plan: 'תנוחה / פיתוח',
  schedule: 'רשימה / מקרא',
  unknown: 'לא זוהה',
};

/* ------------------------------------------------------------------ helpers */

function normalise(value: string): string {
  return normaliseFinalForms(stripHebrewMarks(value)).toLowerCase().trim();
}

function countTokens(haystack: string, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    const normalised = normalise(token);
    let index = haystack.indexOf(normalised);
    while (index !== -1) {
      total++;
      index = haystack.indexOf(normalised, index + normalised.length);
    }
  }
  return total;
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}
