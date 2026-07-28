import type {
  ClassificationEvidence,
  LayerClassification,
  MeasureType,
  PlanEntity,
  TradeCode,
} from '@plan2quote/core';
import { tradeMeta } from '@plan2quote/core';
import { KEYWORD_RULES, MEASURE_HINT_TERMS } from './dictionary.js';
import { matchDiscipline, matchStandard } from './standards.js';
import { computeLayerStats, inferFromGeometry, type LayerStats } from './geometric-hints.js';
import { normaliseTerm, tokenise } from './normalize.js';

/**
 * Dictionary terms, reduced once at module load so every lookup compares
 * like with like. `display` keeps the original spelling for the evidence list —
 * a user should read "נמצאה המילה איטום", not "איטומ".
 */
const PREPARED_RULES = KEYWORD_RULES.map((rule) => ({
  ...rule,
  terms: rule.terms.map((term) => ({ display: term, key: normaliseTerm(term) })),
}));

const PREPARED_MEASURE_HINTS = MEASURE_HINT_TERMS.map((hint) => ({
  ...hint,
  terms: hint.terms.map((term) => ({ display: term, key: normaliseTerm(term) })),
}));

/**
 * The classifier.
 *
 * Four sources of evidence, consulted in descending order of trust:
 *
 *   1. **Organisation rules** — a correction somebody in this organisation made
 *      before. If a human once said `שכבה-7` is plumbing, it is plumbing.
 *   2. **Layer standards** — AIA / ISO codes, which are machine-readable by
 *      design.
 *   3. **Keyword dictionary** — the trade vocabulary, Hebrew and English.
 *   4. **Geometry** — what the layer actually contains.
 *
 * The result carries every piece of evidence that fired, which is the property
 * that makes this approach preferable to a model here and not merely cheaper:
 * a subcontractor disputing a quantity can be shown the sentence that caused
 * it, and a wrong rule can be fixed permanently in one click.
 */

/** A correction learned from a human, scoped to an organisation. */
export interface OrgRule {
  id: string;
  /** What to match against the layer's source name. */
  pattern: string;
  matchType: 'exact' | 'contains' | 'regex';
  trade: TradeCode;
  measureType?: MeasureType;
  /** How many times this rule has been confirmed rather than overridden. */
  hitCount?: number;
}

export interface ClassifyInput {
  sourceKey: string;
  sourceName: string;
  /** Entities on this layer. Optional — name-only classification still works. */
  entities?: readonly PlanEntity[];
  /** Precomputed stats, if the caller already has them. */
  stats?: LayerStats;
  /** Organisation rules, highest priority. */
  orgRules?: readonly OrgRule[];
  /** A human's explicit choice. Short-circuits everything else. */
  manual?: { trade: TradeCode; measureType: MeasureType };
}

