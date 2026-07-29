import { detectSheetKind, detectFloor, type SheetDetection } from '@plan2quote/classify';
import { detectFormat, FORMATS, parseDxf, type DetectionResult, type DrawingFormat } from '@plan2quote/parsers';
import type { CanonicalPlan } from '@plan2quote/core';

/**
 * What happens to a file between being dropped and being imported.
 *
 * Three questions, in this order, because each one decides whether the next is
 * worth asking:
 *
 *   1. **What is it really?** From the first 512 bytes, not the extension.
 *   2. **Is it a duplicate?** By content hash, so a file sent twice under two
 *      names is caught.
 *   3. **What kind of sheet is it, and may it be measured?** Only for formats
 *      that can be read here — which today means DXF.
 *
 * DXF is read in the browser on purpose. The value of the sheet-kind check is
 * that it lands before anybody starts assigning trades; a server round trip
 * means the answer arrives after the user has moved on.
 */

/** Bytes read for signature sniffing. Enough for every signature we match. */
const SIGNATURE_BYTES = 512;

/**
 * Above this size the content hash is skipped. Hashing 400 MB in a tab freezes
 * it for seconds, and the hash exists to catch accidental duplicates — for
 * which name, size and modification time are already decisive.
 */
const MAX_HASH_BYTES = 64 * 1024 * 1024;

export interface FileInspection {
  detection: DetectionResult;
  format: DrawingFormat;
  /** Content hash, or a name/size/mtime key for very large files. */
  dedupeKey: string;
  hashed: boolean;
  /** Set when the file was read here rather than queued for the worker. */
  plan?: CanonicalPlan;
  sheet?: SheetDetection;
  /** Floor guessed from the filename, e.g. `קומה 3.dxf`. Always confirmable. */
  floorGuess?: { level: number; label: string };
  error?: string;
}

export function supportOf(format: DrawingFormat) {
  return FORMATS[format].support;
}

export function isReadableHere(format: DrawingFormat): boolean {
  return FORMATS[format].support === 'client';
}

export async function inspectFile(file: File): Promise<FileInspection> {
  const head = new Uint8Array(await file.slice(0, SIGNATURE_BYTES).arrayBuffer());
  const detection = detectFormat(file.name, head);
  const format = detection.format;
  const floorGuess = detectFloor(file.name) ?? undefined;

  const hashed = file.size <= MAX_HASH_BYTES;
  const dedupeKey = hashed
    ? await sha256(await file.arrayBuffer())
    : `${file.name}:${file.size}:${file.lastModified}`;

  const base: FileInspection = {
    detection,
    format,
    dedupeKey,
    hashed,
    ...(floorGuess ? { floorGuess } : {}),
  };

  if (!isReadableHere(format)) return base;

  try {
    const buffer = await file.arrayBuffer();
    // DXF is text. Older AutoCAD still writes Windows-1255 for Hebrew, but the
    // group codes are ASCII either way, so a non-fatal UTF-8 decode never
    // breaks the parse — at worst a layer name comes through garbled, and the
    // source name is displayed beside it so that is visible rather than silent.
    const content = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const plan = parseDxf(content, { sourceName: file.name });
    const sheet = detectSheetKind(plan.entities);

    // Only a floor plan belongs to a floor. `פרטי איטום גג.dxf` contains the
    // word "גג", and reading that as "the roof storey" files a sheet of
    // waterproofing details under a floor it has nothing to do with — which
    // then drags it into that floor's package. A filename guess is worth
    // having, but not against a sheet that is not a plan.
    const keepFloorGuess = sheet.kind === 'floor_plan' || sheet.kind === 'unknown';
    const withoutFloor = { ...base };
    if (!keepFloorGuess) delete withoutFloor.floorGuess;

    return { ...withoutFloor, plan, sheet };
  } catch (error) {
    return { ...base, error: error instanceof Error ? error.message : 'הקובץ לא נקרא.' };
  }
}

async function sha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* --------------------------------------------------------------- intent */

/**
 * What the user says they are uploading, chosen before the files are dropped.
 *
 * It is a *prior*, never an override. Detection still runs, and when the two
 * disagree the disagreement is shown — because "I said these were floor plans"
 * is exactly the situation where a details sheet slips through unnoticed.
 */
