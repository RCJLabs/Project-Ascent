/**
 * Which sessions a short week should keep, proposed from the program's own
 * data (PLAN.md M64).
 *
 * M55 gave `SessionType` a `priority` and set it on nothing, so every
 * program still drops sessions in the order they happen to be declared in.
 * Filling thirty-seven of those in by hand is a coaching judgement; what
 * this does is read the evidence each program already carries and propose an
 * order from it, with the reasons attached, so the judgement starts from
 * something rather than from a blank field.
 *
 * **It is a proposal and it says when it is guessing.** Where two sessions
 * score the same the program has not said which matters more, and the tie is
 * reported rather than broken quietly — declaration order stands, which is
 * exactly what happened before this existed.
 */

import type { Program, SessionType, SessionTypeId } from '@/content/types';

/** What each piece of evidence is worth, and why it is worth that. */
export const WEIGHTS = {
  /** Scheduled twice in the author's own week: the spine of the program. */
  perSlot: 3,
  /** Something must not be scheduled the day before it — it is protected. */
  protected: 3,
  /** Goes first in the week, which the notes all gloss as "while fresh". */
  first: 2,
  /** On the wall rather than in the gym. In a two-day week, climbing wins. */
  onTheWall: 2,
  /** Needs 48 hours around it, so it is a real stressor. */
  spaced: 1,
  /** The program's own name for it says it is optional. */
  optional: -5,
} as const;

export interface Proposal {
  id: SessionTypeId;
  name: string;
  score: number;
  /** The evidence, in the order it was counted. */
  why: string[];
  /** Shares its score with another session: the data does not choose. */
  tied: boolean;
}

function evidence(program: Program, type: SessionType): { score: number; why: string[] } {
  let score = 0;
  const why: string[] = [];
  const note = (points: number, reason: string) => {
    score += points;
    why.push(`${points > 0 ? '+' : ''}${points} ${reason}`);
  };

  const slots = Object.values(program.recommendedLayout?.slots ?? {}).filter((s) => s === type.id).length;
  if (slots > 0) note(WEIGHTS.perSlot * slots, `in the prescribed week ${slots === 1 ? 'once' : `${slots} times`}`);

  for (const c of program.constraints) {
    if (c.kind === 'not-day-before' && c.before === type.id) {
      note(WEIGHTS.protected, `protected — nothing goes the day before it`);
    }
    if (c.kind === 'order-in-week' && c.first === type.id) {
      note(WEIGHTS.first, 'goes first in the week, while fresh');
    }
    if (c.kind === 'min-gap-hours' && c.between.includes(type.id)) {
      note(WEIGHTS.spaced, `needs ${c.hours} hours around it`);
    }
  }

  if (Object.keys(type.drillsByWeek ?? {}).length > 0) note(WEIGHTS.onTheWall, 'is climbing, not accessory work');
  if (/optional/i.test(type.name)) note(WEIGHTS.optional, 'the program calls it optional');

  return { score, why };
}

/**
 * The proposed order, best first. Rest types are left out: they are not a
 * session to keep or drop.
 */
export function proposePriority(program: Program): Proposal[] {
  const work = program.sessionTypes.filter((t) => !t.isRest);
  const scored = work.map((type) => {
    const { score, why } = evidence(program, type);
    return { id: type.id, name: type.name, score, why };
  });

  const counts = new Map<number, number>();
  for (const s of scored) counts.set(s.score, (counts.get(s.score) ?? 0) + 1);

  return scored
    // A tie keeps declaration order — the behaviour a program without
    // priorities already had — which `sort` gives for free: it has been
    // required to be stable since ES2019, and `scored` is built in
    // declaration order. Saying it twice would be code no test could kill.
    .sort((a, b) => b.score - a.score)
    .map(({ id, name, score, why }) => ({ id, name, score, why, tied: (counts.get(score) ?? 0) > 1 }));
}

/** True when the proposal would change which sessions a short week keeps. */
export function movesAnything(program: Program): boolean {
  const proposed = proposePriority(program).map((p) => p.id);
  const declared = program.sessionTypes.filter((t) => !t.isRest).map((t) => t.id);
  return proposed.some((id, i) => id !== declared[i]);
}
