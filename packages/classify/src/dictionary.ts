import type { MeasureType, TradeCode } from '@plan2quote/core';

/**
 * The keyword dictionary.
 *
 * This file is the reason the system needs no model to read a layer name. A
 * layer is called what it is called — `חשמל-תאורה`, `A-WALL`, `ELEC_PWR` — and
 * the mapping from those words to a trade is a fact about the construction
 * industry, not a judgement call. Facts belong in a table.
 *
 * Two properties matter more than coverage:
 *  - **Deterministic.** The same name always classifies the same way, so a
 *    quantity does not change because a vendor retrained something.
 *  - **Inspectable.** Every match points at the exact term that fired, which is
 *    what the "why is this electrical?" popover renders.
 *
 * Coverage grows from use: when a human overrides a classification the
 * correction is stored as an organisation rule and consulted first next time.
 * See `classifier.ts`.
 */

export interface KeywordRule {
  trade: TradeCode;
  /** Hebrew and English terms. Matched against normalised tokens and their stems. */
  terms: readonly string[];
  /**
   * 0–1. How strongly the term implies the trade on its own.
   * 0.9+  the term means nothing else in a building (`ספרינקלר`, `sprinkler`)
   * 0.6–0.8 strongly indicative but shared (`תעלה` — HVAC duct or electrical tray)
   * 0.3–0.5 weak, needs corroboration (`קיר` — every discipline draws walls)
   */
  weight: number;
  /** What this kind of layer is normally measured in, when the term implies one. */
  measureType?: MeasureType;
  /**
   * When set, the term must match a whole token rather than appear inside the
   * name. Used for short terms that would otherwise fire constantly — `ac`
   * inside `place`, `דל` inside `דלוחין`.
   */
  whole?: boolean;
}

