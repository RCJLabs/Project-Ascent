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

import type { BodyPart } from '@/content/bodyParts';
import type { Injury } from '@/store/profile';

export interface InjuryPolicy {
  /** Kept out of warmups and blocked in the finder. */
  excluded: BodyPart[];
  /** Shown with a warning beside it. */
  flagged: BodyPart[];
  /** Everything recorded, for anything that just needs to know. */
  all: BodyPart[];
}

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
