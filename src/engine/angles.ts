/**
 * What you avoid (PLAN.md M108).
 *
 * A coach's first question of anyone who has plateaued is *what do you not
 * climb?*, and the answer is almost always an angle: slab and roofs are
 * different sports played on one grade ladder. Until M108 the record could
 * not answer it — a `Climb` was grade, scale, count, result, ascent style
 * and a name, and "breadth of grades and styles" in the Technique stat
 * means *ascent* styles, which is a different question again.
 *
 * ## Nothing is inferred, and coverage comes first
 *
 * `angle` is optional and always will be. An absent angle is **not**
 * vertical — it is a climb logged by someone who did not answer, and most
 * climbs in any log written before M108 are exactly that. So every reading
 * here reports how many climbs actually carry an angle before it says
 * anything about the shape of them, and refuses the comparison outright
 * under `ENOUGH`.
 *
 * That is the same rule `ladders.ts` and `conversion.ts` follow, and the
 * reason is sharper here: a climber who tagged four roof problems in one
 * session and nothing else would otherwise be told roofs are their strength.
 *
 * ## And it never says a gap is a weakness
 *
 * The grade you reach on slab against the grade you reach on steep is a
 * fact. Which of those is "your level" and which is the gap to close is a
 * coaching judgement about a person, and the log has no access to it — the
 * angle nobody logs is as likely to be the one their gym does not have.
 *
 * Pure: sessions in, a reading out.
 */

import type { Climb, Session, WallAngle } from '@/db/sessions';
import { addClimb, emptyTally, type GradeTally } from './derive';
import { DEFAULT_DISPLAY, displayGrade, gradeOrdinal, type GradeDisplay, type GradeScale } from './grades';

/** In the order a wall leans, which is how a climber thinks about it. */
export const ANGLE_ORDER: WallAngle[] = ['slab', 'vertical', 'overhang', 'roof'];

export const ANGLE_LABEL: Record<WallAngle, string> = {
  slab: 'Slab',
  vertical: 'Vertical',
  overhang: 'Overhanging',
  roof: 'Roof',
};

/** Climbs carrying an angle before any of this is worth reading. */
export const ENOUGH = 10;

export interface AngleSide {
  angle: WallAngle;
  tally: GradeTally;
}

export interface Angles {
  scale: GradeScale;
  /** Only the angles actually logged, in wall order. */
  sides: AngleSide[];
  /** Climbs on this scale that carry an angle. */
  said: number;
  /** Climbs on this scale in total, so coverage can be honest. */
  total: number;
  /** True until enough climbs carry one for the shape to mean anything. */
  thin: boolean;
}

export function angles(sessions: readonly Session[], scale: GradeScale): Angles {
  const tallies = new Map<WallAngle, GradeTally>();
  let said = 0;
  let total = 0;

  for (const session of sessions) {
    if (!session.completed) continue;
    for (const climb of (session.climbs ?? []) as Climb[]) {
      if (climb.scale !== scale) continue;
      total += climb.count;
      if (climb.angle === undefined) continue;
      said += climb.count;
      const tally = tallies.get(climb.angle) ?? emptyTally();
      addClimb(tally, climb);
      tallies.set(climb.angle, tally);
    }
  }

  return {
    scale,
    sides: ANGLE_ORDER.filter((a) => tallies.has(a)).map((a) => ({ angle: a, tally: tallies.get(a)! })),
    said,
    total,
    thin: said < ENOUGH,
  };
}

/** The angle with the hardest send, and the one with the easiest. */
function ends(a: Angles): { best: AngleSide; worst: AngleSide } | null {
  const sent = a.sides.filter((s) => s.tally.best !== null);
  if (sent.length < 2) return null;
  const ord = (s: AngleSide) => gradeOrdinal(a.scale, s.tally.best!);
  const sorted = [...sent].sort((x, y) => ord(y) - ord(x));
  return { best: sorted[0]!, worst: sorted[sorted.length - 1]! };
}

/**
 * The shape of what has been logged, in a sentence, or nothing.
 *
 * Coverage first, always. Then the two ends and the rungs between them —
 * and no word about which of them is the problem.
 */
export function describeAngles(a: Angles, display: GradeDisplay = DEFAULT_DISPLAY): string | null {
  if (a.said === 0) return null;
  const coverage = `${a.said} of your ${a.total} climbs on this ladder say which angle they were on`;
  if (a.thin) {
    return `${coverage}. Not enough yet to read a shape from — tag a few more and this will say something.`;
  }
  const pair = ends(a);
  if (pair === null) {
    const only = a.sides.find((s) => s.tally.best !== null);
    if (only === undefined) return `${coverage}, and none of them were sent.`;
    return `${coverage}, and all the sends are ${ANGLE_LABEL[only.angle].toLowerCase()}. One angle is not a shape.`;
  }
  const show = (s: AngleSide) => displayGrade(a.scale, s.tally.best!, display);
  const gap = gradeOrdinal(a.scale, pair.best.tally.best!) - gradeOrdinal(a.scale, pair.worst.tally.best!);
  const both = `${show(pair.best)} ${ANGLE_LABEL[pair.best.angle].toLowerCase()}, ${show(pair.worst)} ${ANGLE_LABEL[pair.worst.angle].toLowerCase()}`;
  if (gap === 0) return `${coverage}. ${both} — level across the angles you have tagged.`;
  return `${coverage}. ${both} — ${gap} ${gap === 1 ? 'rung' : 'rungs'} between them. Whether that matters is yours to judge: the log knows what you tagged, and nothing about which angles your wall actually has.`;
}
