/**
 * Format detection by content.
 *
 * The extension is a claim, not a fact. Files arrive renamed constantly —
 * `קומה 3.dxf` that is really a PDF export, `plan.dwg` that somebody saved as
 * DXF, a `.zip` that is actually an IFCZIP. Trusting the name means handing the
 * wrong parser a file and reporting "corrupt drawing" for something that is
 * perfectly fine.
 *
 * So the first thing that happens to an uploaded file is that its first bytes
 * are read and matched against known signatures. The extension is kept, and
 * when the two disagree the user is told — because a mismatch is usually
 * harmless and occasionally the whole explanation for a weird result.
 */

export type DrawingFormat =
  // Vector CAD
  | 'dxf'
  | 'dxf_binary'
  | 'dwg'
  | 'dwf'
  | 'dgn'
  // BIM
  | 'ifc'
  | 'ifczip'
  | 'ifcxml'
  | 'rvt'
  | 'pln'
  | 'skp'
  | 'rhino3dm'
  // Documents and images
  | 'pdf'
  | 'svg'
  | 'image'
  // Tabular — bills of quantities, door schedules
  | 'spreadsheet'
  | 'zip'
  | 'unknown';

/** What the system can do with a format today. */
export type FormatSupport =
  /** Read in the browser, immediately, with full layer and scale fidelity. */
  | 'client'
  /** Read by the worker — needs a binary converter or a heavy library. */
  | 'worker'
  /** Stored and shown, never measured. Reference material. */
  | 'reference'
  /** Not accepted. */
  | 'unsupported';

export interface FormatInfo {
  format: DrawingFormat;
  /** Hebrew label for the UI. */
  label: string;
  support: FormatSupport;
  /** Extensions normally carrying this format. */
  extensions: string[];
  /**
   * `true` for formats that share an extension with another and can only be
   * told apart by their bytes. Excluded from extension-based lookup, because
   * two formats claiming `.dxf` means whichever is declared last silently wins.
   */
  signatureOnly?: boolean;
  /** Why it is handled the way it is. Shown in the supported-formats panel. */
  note: string;
}

