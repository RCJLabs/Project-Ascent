/**
 * Lead against top-rope, which nothing read until now (PLAN.md M133).
 *
 * M108 asked two questions of a climb and built an engine for one of them.
 * `angle` got `angles.ts`, a Progress card and a sentence that refuses to
 * call a gap a weakness. `ropeStyle` got a chip in the logger, a field on
 * `Climb`, a doc comment saying *"the same route is a different climb on
 * each"* — and no reader at all. It was typed, stored, and never once asked
 * a question of.
 *
 * For a route climber it is the difference that defines the ascent. A 5.12
 * on top-rope is a 5.12 you have done the moves on; the same grade led is a
 * different achievement, and a climber whose hardest is on a top-rope has a
 * lead ceiling somewhere below it that nothing in the app could see.
 *
 * ## The same three rules `angles.ts` follows, for the same reasons
 *
 * **Nothing is inferred.** An absent `ropeStyle` is a climb logged by
 * someone who did not answer, not a top-rope. Every log written before M108
 * is entirely absent, and most written since.
 *
 * **Coverage first.** How many of the climbs on this ladder say which, before
 * anything at all about the split of them.
 *
 * **The gap is a fact and not a verdict.** Leading is a skill with its own
 * fear in it, and there are real reasons a log is all top-rope — an autobelay
 * gym, a partner who does not lead, a shoulder. The app states the two
 * numbers and the rungs between them, and says nothing about which of them
 * is the problem.
 *
 * Routes only. Rope style is a question about a rope, the logger only offers
 * the chips on the YDS ladder, and a boulder that carries one is a typo.
 *
 * Pure: sessions in, a reading out.
 */

import type { Climb, RopeStyle, Session } from '@/db/sessions';
import { addClimb, emptyTally, type GradeTally } from './derive';
import { DEFAULT_DISPLAY, displayGrade, gradeOrdinal, type GradeDisplay } from './grades';

/** Lead first: it is the harder question and the one a climber sorts on. */
export const ROPE_ORDER: RopeStyle[] = ['lead', 'toprope'];

export const ROPE_LABEL: Record<RopeStyle, string> = {
  lead: 'Lead',
  toprope: 'Top-rope',
};

/** Routes carrying a rope style before any of this is worth reading. */
export const ENOUGH_ROUTES = 8;

export interface RopeSide {
  style: RopeStyle;
  tally: GradeTally;
}

export interface RopeSplit {
  /** Only the styles actually logged, lead first. */
  sides: RopeSide[];
  /** Routes that say which. */
  said: number;
  /** Routes in total, so coverage can be honest. */
  total: number;
  /** True until enough routes say which for the split to mean anything. */
  thin: boolean;
}

export function ropeSplit(sessions: readonly Session[]): RopeSplit {
  const tallies = new Map<RopeStyle, GradeTally>();
  let said = 0;
  let total = 0;

  for (const session of sessions) {
    if (!session.completed) continue;
    for (const climb of (session.climbs ?? []) as Climb[]) {
      if (climb.scale !== 'YDS') continue;
      total += climb.count;
      if (climb.ropeStyle === undefined) continue;
      said += climb.count;
      const tally = tallies.get(climb.ropeStyle) ?? emptyTally();
      addClimb(tally, climb);
      tallies.set(climb.ropeStyle, tally);
    }
  }

  return {
    sides: ROPE_ORDER.filter((s) => tallies.has(s)).map((s) => ({ style: s, tally: tallies.get(s)! })),
    said,
    total,
    thin: said < ENOUGH_ROUTES,
  };
}

/** The side, if it is there and has a send on it. */
function best(split: RopeSplit, style: RopeStyle): string | null {
  return split.sides.find((s) => s.style === style)?.tally.best ?? null;
}

/**
 * The split, in a sentence, or nothing.
 *
 * Coverage first. Then the two ceilings and the rungs between them — and no
 * word about which of them is the problem.
 */
export function describeRopeSplit(
  split: RopeSplit,
  display: GradeDisplay = DEFAULT_DISPLAY,
): string | null {
  if (split.said === 0) return null;
  const coverage = `${split.said} of your ${split.total} routes say whether they were led or top-roped`;
  if (split.thin) {
    return `${coverage}. Not enough yet to read a split from — tag a few more and this will say something.`;
  }

  const lead = best(split, 'lead');
  const rope = best(split, 'toprope');
  const show = (grade: string) => displayGrade('YDS', grade, display);

  if (lead === null && rope === null) return `${coverage}, and none of them were sent.`;
  if (rope === null) return `${coverage}. Every send is led, hardest ${show(lead!)}.`;
  if (lead === null) {
    return `${coverage}. Every send is on a top-rope, hardest ${show(rope)} — nothing in the log has been led.`;
  }

  const gap = gradeOrdinal('YDS', rope) - gradeOrdinal('YDS', lead);
  const both = `${show(lead)} led, ${show(rope)} top-roped`;
  if (gap === 0) return `${coverage}. ${both} — the same grade either way.`;
  if (gap < 0) return `${coverage}. ${both}, so the hardest thing you have done, you led.`;
  return `${coverage}. ${both} — ${gap} ${gap === 1 ? 'rung' : 'rungs'} between them. What that is worth is yours to judge: leading has its own fear in it, and a log with no leads in it is as likely to be a gym with no lead wall.`;
}