export const KEYWORD_RULES: readonly KeywordRule[] = [
  /* --------------------------------------------------------- electrical */
  {
    trade: 'electrical',
    weight: 0.95,
    terms: ['חשמל', 'חשמלי', 'תאורה', 'מאור', 'שקע', 'שקעים', 'מפסק', 'גופי תאורה', 'ספוט', 'לוח חשמל', 'electric', 'electrical', 'elec', 'lighting', 'lite', 'powr'],
  },
  { trade: 'electrical', weight: 0.85, measureType: 'count', terms: ['נקודת מאור', 'נקודות חשמל', 'socket', 'outlet', 'receptacle', 'luminaire', 'fixture'] },
  { trade: 'electrical', weight: 0.7, terms: ['לוח', 'מוליך', 'גנרטור', 'panel', 'switchboard', 'generator', 'conduit'] },
  { trade: 'electrical', weight: 0.6, whole: true, terms: ['e', 'el', 'pwr', 'power'] },

  /* ----------------------------------------------------- low voltage */
  {
    trade: 'lowvoltage',
    weight: 0.95,
    terms: ['תקשורת', 'מתח נמוך', 'אינטרקום', 'מצלמות', 'מצלמה', 'אזעקה', 'בקרת כניסה', 'telecom', 'comm', 'cctv', 'intercom', 'alarm', 'security', 'secn'],
  },
  { trade: 'lowvoltage', weight: 0.75, terms: ['טלפון', 'רמקול', 'בקרה', 'data', 'network', 'audio', 'bms', 'elv'] },
  { trade: 'lowvoltage', weight: 0.6, whole: true, terms: ['tv', 'sat', 'lan', 'it', 't'] },

  /* ----------------------------------------------------------- plumbing */
  {
    trade: 'plumbing',
    weight: 0.95,
    terms: ['אינסטלציה', 'ביוב', 'דלוחין', 'שופכין', 'סניטרי', 'סניטריים', 'נקז', 'קולטן', 'שוחה', 'מרזב', 'plumbing', 'plumb', 'sanitary', 'sanr', 'sewer', 'drainage', 'domw'],
  },
  { trade: 'plumbing', weight: 0.85, measureType: 'length', terms: ['צנרת', 'צינור', 'צינורות', 'pipe', 'piping', 'riser'] },
  { trade: 'plumbing', weight: 0.8, measureType: 'count', terms: ['אסלה', 'כיור', 'מקלחת', 'אמבטיה', 'דוד', 'כלים סניטריים', 'toilet', 'sink', 'shower', 'bath', 'basin', 'fixt'] },
  { trade: 'plumbing', weight: 0.6, terms: ['מים', 'water', 'strm', 'storm'] },

  /* --------------------------------------------------------------- HVAC */
  {
    trade: 'hvac',
    weight: 0.95,
    terms: ['מיזוג', 'מזגן', 'אוורור', 'מאייד', 'מעבה', 'צילר', 'hvac', 'ventilation', 'chiller', 'ahu', 'fcu', 'vrf'],
  },
  { trade: 'hvac', weight: 0.8, measureType: 'length', terms: ['תעלה', 'תעלות', 'duct', 'ductwork'] },
  { trade: 'hvac', weight: 0.7, terms: ['מפוח', 'מפזר', 'fan', 'diffuser', 'grille', 'mech', 'hvc'] },
  { trade: 'hvac', weight: 0.5, whole: true, terms: ['ac', 'm', 'air'] },

  /* ----------------------------------------------------- fire protection */
  {
    trade: 'fire',
    weight: 0.95,
    terms: ['ספרינקלר', 'מתזים', 'כיבוי', 'כיבוי אש', 'גילוי אש', 'גלאי עשן', 'הידרנט', 'מטפה', 'sprinkler', 'sprk', 'sprn', 'firefighting', 'hydrant', 'extinguisher'],
  },
  { trade: 'fire', weight: 0.8, terms: ['גלאי', 'עשן', 'חילוץ', 'מילוט', 'smoke', 'fprot', 'egress'] },
  { trade: 'fire', weight: 0.7, whole: true, terms: ['אש', 'fire', 'f'] },

  /* ---------------------------------------------------------- structure */
  {
    trade: 'structure',
    weight: 0.9,
    measureType: 'volume',
    terms: ['בטון', 'שלד', 'קונסטרוקציה', 'קונסטרוקטיבי', 'concrete', 'structural', 'struct', 'conc'],
  },
  { trade: 'structure', weight: 0.85, terms: ['קורה', 'קורות', 'עמוד', 'עמודים', 'יסוד', 'יסודות', 'כלונס', 'ממד', 'זיון', 'beam', 'column', 'cols', 'foundation', 'fndn', 'rebar', 'slab'] },
  { trade: 'structure', weight: 0.5, whole: true, terms: ['s', 'rc'] },

  /* ------------------------------------------------------------ masonry */
  {
    trade: 'masonry',
    weight: 0.9,
    measureType: 'area',
    terms: ['בנייה', 'בניה', 'בלוק', 'בלוקים', 'לבנים', 'איטונג', 'טרמי', 'masonry', 'mason', 'blockwork', 'brick', 'cmu'],
  },
  { trade: 'masonry', weight: 0.4, measureType: 'area', terms: ['קיר', 'קירות', 'wall'] },

  /* ------------------------------------------------------------ drywall */
  {
    trade: 'drywall',
    weight: 0.95,
    measureType: 'area',
    terms: ['גבס', 'drywall', 'gypsum', 'plasterboard'],
  },
  { trade: 'drywall', weight: 0.7, measureType: 'area', terms: ['מחיצה', 'מחיצות', 'תקרה אקוסטית', 'partition', 'ceiling', 'clng'] },

  /* ------------------------------------------------------------- plaster */
  { trade: 'plaster', weight: 0.95, measureType: 'area', terms: ['טיח', 'שפכטל', 'שליכט', 'plaster', 'render', 'stucco', 'skim'] },

  /* ------------------------------------------------------------ flooring */
  {
    trade: 'flooring',
    weight: 0.95,
    measureType: 'area',
    terms: ['ריצוף', 'ריצופים', 'חיפוי', 'קרמיקה', 'פרקט', 'גרניט', 'אריח', 'אריחים', 'flooring', 'floor', 'flor', 'tile', 'ceramic', 'parquet', 'paving'],
  },
  { trade: 'flooring', weight: 0.7, measureType: 'length', terms: ['סוקל', 'פנל', 'פנלים', 'skirting', 'baseboard'] },
  { trade: 'flooring', weight: 0.6, measureType: 'area', terms: ['שיש', 'שטיח', 'marble', 'carpet', 'finish', 'fnsh'] },

  /* ------------------------------------------------------------ painting */
  { trade: 'painting', weight: 0.9, measureType: 'area', terms: ['צבע', 'צביעה', 'סיד', 'paint', 'painting', 'ptng'] },

  /* ------------------------------------------------------- waterproofing */
  {
    trade: 'waterproofing',
    weight: 0.95,
    measureType: 'area',
    terms: ['איטום', 'יריעות', 'ביטומן', 'פוליאוריטן', 'waterproofing', 'waterproof', 'wproof', 'membrane', 'bitumen', 'damp'],
  },

  /* ------------------------------------------------------------- roofing */
  { trade: 'roofing', weight: 0.85, measureType: 'area', terms: ['רעפים', 'קירוי', 'roofing', 'shingle'] },
  { trade: 'roofing', weight: 0.6, measureType: 'area', terms: ['גג', 'גגות', 'roof'] },

  /* ------------------------------------------------------------ aluminum */
  {
    trade: 'aluminum',
    weight: 0.95,
    measureType: 'area',
    terms: ['אלומיניום', 'ויטרינה', 'מסך זכוכית', 'זיגוג', 'aluminium', 'aluminum', 'alum', 'curtain wall', 'glazing', 'glaz'],
  },
  { trade: 'aluminum', weight: 0.7, terms: ['תריס', 'תריסים', 'זכוכית', 'shutter', 'glass'] },

  /* ------------------------------------------------------- doors/windows */
  {
    trade: 'doors_windows',
    weight: 0.9,
    measureType: 'count',
    terms: ['דלת', 'דלתות', 'חלון', 'חלונות', 'משקוף', 'door', 'doors', 'window', 'windows', 'wndw'],
  },
  { trade: 'doors_windows', weight: 0.5, measureType: 'count', terms: ['פתח', 'פתחים', 'opening'] },

  /* ---------------------------------------------------------- carpentry */
  {
    trade: 'carpentry',
    weight: 0.9,
    measureType: 'count',
    terms: ['נגרות', 'ארון', 'ארונות', 'מטבח', 'carpentry', 'joinery', 'millwork', 'cabinet', 'cabinetry'],
  },
  { trade: 'carpentry', weight: 0.5, terms: ['עץ', 'wood', 'timber'] },

  /* ----------------------------------------------------------- elevator */
  { trade: 'elevator', weight: 0.95, measureType: 'count', terms: ['מעלית', 'מעליות', 'elevator', 'elev', 'lift'] },

  /* --------------------------------------------------------- earthworks */
  {
    trade: 'earthworks',
    weight: 0.9,
    measureType: 'volume',
    terms: ['עפר', 'חפירה', 'חציבה', 'מילוי', 'דיפון', 'כלונסאות', 'earthwork', 'excavation', 'excav', 'shoring', 'backfill'],
  },
  { trade: 'earthworks', weight: 0.6, terms: ['טופוגרפיה', 'topo', 'grading'] },

  /* --------------------------------------------------------- demolition */
  {
    trade: 'demolition',
    weight: 0.95,
    terms: ['הריסה', 'הריסות', 'פירוק', 'להריסה', 'demolition', 'demol', 'demo'],
  },

  /* ---------------------------------------------------------- landscape */
  {
    trade: 'landscape',
    weight: 0.9,
    measureType: 'area',
    terms: ['פיתוח', 'גינון', 'נטיעה', 'landscape', 'landscaping', 'planting', 'plnt', 'hardscape', 'softscape'],
  },
  { trade: 'landscape', weight: 0.6, terms: ['גדר', 'שער', 'קיר תומך', 'בריכה', 'fence', 'gate', 'retaining', 'pool'] },

  /* --------------------------------------------------------- annotation */
  {
    trade: 'annotation',
    weight: 0.98,
    terms: ['defpoints', 'titleblock', 'title block', 'viewport', 'xref'],
  },
  {
    trade: 'annotation',
    weight: 0.9,
    terms: ['הערות', 'כותרת', 'מסגרת', 'מקרא', 'סימון', 'סימונים', 'מידות', 'קוטות', 'צירים', 'annotation', 'annot', 'anno', 'dimension', 'dims', 'legend', 'notes', 'hatchpattern'],
  },
  { trade: 'annotation', weight: 0.7, whole: true, terms: ['טקסט', 'text', 'txt', 'dim', 'note', 'grid', 'axis', 'symbol', 'tblk', 'north'] },
];

/**
 * Terms that describe *how* something is measured rather than what trade owns
 * it. `קיר חוץ - שטח` should measure by area regardless of which trade wins.
 */
export const MEASURE_HINT_TERMS: readonly { measureType: MeasureType; terms: readonly string[] }[] = [
  { measureType: 'area', terms: ['שטח', 'שטחים', 'מ״ר', 'מר', 'area', 'sqm', 'm2'] },
  { measureType: 'length', terms: ['אורך', 'היקף', 'מטר רץ', 'מ״א', 'length', 'perimeter', 'linear', 'lm'] },
  { measureType: 'volume', terms: ['נפח', 'מ״ק', 'volume', 'cbm', 'm3'] },
  { measureType: 'count', terms: ['כמות', 'ספירה', 'יחידות', 'count', 'qty', 'units', 'each'] },
];
