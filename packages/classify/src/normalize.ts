/**
 * Layer-name normalisation.
 *
 * CAD layer names are a mess by nature: `A-WALL-FULL`, `קירות בטון`, `ELEC_2`,
 * `חשמל-תאורה-קומה2`, `0-מיזוג`. Before anything can be matched against a
 * dictionary the name has to be reduced to comparable tokens, and Hebrew needs
 * more than lowercasing to get there.
 */

/** Hebrew final letters, mapped to their medial forms so `חשמלים`/`חשמלין` compare equal. */
const FINAL_FORMS: Readonly<Record<string, string>> = {
  'ך': 'כ', // ך → כ
  'ם': 'מ', // ם → מ
  'ן': 'נ', // ן → נ
  'ף': 'פ', // ף → פ
  'ץ': 'צ', // ץ → צ
};

/** Niqqud, cantillation and the Hebrew punctuation marks geresh/gershayim. */
const HEBREW_MARKS = /[֑-ׇ׳״]/g;

/**
 * Single-letter Hebrew prefixes that attach directly to a noun (ו, ה, ב, ל, מ,
 * כ, ש). Stripping them turns `וחשמל`, `הקירות`, `בבטון` into the base word.
 * Only applied to tokens long enough that removing a letter still leaves a
 * recognisable stem — otherwise `מים` (water) would become `ים` (sea).
 */
const HEBREW_PREFIXES = /^[והבלמכש]/;

/**
 * Plural and possessive endings, written in *medial* form because stemming runs
 * after `normaliseFinalForms` — by that point the plural `ים` is spelled `ימ`.
 * `יות` is listed before `ות` so the longer ending wins.
 */
const HEBREW_SUFFIXES = /(יות|ימ|ות)$/;

export function stripHebrewMarks(input: string): string {
  return input.replace(HEBREW_MARKS, '');
}

export function normaliseFinalForms(input: string): string {
  return input.replace(/[ךםןףץ]/g, (c) => FINAL_FORMS[c] ?? c);
}

/**
 * Reduces one token to a matching stem.
 *
 * This is deliberately shallow — a real Hebrew morphological analyser would be
 * a dependency and a source of surprises, and for layer names (which are short
 * nouns, not prose) prefix/suffix stripping gets the same answer. Both the raw
 * token and its stem are kept by `tokenise`, so a shallow stem that overreaches
 * cannot lose a match the raw form would have made.
 */
export function stemHebrew(token: string): string {
  let t = token;
  if (t.length >= 4) {
    const stripped = t.replace(HEBREW_SUFFIXES, '');
    if (stripped.length >= 3) t = stripped;
  }
  if (t.length >= 4 && HEBREW_PREFIXES.test(t)) {
    const stripped = t.slice(1);
    if (stripped.length >= 3) t = stripped;
  }
  return t;
}

/**
 * Puts a dictionary term through the same reduction a layer name gets.
 *
 * This has to exist. The dictionary is written the way a person writes Hebrew —
 * `איטום`, `שקעים`, `אלומיניום` — with final letters, while `tokenise` has
 * already rewritten the layer name to medial forms. Without normalising both
 * sides, every term ending in a final letter silently never matches, and the
 * failure is invisible: the layer just comes back unassigned.
 */
export function normaliseTerm(term: string): string {
  return normaliseFinalForms(stripHebrewMarks(term)).toLowerCase().trim();
}

export interface NormalisedName {
  /** Whole name, lowercased and mark-stripped, separators collapsed to single spaces. */
  normalised: string;
  /** Individual tokens, in the order they appeared. */
  tokens: string[];
  /** Tokens plus their Hebrew stems, deduplicated. What the dictionary matches against. */
  searchable: Set<string>;
  /** Numeric runs found in the name, e.g. the `2` in `חשמל-קומה2`. */
  numbers: number[];
}

/**
 * Splits a layer name into tokens.
 *
 * Splits on the usual separators, on the Hebrew/Latin script boundary (CAD
 * users write `ELEC-חשמל` constantly), and on camelCase, but *not* between a
 * letter and a digit — `A2` is a grid reference and `M25` is a concrete grade,
 * and both lose their meaning if you cut them in half. Digit runs are still
 * captured separately in `numbers` for floor detection.
 */
export function tokenise(name: string): NormalisedName {
  const cleaned = normaliseFinalForms(stripHebrewMarks(name)).toLowerCase();

  const spaced = cleaned
    // Separators used in every layer-naming convention there is.
    .replace(/[-_.|/\\,:;()[\]{}#+]+/g, ' ')
    // camelCase → camel Case
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // Script boundary, both directions.
    .replace(/([֐-׿])([a-z0-9])/gi, '$1 $2')
    .replace(/([a-z0-9])([֐-׿])/gi, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = spaced.split(' ').filter((t) => t.length > 0);

  const searchable = new Set<string>();
  for (const t of tokens) {
    searchable.add(t);
    const stem = stemHebrew(t);
    if (stem !== t) searchable.add(stem);
  }

  const numbers: number[] = [];
  for (const match of cleaned.matchAll(/\d+/g)) {
    const n = Number.parseInt(match[0]!, 10);
    if (Number.isFinite(n)) numbers.push(n);
  }

  return { normalised: spaced, tokens, searchable, numbers };
}

/**
 * Floor detection from a layer or block name.
 *
 * Returns the storey number when the name states one unambiguously. Israeli
 * drawings write קומה 3 / ק3 / floor 3 / lvl 3 / L03, and basements as
 * מרתף / חניון / B1. Anything else returns `null` — a wrong floor assignment is
 * worse than none, because it silently moves quantities between packages.
 */
export function detectFloor(name: string): { level: number; label: string } | null {
  const cleaned = normaliseFinalForms(stripHebrewMarks(name)).toLowerCase();

  const basement = cleaned.match(/(?:מרתף|חניון|basement|\bb)\s*[-]?\s*(\d+)?/);
  if (basement && /מרתף|חניון|basement/.test(basement[0])) {
    const n = basement[1] ? Number.parseInt(basement[1], 10) : 1;
    return { level: -n, label: `מרתף ${n}` };
  }

  if (/(?:קרקע|ground|\bgf\b)/.test(cleaned)) return { level: 0, label: 'קומת קרקע' };
  if (/(?:גג|roof)/.test(cleaned)) return { level: 900, label: 'גג' };

  const explicit = cleaned.match(/(?:קומה|קומת|\bק\b|floor|level|lvl|\bl)\s*[-]?\s*(\d{1,2})\b/);
  if (explicit?.[1]) {
    const n = Number.parseInt(explicit[1], 10);
    return { level: n, label: `קומה ${n}` };
  }

  return null;
}
