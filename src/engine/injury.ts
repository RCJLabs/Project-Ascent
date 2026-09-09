/**
 * What an injury means, in one place (PLAN.md §9.7, M8).
 *
 * Before this, an injury was a body part and nothing else: every part the
 * climber had ever marked was treated identically, and five different
 * systems each decided for themselves what to do about it. So a tweaky
 * finger that was merely worth remembering stripped a warmup as hard as a
 * ruptured pulley, and a part being deliberately loaded again on a
 * return-to-climbing plan looked exactly like one nobody should touch.
 *
 * Severity and status only mean something if they change behaviour. This
 * module is that behaviour, expressed once:
 *
 * - **Excluded** — keep it out. Load on this is not a judgement call.
 * - **Flagged** — show it, mark it, let the climber decide. This is where a
 *   niggle lives, and where a part in its return lives, because the whole
 *   point of coming back is loading it again on purpose.
 *
 * The distinction the prototype had no word for is `returning`: still
 * healing, back to training, needing a warning rather than a wall.
 */

import type { BodyPart } from '@/content/warmups';
import type { Injury, InjurySeverity } from '@/store/profile';

export interface InjuryPolicy {
  /** Kept out of warmups and blocked in the finder. */
  excluded: BodyPart[];
  /** Shown with a warning beside it. */
  flagged: BodyPart[];
  /** Everything recorded, for anything that just needs to know. */
  all: BodyPart[];
}

/** Vitality cost per injury, by how much it is actually costing you. */
export const SEVERITY_COST: Record<InjurySeverity, number> = {
  niggle: 5,
  managing: 20,
  serious: 35,
};

/** A part being loaded again on purpose costs less than one that is not. */
export const RETURNING_RELIEF = 0.5;

export function injuryPolicy(injuries: readonly Injury[]): InjuryPolicy {
  const excluded: BodyPart[] = [];
  const flagged: BodyPart[] = [];
  for (const injury of injuries) {
    // Coming back means loading it deliberately. Excluding it would fight
    // the plan the climber is following.
    if (injury.status === 'returning' || injury.severity === 'niggle') flagged.push(injury.part);
    else excluded.push(injury.part);
  }
  return {
    excluded: [...new Set(excluded)],
    flagged: [...new Set(flagged.filter((p) => !excluded.includes(p)))],
    all: [...new Set(injuries.map((i) => i.part))],
  };
}

/** Everything worth marking on a line of a program: excluded or flagged. */
export function concerning(policy: InjuryPolicy): BodyPart[] {
  return [...policy.excluded, ...policy.flagged];
}

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
