/**
 * What one session loads, for the check-in to answer against (PLAN.md M327).
 *
 * Its own module rather than `bodyLoad.ts`, which Home loads at boot: only
 * the logger asks this, and the logger is fetched.
 */

import type { BodyPart } from '@/content/bodyParts';
import type { Drill, Exercise, SessionType } from '@/content/types';
import { drillLoads, exerciseLoads } from './bodyLoad';
import { CLIMBING_PARTS, onTheWall } from './climbing';

/**
 * The check-in leaves out advice about a part the session does not load —
 * *"leave the fingerboard alone"* on a legs day is the sort of line that
 * teaches people to stop reading. It was told only the prescribed
 * exercises, so on a climbing day, which prescribes none, it was told the
 * session loads nothing: a climber who answered *sore fingers* on the way
 * into Max Intensity Bouldering got *"Train, with changes."* and no change,
 * and the line *"Finger soreness is the one thing this app will not tell you
 * to push through"* went unsaid on 268 of the catalogue's 308 climbing
 * session-weeks. The climbing counts now, as it does on the chart — on a
 * climbing day, or any session with climbs logged on it — and so does the
 * drill, which the check-in had never been told about either.
 */
export function sessionLoads(input: {
  type: SessionType;
  exercises: readonly Exercise[];
  drill?: Drill | undefined;
  climbed: boolean;
}): BodyPart[] {
  return [
    ...new Set([
      ...(onTheWall(input.type) || input.climbed ? CLIMBING_PARTS : []),
      ...input.exercises.flatMap(exerciseLoads),
      ...(input.drill ? drillLoads(input.drill) : []),
    ]),
  ];
}