export const FORMATS: Readonly<Record<DrawingFormat, FormatInfo>> = {
  dxf: {
    format: 'dxf',
    label: 'DXF — שרטוט אוטוקאד (טקסט)',
    support: 'client',
    extensions: ['dxf'],
    note: 'הפורמט הכי אמין: שכבות אמיתיות מטבלת השכבות, ויחידות מוצהרות בכותרת. נקרא מיד בדפדפן.',
  },
  dxf_binary: {
    format: 'dxf_binary',
    label: 'DXF בינארי',
    support: 'worker',
    extensions: ['dxf'],
    signatureOnly: true,
    note: 'אותו מידע כמו DXF טקסט, בקידוד בינארי. נבדל מ-DXF רגיל רק לפי החתימה בתחילת הקובץ, ולכן מזוהה לפי תוכן בלבד. מומר בשרת.',
  },
  dwg: {
    format: 'dwg',
    label: 'DWG — אוטוקאד',
    support: 'worker',
    extensions: ['dwg', 'dwt'],
    note: 'מומר ל-DXF בשרת (ODA File Converter, ובנפילה LibreDWG). שומר על כל השכבות.',
  },
  dwf: {
    format: 'dwf',
    label: 'DWF / DWFx — פורמט הפצה של אוטודסק',
    support: 'worker',
    extensions: ['dwf', 'dwfx'],
    note: 'פורמט צפייה. שומר שכבות אך לא תמיד גאומטריה מדויקת — עדיף לבקש DWG או DXF.',
  },
  dgn: {
    format: 'dgn',
    label: 'DGN — MicroStation / Bentley',
    support: 'worker',
    extensions: ['dgn'],
    note: 'נפוץ בתשתיות ובפרויקטים ציבוריים. מומר בשרת; רמות (levels) הופכות לשכבות.',
  },
  ifc: {
    format: 'ifc',
    label: 'IFC — מודל BIM',
    support: 'worker',
    extensions: ['ifc'],
    note: 'הכי מדויק מכולם: כמויות מגיעות מ-IfcElementQuantity ולא נמדדות בכלל.',
  },
  ifczip: {
    format: 'ifczip',
    label: 'IFCZIP — מודל BIM דחוס',
    support: 'worker',
    extensions: ['ifczip'],
    note: 'IFC ארוז. נפרס בשרת ומטופל כמו IFC.',
  },
  ifcxml: {
    format: 'ifcxml',
    label: 'ifcXML',
    support: 'worker',
    extensions: ['ifcxml'],
    note: 'IFC בייצוג XML. פחות נפוץ, מטופל כמו IFC.',
  },
  rvt: {
    format: 'rvt',
    label: 'RVT — Revit',
    support: 'reference',
    extensions: ['rvt', 'rfa'],
    note: 'פורמט סגור של אוטודסק שאין לו קורא חופשי. בקש מהאדריכל ייצוא ל-IFC או ל-DWG.',
  },
  pln: {
    format: 'pln',
    label: 'PLN — ArchiCAD',
    support: 'reference',
    extensions: ['pln', 'pla', 'mod'],
    note: 'פורמט סגור של Graphisoft. בקש ייצוא ל-IFC או ל-DWG.',
  },
  skp: {
    format: 'skp',
    label: 'SKP — SketchUp',
    support: 'reference',
    extensions: ['skp'],
    note: 'מודל הדמיה, לא שרטוט ביצוע. לא מתאים לכתב כמויות.',
  },
  rhino3dm: {
    format: 'rhino3dm',
    label: '3DM — Rhino',
    support: 'reference',
    extensions: ['3dm'],
    note: 'מודל גאומטרי חופשי. אפשרי לצפייה, לא לכתב כמויות.',
  },
  pdf: {
    format: 'pdf',
    label: 'PDF',
    support: 'worker',
    extensions: ['pdf'],
    note: 'אם ה-PDF יצא מאוטוקאד הוא מכיל שכבות אמיתיות (OCG) והוא כמעט טוב כמו DXF. אם הוא סריקה — נדרש OCR ואישור ידני.',
  },
  svg: {
    format: 'svg',
    label: 'SVG',
    support: 'worker',
    extensions: ['svg'],
    note: 'וקטורי, אך ללא יחידות אמיתיות. דורש כיול קנה מידה ידני.',
  },
  image: {
    format: 'image',
    label: 'סריקה או תמונה',
    support: 'worker',
    extensions: ['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'heic'],
    note: 'אין שכבות ואין קנה מידה. נדרשים 300dpi לפחות, כיול ידני, ואישור אנושי לכל כמות.',
  },
  spreadsheet: {
    format: 'spreadsheet',
    label: 'אקסל / CSV',
    support: 'reference',
    extensions: ['xlsx', 'xls', 'csv'],
    note: 'כתב כמויות קיים, רשימת דלתות או מחירון. נקלט כנתונים, לא כשרטוט.',
  },
  zip: {
    format: 'zip',
    label: 'ארכיון ZIP',
    support: 'worker',
    extensions: ['zip'],
    note: 'נפרס בשרת וכל קובץ בתוכו נבדק בנפרד.',
  },
  unknown: {
    format: 'unknown',
    label: 'לא מזוהה',
    support: 'unsupported',
    extensions: [],
    note: 'לא ניתן לזהות את הקובץ לא לפי הסיומת ולא לפי תוכנו.',
  },
};

export interface DetectionResult {
  /** What the bytes say. This is what decides which parser runs. */
  format: DrawingFormat;
  /** What the filename claimed. */
  fromExtension: DrawingFormat;
  /** How the decision was made. */
  source: 'signature' | 'extension' | 'none';
  /**
   * `true` when the content and the extension disagree. Not an error — a
   * renamed file usually works fine — but the user is told, because it is
   * occasionally the entire explanation for a strange result.
   */
  mismatch: boolean;
  /** Hebrew sentence, shown on the file's row. */
  explanation: string;
}

const EXTENSION_MAP: Readonly<Record<string, DrawingFormat>> = Object.fromEntries(
  Object.values(FORMATS)
    .filter((info) => !info.signatureOnly)
    .flatMap((info) => info.extensions.map((ext) => [ext, info.format])),
);

export function formatFromExtension(filename: string): DrawingFormat {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_MAP[ext] ?? 'unknown';
}

/**
 * Matches the leading bytes against known signatures.
 *
 * Only the first 512 bytes are needed, which matters: the caller reads a slice
 * rather than the whole file, so sniffing a 400 MB DWG costs nothing.
 */
export function formatFromSignature(head: Uint8Array): DrawingFormat {
  const ascii = latin1(head, 0, Math.min(head.length, 512));

  // AutoCAD DWG: an ASCII version tag right at the start. AC1006 is R10 and
  // AC1032 is 2018; anything in that family is a DWG.
  if (/^AC10[0-9A-F]{2}/.test(ascii)) return 'dwg';

  if (ascii.startsWith('AutoCAD Binary DXF')) return 'dxf_binary';

  if (ascii.startsWith('%PDF-')) return 'pdf';

  // IFC is a STEP physical file.
  if (ascii.includes('ISO-10303-21')) return 'ifc';

  // Rhino writes its name in plain text.
  if (ascii.startsWith('3D Geometry File Format')) return 'rhino3dm';

  if (ascii.startsWith('(sketchup') || ascii.includes('SketchUp Model')) return 'skp';

  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47])) return 'image'; // PNG
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'image'; // JPEG
  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00])) return 'image'; // TIFF little-endian
  if (startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) return 'image'; // TIFF big-endian
  if (startsWith(head, [0x42, 0x4d])) return 'image'; // BMP

  // OLE compound document. Revit, DGN v8, and old Office files all use it, so
  // the container alone cannot decide — the extension breaks the tie.
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return 'unknown';

  // MicroStation DGN v7.
  if (startsWith(head, [0x08, 0x09, 0xfe, 0xff]) || startsWith(head, [0xc8, 0x09, 0xfe, 0xff])) {
    return 'dgn';
  }

  // Zip container. IFCZIP, DWFx, XLSX and SKP all live inside one; the entry
  // names would settle it, but reading them needs an unzip, so the extension
  // decides and the caller may correct it later.
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return 'zip';

  const trimmed = ascii.trimStart();
  if (trimmed.startsWith('<svg') || (trimmed.startsWith('<?xml') && ascii.includes('<svg'))) {
    return 'svg';
  }
  if (trimmed.startsWith('<?xml') && /<(ifcXML|ex:iso_10303_28)/i.test(ascii)) return 'ifcxml';

  // ASCII DXF. It opens with group code 0 followed by SECTION, but real files
  // are written with varying leading whitespace and line endings, and many
  // start with a 999 comment block. Matching the group-code shape rather than a
  // fixed prefix is what makes this hold across exporters.
  if (/^\s*(999\s|\s*0\s*[\r\n]+\s*SECTION)/.test(ascii)) return 'dxf';
  if (/^\s*0\s*[\r\n]+\s*SECTION/.test(ascii)) return 'dxf';

  return 'unknown';
}