export function classifyLayer(input: ClassifyInput): LayerClassification {
  const { sourceKey, sourceName } = input;

  if (input.manual) {
    return {
      sourceKey,
      trade: input.manual.trade,
      measureType: input.manual.measureType,
      confidence: 1,
      source: 'manual',
      evidence: [
        {
          kind: 'manual',
          matched: tradeMeta(input.manual.trade).he,
          weight: 1,
          explanation: 'שויך ידנית על ידי משתמש. כללים אוטומטיים לא ידרסו את זה.',
        },
      ],
    };
  }

  const stats = input.stats ?? computeLayerStats(input.entities ?? []);
  const geometry = inferFromGeometry(stats);
  const evidence: ClassificationEvidence[] = [];

  /* ------------------------------------------------- 1. organisation rules */
  const orgMatch = matchOrgRule(sourceName, input.orgRules ?? []);
  if (orgMatch) {
    evidence.push({
      kind: 'org_rule',
      matched: orgMatch.pattern,
      weight: 1,
      explanation: `כלל ארגוני קיים: שכבות שמתאימות ל־"${orgMatch.pattern}" משויכות ל${tradeMeta(orgMatch.trade).he}.`,
    });
    if (geometry.confidence > 0) {
      evidence.push({ kind: 'geometry_hint', matched: geometry.explanation, weight: geometry.confidence, explanation: geometry.explanation });
    }
    return {
      sourceKey,
      trade: orgMatch.trade,
      measureType: orgMatch.measureType ?? geometry.measureType,
      confidence: 0.98,
      source: 'org_rule',
      evidence,
    };
  }

  /* ------------------------------------------------------- 2. CAD standard */
  const standard = matchStandard(sourceName);
  if (standard) {
    const trade = standard.demolition ? 'demolition' : standard.match.trade;
    evidence.push({
      kind: 'layer_standard',
      matched: standard.match.code.toUpperCase(),
      weight: 0.9,
      explanation: `שם השכבה עומד בתקן AIA: ${standard.match.code.toUpperCase()} = ${standard.match.label}.`,
    });
    if (standard.demolition) {
      evidence.push({
        kind: 'layer_standard',
        matched: 'DEMO',
        weight: 0.95,
        explanation: 'סיומת DEMO בשם השכבה — סווג כהריסה ולא כמקצוע המקורי.',
      });
    }
    return {
      sourceKey,
      trade,
      measureType: overrideMeasure(sourceName, standard.match.measureType, evidence),
      confidence: 0.9,
      source: 'layer_standard',
      evidence,
    };
  }

  /* ------------------------------------------------- 3. keyword dictionary */
  const keyword = scoreKeywords(sourceName);
  if (keyword && keyword.score >= 0.4) {
    evidence.push(...keyword.evidence);
    if (geometry.confidence >= 0.5) {
      evidence.push({ kind: 'geometry_hint', matched: geometry.explanation, weight: geometry.confidence, explanation: geometry.explanation });
    }
    // A close runner-up means the name genuinely supports two readings. Saying
    // so lowers the confidence, which is what pushes the row into the review
    // queue instead of straight into a quote.
    const ambiguity = keyword.runnerUp ? Math.max(0, 1 - (keyword.score - keyword.runnerUp.score)) : 0;
    if (keyword.runnerUp && ambiguity > 0.7) {
      evidence.push({
        kind: 'keyword',
        matched: tradeMeta(keyword.runnerUp.trade).he,
        weight: keyword.runnerUp.score,
        explanation: `השם מתאים גם ל${tradeMeta(keyword.runnerUp.trade).he} במידה דומה — נדרש אישור אנושי.`,
      });
    }
    const confidence = clamp(keyword.score * (1 - ambiguity * 0.35));
    return {
      sourceKey,
      trade: keyword.trade,
      measureType: overrideMeasure(sourceName, keyword.measureType ?? geometry.measureType, evidence),
      confidence,
      source: 'keyword',
      evidence,
    };
  }

  /* ------------------------------------ 4. discipline letter, then geometry */
  const discipline = matchDiscipline(sourceName);
  if (discipline) {
    evidence.push({
      kind: 'layer_standard',
      matched: sourceName.split(/[-_]/)[0]!.toUpperCase(),
      weight: 0.55,
      explanation: `אות הדיסציפלינה בתחילת השם מרמזת על ${tradeMeta(discipline).he}, אך קוד המקצוע לא זוהה.`,
    });
    return {
      sourceKey,
      trade: discipline,
      measureType: overrideMeasure(sourceName, geometry.measureType, evidence),
      confidence: 0.55,
      source: 'layer_standard',
      evidence,
    };
  }

  if (geometry.trade === 'annotation') {
    evidence.push({ kind: 'geometry_hint', matched: geometry.explanation, weight: geometry.confidence, explanation: geometry.explanation });
    return {
      sourceKey,
      trade: 'annotation',
      measureType: geometry.measureType,
      confidence: geometry.confidence,
      source: 'geometry_hint',
      evidence,
    };
  }

  // Nothing named the trade. We still know how to measure it, which is most of
  // the work — the user picks the trade from a list with the geometry hint
  // already applied.
  evidence.push({
    kind: 'none',
    matched: sourceName,
    weight: 0,
    explanation: 'שם השכבה לא תואם אף מילת מפתח, תקן או כלל ארגוני. נדרש שיוך ידני.',
  });
  if (geometry.confidence > 0) {
    evidence.push({ kind: 'geometry_hint', matched: geometry.explanation, weight: geometry.confidence, explanation: geometry.explanation });
  }

  return {
    sourceKey,
    trade: 'unassigned',
    measureType: geometry.measureType,
    confidence: 0,
    source: 'none',
    evidence,
  };
}

/** Classifies every layer of a plan in one pass, sharing the entity grouping. */
export function classifyPlan(
  layers: readonly { sourceKey: string; sourceName: string }[],
  entities: readonly PlanEntity[],
  options: { orgRules?: readonly OrgRule[]; manual?: Record<string, { trade: TradeCode; measureType: MeasureType }> } = {},
): LayerClassification[] {
  const byLayer = new Map<string, PlanEntity[]>();
  for (const e of entities) {
    const list = byLayer.get(e.layerKey);
    if (list) list.push(e);
    else byLayer.set(e.layerKey, [e]);
  }

  return layers.map((layer) =>
    classifyLayer({
      sourceKey: layer.sourceKey,
      sourceName: layer.sourceName,
      entities: byLayer.get(layer.sourceKey) ?? [],
      orgRules: options.orgRules,
      manual: options.manual?.[layer.sourceKey],
    }),
  );
}

/* ------------------------------------------------------------------ internals */

