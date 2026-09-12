/**
 * Indoor and outdoor are two ladders, and the app drew one (PLAN.md M106).
 *
 * `GradeTally` is per *scale*. `session.mode` is read for outdoor days in
 * the career page, the achievements, a challenge, the altimeter's outdoor
 * multiplier and the trips — and `progress.ts` does not mention it once. So
 * the comparison every climber makes out loud, and the one Trip Prep exists
 * to close, is computed nowhere: **what you climb on plastic against what
 * you climb on rock.**
 *
 * ## What it will not do
 *
 * **It will not convert one into the other.** There is no exchange rate. A
 * gym V6 and a Font 6C are not a unit apart in any direction the app could
 * apply, and the whole point of the reading is that the two ladders are
 * separate.
 *
 * **It will not call the gap a problem.** Some of it is the gym being soft,
 * some of it is rock being frightening, some of it is a climber who does one
 * outdoor day a year, and no part of the log says which. A sentence that
 * reads as a verdict on a number this thin would be the app inventing a
 * weakness. It reports two bests and the distance between them, in grades,
 * and stops.
 *
 * **And it states what each number rests on first.** "Two grades harder
 * indoors" from four outdoor sends is not a finding, it is a coincidence
 * with a decimal point. `conversion.ts` settled the house rule for this —
 * name the thin figure in the sentence rather than hiding the row — and
 * this follows it.
 *
 * Pure: sessions in, a reading out.
 */

import type { Session } from '@/db/sessions';
import { addClimb, emptyTally, type GradeTally } from './derive';
import { DEFAULT_DISPLAY, displayGrade, gradeOrdinal, type GradeDisplay, type GradeScale } from './grades';

/** Sends below which a best is a coincidence rather than a level. */
export const THIN_SENDS = 5;

export interface LadderSide {
  tally: GradeTally;
  /** Distinct days climbed this way, which is the other half of coverage. */
  days: number;
}

export interface Ladders {
  scale: GradeScale;
  indoor: LadderSide;
  outdoor: LadderSide;
  /**
   * Rungs between the two bests, indoor minus outdoor.
   *
   * Ordinal, and only ever ordinal: it says how many rungs apart the two
   * are on their own ladder, not how much harder anything is. Null when
   * either side has never been sent on.
   */
  gap: number | null;
  /** True where either side is too thin for its best to mean much. */
  thin: boolean;
}

export function ladders(sessions: readonly Session[], scale: GradeScale): Ladders {
  const side = (): { tally: GradeTally; days: Set<string> } => ({ tally: emptyTally(), days: new Set() });
  const indoor = side();
  const outdoor = side();

  for (const session of sessions) {
    if (!session.completed) continue;
    const into = session.mode === 'outdoor' ? outdoor : indoor;
    let climbed = false;
    for (const climb of session.climbs ?? []) {
      if (climb.scale !== scale) continue;
      addClimb(into.tally, climb);
      climbed = true;
    }
    if (climbed) into.days.add(session.date);
  }

  const best = (t: GradeTally): number | null => (t.best === null ? null : gradeOrdinal(scale, t.best));
  const hi = best(indoor.tally);
  const lo = best(outdoor.tally);

  return {
    scale,
    indoor: { tally: indoor.tally, days: indoor.days.size },
    outdoor: { tally: outdoor.tally, days: outdoor.days.size },
    gap: hi === null || lo === null ? null : hi - lo,
    thin: indoor.tally.totalSends < THIN_SENDS || outdoor.tally.totalSends < THIN_SENDS,
  };
}

const sends = (n: number): string => `${n} send${n === 1 ? '' : 's'}`;

/**
 * The two ladders in a sentence, or nothing when there is only one.
 *
 * Never a verdict: the gap is stated, and what it rests on is stated with
 * it, and the climber decides what that means about their climbing.
 */
export function describeLadders(l: Ladders, display: GradeDisplay = DEFAULT_DISPLAY): string | null {
  const show = (g: string) => displayGrade(l.scale, g, display);
  const inBest = l.indoor.tally.best;
  const outBest = l.outdoor.tally.best;

  if (outBest === null) {
    if (inBest === null) return null;
    return `Nothing sent on rock yet, so there is only one ladder to read here.`;
  }
  if (inBest === null) {
    return `${show(outBest)} on rock, from ${sends(l.outdoor.tally.totalSends)} over ${l.outdoor.days} day${l.outdoor.days === 1 ? '' : 's'}. Nothing logged indoors to set beside it.`;
  }

  const both = `${show(inBest)} indoors from ${sends(l.indoor.tally.totalSends)}, ${show(outBest)} on rock from ${sends(l.outdoor.tally.totalSends)}`;
  if (l.thin) {
    const which = l.outdoor.tally.totalSends < THIN_SENDS ? 'on rock' : 'indoors';
    return `${both}. Too little ${which} to read a gap from — that is a count, not a comparison.`;
  }
  if (l.gap === 0) return `${both} — the same rung on both ladders.`;
  const rungs = Math.abs(l.gap!);
  const harder = l.gap! > 0 ? 'indoors' : 'on rock';
  return `${both} — ${rungs} ${rungs === 1 ? 'rung' : 'rungs'} apart, harder ${harder}. What that is about, the log cannot say.`;
}
