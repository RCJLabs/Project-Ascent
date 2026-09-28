/**
 * An injury in words, and what it costs the altimeter (PLAN.md M345).
 *
 * Out of `injury.ts`, whose policy the first load needs to filter today's
 * session. Describing an injury and pricing it in vitality happen on the
 * injury, calendar and game pages.
 */

import type { Injury, InjurySeverity } from '@/store/profile';
import { injuryPolicy } from './injury';

/**
 * What the injuries cost in vitality.
 *
 * A flat cost per injury made a niggle and a rupture the same number, which
 * meant the honest thing — recording a small one — was punished as hard as
 * the serious one it might prevent.
 */
export function vitalityCost(injuries: readonly Injury[]): number {
  return Math.round(
    injuries.reduce((sum, injury) => {
      const base = SEVERITY_COST[injury.severity] ?? SEVERITY_COST.managing;
      return sum + base * (injury.status === 'returning' ? RETURNING_RELIEF : 1);
    }, 0),
  );
}

/** How long it has been, in the words a summary wants. */
export function describeInjury(injury: Injury): string {
  const side = injury.side && injury.part !== 'back' ? `${injury.side} ` : '';
  const status = injury.status === 'returning' ? 'coming back' : SEVERITY_WORD[injury.severity];
  return `${side}${injury.part} · ${status}`;
}

const SEVERITY_WORD: Record<InjurySeverity, string> = {
  niggle: 'a niggle',
  managing: 'healing',
  serious: 'off it',
};

/**
 * A single line for a coach or a review to use.
 *
 * Excluded parts are named first because they are the ones changing what the
 * app will offer; flagged ones are context.
 */
export function summarise(injuries: readonly Injury[]): string | null {
  if (injuries.length === 0) return null;
  const policy = injuryPolicy(injuries);
  if (policy.excluded.length > 0) {
    return `Training around ${list(policy.excluded)}`;
  }
  return `Watching ${list(policy.flagged)}`;
}

function list(parts: readonly string[]): string {
  if (parts.length === 1) return withArticle(parts[0]!);
  return `${parts.slice(0, -1).map(withArticle).join(', ')} and ${withArticle(parts.at(-1)!)}`;
}

/** "an elbow", "a shoulder" — body parts are the only place this matters. */
function withArticle(word: string): string {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** Vitality cost per injury, by how much it is actually costing you. */
export const SEVERITY_COST: Record<InjurySeverity, number> = {
  niggle: 5,
  managing: 20,
  serious: 35,
};

/** A part being loaded again on purpose costs less than one that is not. */
export const RETURNING_RELIEF = 0.5;