export type UploadIntent =
  | 'auto'
  | 'floor_plans'
  | 'details'
  | 'sections'
  | 'site'
  | 'bim'
  | 'data';

export interface IntentOption {
  value: UploadIntent;
  label: string;
  description: string;
  /** Formats this intent expects. A file outside the list gets a note. */
  expects: DrawingFormat[];
}

export const UPLOAD_INTENTS: readonly IntentOption[] = [
  {
    value: 'auto',
    label: 'סט תוכניות מלא — זיהוי אוטומטי',
    description: 'גרור הכול. כל קובץ ייבדק לפי תוכנו, ויסווג לתוכנית, פרטים, חתך או חזית בנפרד.',
    expects: ['dxf', 'dwg', 'pdf', 'ifc', 'dgn', 'image'],
  },
  {
    value: 'floor_plans',
    label: 'תוכניות קומה',
    description: 'הגיליונות שמהם מפיקים כמויות. אם קובץ יזוהה כגיליון פרטים תקבל התראה.',
    expects: ['dxf', 'dwg', 'pdf', 'dgn'],
  },
  {
    value: 'details',
    label: 'גיליונות פרטים',
    description: 'פרטי איטום, חיבורים וחתכי קונסטרוקציה. נשמרים כחומר עזר ולא נמדדים.',
    expects: ['dxf', 'dwg', 'pdf'],
  },
  {
    value: 'sections',
    label: 'חתכים וחזיתות',
    description: 'שטח במישור התוכנית חסר משמעות בהם. שטחי חזית נמדדים רק באישור ידני.',
    expects: ['dxf', 'dwg', 'pdf'],
  },
  {
    value: 'site',
    label: 'תנוחה ופיתוח',
    description: 'מפת מדידה, תנוחה, פיתוח שטח. מדידה מתאימה לעבודות עפר ופיתוח.',
    expects: ['dxf', 'dwg', 'pdf', 'dgn'],
  },
  {
    value: 'bim',
    label: 'מודל BIM',
    description: 'IFC נותן כמויות מהמודל עצמו ולא מדידה — הכי מדויק שיש. RVT ו-PLN דורשים ייצוא ל-IFC.',
    expects: ['ifc', 'ifczip', 'ifcxml', 'rvt', 'pln'],
  },
  {
    value: 'data',
    label: 'כתב כמויות או מחירון קיים',
    description: 'אקסל או CSV. נקלט כנתונים להשוואה מול הכמויות שיופקו, לא כשרטוט.',
    expects: ['spreadsheet'],
  },
];

/** Sheet kinds an intent implies, for warning when detection disagrees. */
const INTENT_EXPECTED_SHEET: Partial<Record<UploadIntent, string[]>> = {
  floor_plans: ['floor_plan'],
  details: ['detail_sheet'],
  sections: ['section', 'elevation'],
  site: ['site_plan'],
};

/**
 * Returns a sentence when the user's stated intent and the detected sheet kind
 * disagree, and `null` when they agree or when there is nothing to compare.
 */
export function intentConflict(intent: UploadIntent, sheet: SheetDetection | undefined): string | null {
  if (!sheet || intent === 'auto') return null;
  const expected = INTENT_EXPECTED_SHEET[intent];
  if (!expected || expected.includes(sheet.kind)) return null;

  if (intent === 'floor_plans' && !sheet.measurable) {
    return 'סימנת את הסט כתוכניות קומה, אך הקובץ הזה זוהה כגיליון שלא ניתן למדידה. בדוק אותו לפני ייבוא.';
  }
  return 'סוג הגיליון שזוהה שונה ממה שסימנת עבור הסט. הזיהוי מבוסס על תוכן הקובץ.';
}

/** Note when a file's format is outside what the chosen intent expects. */
export function formatConflict(intent: UploadIntent, format: DrawingFormat): string | null {
  const option = UPLOAD_INTENTS.find((i) => i.value === intent);
  if (!option || intent === 'auto') return null;
  if (option.expects.includes(format)) return null;
  return `הפורמט ${FORMATS[format].label} אינו צפוי בקטגוריה שבחרת.`;
}
