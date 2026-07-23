import { Tier } from '@hospital-ai/shared-types';

/**
 * Deterministic check-in tiering engine (SP2 spec §3).
 *
 * PURE. No I/O, no clock, no model — the tier is a total function of the
 * check-in answers and the clinic's active `EscalationRule` set. This is the
 * single place a tier is decided; it is **never** assigned client-side and there
 * is **no AI** anywhere in it. The app routes to humans; it does not judge.
 *
 * It evaluates the `EscalationRule.conditions` DSL (seeded in SP1 as
 * `placeholder-v1`) against a check-in answer map and returns the **highest**
 * matching tier (`emergency > urgent > routine`) plus the deciding
 * `rule_version` — the values SP2's check-in flow stores on the `CheckIn`.
 */

// ---------------------------------------------------------------------------
// Answer + rule shapes
// ---------------------------------------------------------------------------

/** A single check-in answer: a categorical code, a set of codes, or a number. */
export type AnswerValue = string | string[] | number;

/** The answer map keyed by question ref (e.g. `q4_wound`), per CHECKIN_QUESTIONS. */
export type AnswerMap = Record<string, AnswerValue>;

/**
 * A clinic escalation rule as consumed by the engine. Structurally satisfied by
 * the Prisma `EscalationRule` row (which supplies `version`, `tier`, and a JSON
 * `conditions`), so the check-in service can pass the DB rows straight through.
 */
export interface TierRule {
  /** The rule set version stamped onto the deciding `CheckIn.rule_version`. */
  version: string;
  /** The tier this rule assigns when its conditions match. */
  tier: Tier | string;
  /** The condition DSL (opaque JSON as stored). */
  conditions: unknown;
}

/** The engine's verdict for a check-in. */
export interface TierAssignment {
  tier: Tier;
  ruleVersion: string;
}

// ---------------------------------------------------------------------------
// Condition DSL
// ---------------------------------------------------------------------------

type LeafOp = 'eq' | 'in' | 'gte' | 'lte' | 'includesAny';

interface LeafCondition {
  q: string;
  op: LeafOp;
  value?: string | number;
  values?: Array<string | number>;
}

interface AnyOfCondition {
  anyOf: Condition[];
}

interface AllOfCondition {
  allOf: Condition[];
}

interface DefaultCondition {
  default: boolean;
}

type Condition =
  | LeafCondition
  | AnyOfCondition
  | AllOfCondition
  | DefaultCondition;

// ---------------------------------------------------------------------------
// Tier ordering (by string value, independent of enum identity)
// ---------------------------------------------------------------------------

const TIER_PRIORITY: Record<string, number> = {
  [Tier.emergency]: 3,
  [Tier.urgent]: 2,
  [Tier.routine]: 1,
};

function tierPriority(tier: Tier | string): number {
  return TIER_PRIORITY[tier as string] ?? 0;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function isAnyOf(c: Condition): c is AnyOfCondition {
  return typeof c === 'object' && c !== null && Array.isArray((c as AnyOfCondition).anyOf);
}
function isAllOf(c: Condition): c is AllOfCondition {
  return typeof c === 'object' && c !== null && Array.isArray((c as AllOfCondition).allOf);
}
function isDefault(c: Condition): c is DefaultCondition {
  return typeof c === 'object' && c !== null && 'default' in (c as DefaultCondition);
}

/** Coerce a scalar answer/value to a number for gte/lte; NaN if not numeric. */
function toNumber(v: AnswerValue | string | number | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
}

function evalLeaf(leaf: LeafCondition, answers: AnswerMap): boolean {
  const answer = answers[leaf.q];
  // A missing answer never matches a positive trigger (fail toward routine here;
  // the engine's routine default still guarantees an assignment).
  if (answer === undefined || answer === null) return false;

  switch (leaf.op) {
    case 'eq':
      // Scalar equality only (an array answer is never `eq` a single value).
      return !Array.isArray(answer) && answer === leaf.value;

    case 'in': {
      if (Array.isArray(answer)) return false;
      const set = leaf.values ?? [];
      return set.includes(answer as string | number);
    }

    case 'gte': {
      const a = toNumber(answer);
      const b = toNumber(leaf.value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a >= b;
    }

    case 'lte': {
      const a = toNumber(answer);
      const b = toNumber(leaf.value);
      return !Number.isNaN(a) && !Number.isNaN(b) && a <= b;
    }

    case 'includesAny': {
      const selected = Array.isArray(answer) ? answer : [answer];
      const targets = leaf.values ?? (leaf.value !== undefined ? [leaf.value] : []);
      return selected.some((s) => targets.includes(s as string | number));
    }

    default:
      return false;
  }
}

function evalCondition(cond: Condition, answers: AnswerMap): boolean {
  if (isAnyOf(cond)) return cond.anyOf.some((c) => evalCondition(c, answers));
  if (isAllOf(cond)) return cond.allOf.every((c) => evalCondition(c, answers));
  if (isDefault(cond)) return cond.default === true;
  return evalLeaf(cond as LeafCondition, answers);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class TierEngine {
  /**
   * Assign the highest matching tier for a check-in.
   *
   * Evaluates every rule whose `conditions` match `answers` and returns the one
   * with the highest tier priority (`emergency > urgent > routine`), along with
   * its `version` as `ruleVersion`. When two rules of the same highest tier
   * match, the first in `rules` wins (deterministic given a stable rule order).
   *
   * Throws if no rule matches — a rule set is expected to include a
   * `{ default: true }` routine rule, so a non-match is a configuration error.
   * Fail-loud is deliberate: never silently downgrade a check-in to routine.
   */
  static assign(answers: AnswerMap, rules: readonly TierRule[]): TierAssignment {
    let best: TierRule | undefined;
    let bestPriority = -1;

    for (const rule of rules) {
      if (!evalCondition(rule.conditions as Condition, answers)) continue;
      const p = tierPriority(rule.tier);
      if (p > bestPriority) {
        best = rule;
        bestPriority = p;
      }
    }

    if (!best) {
      throw new Error(
        'TierEngine.assign: no escalation rule matched the check-in answers ' +
          '(a { default: true } routine rule is required).',
      );
    }

    return { tier: best.tier as Tier, ruleVersion: best.version };
  }
}