/** Combines both signals into the decision the pipeline acts on. */
export function detectFormat(filename: string, head: Uint8Array): DetectionResult {
  const fromExtension = formatFromExtension(filename);
  const fromSignature = formatFromSignature(head);

  // A zip or an OLE container is a real signature that simply is not specific
  // enough. In that case the extension is the better answer, not a conflict.
  const containerOnly = fromSignature === 'zip' || fromSignature === 'unknown';

  if (!containerOnly) {
    // Text and binary DXF share an extension by design, so one resolving to the
    // other is not a renamed file and must not be reported as one.
    const sameFamily =
      (fromExtension === 'dxf' && fromSignature === 'dxf_binary') ||
      (fromExtension === 'dxf_binary' && fromSignature === 'dxf');
    const mismatch = fromExtension !== 'unknown' && fromExtension !== fromSignature && !sameFamily;
    return {
      format: fromSignature,
      fromExtension,
      source: 'signature',
      mismatch,
      explanation: mismatch
        ? `הקובץ נקרא "${filename}" אך תוכנו הוא ${FORMATS[fromSignature].label}. המערכת מתייחסת אליו לפי התוכן.`
        : `זוהה לפי תוכן הקובץ: ${FORMATS[fromSignature].label}.`,
    };
  }

  if (fromExtension !== 'unknown') {
    return {
      format: fromExtension,
      fromExtension,
      source: 'extension',
      mismatch: false,
      explanation:
        fromSignature === 'zip'
          ? `הקובץ הוא ארכיון דחוס; לפי הסיומת מדובר ב-${FORMATS[fromExtension].label}.`
          : `לא נמצאה חתימה חד-משמעית בתוכן; זוהה לפי הסיומת כ-${FORMATS[fromExtension].label}.`,
    };
  }

  return {
    format: 'unknown',
    fromExtension,
    source: 'none',
    mismatch: false,
    explanation: 'לא ניתן לזהות את הקובץ — לא לפי הסיומת ולא לפי תוכנו.',
  };
}

/** Formats grouped for the "what can I upload?" panel. */
export const FORMAT_GROUPS: readonly { title: string; formats: DrawingFormat[] }[] = [
  { title: 'שרטוטי CAD', formats: ['dxf', 'dwg', 'dxf_binary', 'dgn', 'dwf'] },
  { title: 'מודלים ו-BIM', formats: ['ifc', 'ifczip', 'ifcxml', 'rvt', 'pln', 'skp', 'rhino3dm'] },
  { title: 'מסמכים וסריקות', formats: ['pdf', 'svg', 'image'] },
  { title: 'נתונים', formats: ['spreadsheet', 'zip'] },
];

/* ------------------------------------------------------------------ helpers */

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, i) => bytes[i] === byte);
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]!);
  return out;
}
