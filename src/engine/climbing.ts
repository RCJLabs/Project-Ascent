/**
 * What makes a session a climbing session, and what climbing loads (PLAN.md
 * M327).
 *
 * Two answers the app already had, in two modules that could not reach each
 * other: `tissueLoad` knew that climbing loads the fingers, the pulleys, the
 * elbow and the shoulder whatever the notes say, and the test-week planner
 * knew which session types are climbing days. The injury flag knew neither,
 * because it sits under both — `tissueLoad` reads its keyword table, and the
 * planner reaches it through the finger-gap rule. Here, below all three, so
 * each of them can ask.
 */

import type { BodyPart } from '@/content/bodyParts';
import type { FieldId, SessionType } from '@/content/types';

/**
 * What climbing loads, whatever the session notes say.
 *
 * A bouldering session loads fingers whether or not anyone wrote the word
 * down, and most logged sessions carry no prose at all. Without this the
 * chart would report a climber who logs grades and nothing else as having
 * trained no tissue whatsoever.
 */
export const CLIMBING_PARTS: BodyPart[] = ['fingers', 'pulley', 'shoulder', 'elbow'];

/**
 * The fields only a session on the wall asks for (PLAN.md M325).
 *
 * Every field, so a new one has to be classified before it compiles: a
 * session type that records a grade or a pump level is a climbing day, and
 * one that records only where it was and what the weather did is not
 * anything in particular.
 */
const RECORDS_CLIMBING: Record<FieldId, boolean> = {
  hardestGradeAttempted: true,
  hardestGradeSent: true,
  sessionVolume: true,
  routesCompleted: true,
  pitches: true,
  attemptsToday: true,
  highPoint: true,
  projectName: true,
  routeName: true,
  pumpLevel: true,
  sessionNumber: true,
  clipStyle: true,
  waterDepth: true,
  gearNotes: true,
  location: false,
  conditions: false,
  sessionDuration: false,
};

/** A session on the wall: it records climbing, or it happens on rock. */
export function onTheWall(type: Pick<SessionType, 'fields' | 'outdoor'>): boolean {
  return type.outdoor === true || (type.fields ?? []).some((f) => RECORDS_CLIMBING[f]);
}