function matchOrgRule(sourceName: string, rules: readonly OrgRule[]): OrgRule | null {
  const name = sourceName.toLowerCase().trim();
  // Exact beats contains beats regex, and within a tier the most-confirmed rule
  // wins — so an organisation's habits sharpen the ordering over time without
  // anybody maintaining it.
  const tiers: OrgRule['matchType'][] = ['exact', 'contains', 'regex'];
  for (const tier of tiers) {
    const candidates = rules
      .filter((r) => r.matchType === tier && ruleMatches(r, name))
      .sort((a, b) => (b.hitCount ?? 0) - (a.hitCount ?? 0));
    if (candidates[0]) return candidates[0];
  }
  return null;
}

function ruleMatches(rule: OrgRule, name: string): boolean {
  const pattern = rule.pattern.toLowerCase().trim();
  switch (rule.matchType) {
    case 'exact':
      return name === pattern;
    case 'contains':
      return name.includes(pattern);
    case 'regex':
      try {
        return new RegExp(rule.pattern, 'i').test(name);
      } catch {
        // A malformed stored pattern must never take the import down.
        return false;
      }
  }
}

interface KeywordScore {
  trade: TradeCode;
  score: number;
  measureType?: MeasureType;
  evidence: ClassificationEvidence[];
  runnerUp?: { trade: TradeCode; score: number };
}

function scoreKeywords(sourceName: string): KeywordScore | null {
  const { normalised, searchable } = tokenise(sourceName);

  const perTrade = new Map<TradeCode, { weights: number[]; evidence: ClassificationEvidence[]; measureType?: MeasureType }>();

  for (const rule of PREPARED_RULES) {
    for (const term of rule.terms) {
      const hit = rule.whole ? searchable.has(term.key) : matchesLoosely(term.key, normalised, searchable);
      if (!hit) continue;

      const bucket = perTrade.get(rule.trade) ?? { weights: [], evidence: [] };
      bucket.weights.push(rule.weight);
      bucket.evidence.push({
        kind: 'keyword',
        matched: term.display,
        weight: rule.weight,
        explanation: `נמצאה המילה "${term.display}" בשם השכבה → ${tradeMeta(rule.trade).he}.`,
      });
      if (rule.measureType && !bucket.measureType) bucket.measureType = rule.measureType;
      perTrade.set(rule.trade, bucket);
      break; // One hit per rule is enough; listing synonyms adds noise, not signal.
    }
  }

  if (perTrade.size === 0) return null;

  const scored = [...perTrade.entries()]
    .map(([trade, bucket]) => ({
      trade,
      // Noisy-OR: two independent 0.6 signals are stronger than one, but never
      // reach certainty. Plain addition would let three weak terms outrank one
      // decisive one.
      score: 1 - bucket.weights.reduce((acc, w) => acc * (1 - w), 1),
      measureType: bucket.measureType,
      evidence: bucket.evidence.sort((a, b) => b.weight - a.weight),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]!;
  return {
    trade: best.trade,
    score: best.score,
    measureType: best.measureType,
    evidence: best.evidence,
    runnerUp: scored[1] ? { trade: scored[1].trade, score: scored[1].score } : undefined,
  };
}

/**
 * A term matches when it is a whole token, the stem of a token, or — for terms
 * of four characters or more — a substring of the name. The length floor is
 * what stops `ac` matching `place` and `אש` matching `ראשי`.
 */
function matchesLoosely(term: string, normalised: string, searchable: Set<string>): boolean {
  if (searchable.has(term)) return true;
  if (term.includes(' ')) return normalised.includes(term);
  if (term.length < 4) return false;
  return normalised.includes(term);
}

/** A `שטח` / `אורך` / `נפח` word in the name overrides whatever the trade implied. */
function overrideMeasure(
  sourceName: string,
  fallback: MeasureType,
  evidence: ClassificationEvidence[],
): MeasureType {
  const { searchable, normalised } = tokenise(sourceName);
  for (const hint of PREPARED_MEASURE_HINTS) {
    for (const term of hint.terms) {
      if (searchable.has(term.key) || (term.key.length >= 4 && normalised.includes(term.key))) {
        evidence.push({
          kind: 'keyword',
          matched: term.display,
          weight: 0.8,
          explanation: `המילה "${term.display}" בשם השכבה קובעת את סוג המדידה.`,
        });
        return hint.measureType;
      }
    }
  }
  return fallback;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Turns a human's correction into a reusable rule.
 *
 * The generalisation is deliberately conservative: an exact-name rule, not a
 * pattern guessed from the name. A pattern that over-generalises would silently
 * misclassify future layers, and the whole value of this path is that it never
 * surprises anybody. Broader patterns are something a user writes on purpose in
 * the rules screen.
 */
export function ruleFromCorrection(
  sourceName: string,
  trade: TradeCode,
  measureType: MeasureType,
): Omit<OrgRule, 'id'> {
  return { pattern: sourceName.trim(), matchType: 'exact', trade, measureType, hitCount: 1 };
}
