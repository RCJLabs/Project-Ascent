/**
 * Forty-eight hours between finger sessions, checked without a program
 * (PLAN.md M160).
 *
 * ## The rule exists in eleven programs and is enforced for none of the rest
 *
 * `min-gap-hours` is a machine-readable constraint eleven of the thirteen
 * programs declare, the scheduler honours when it lays out a week, and
 * `planVsLog`'s `spacing` checks against the dates once the week has been
 * lived. All of that runs behind `program && startDate` (`useTips.ts:66`),
 * which is right for adherence — nothing was placed, so nothing was skipped
 * — and wrong for this. **The gap is a fact about tendons, not about
 * whether you are following a block.**
 *
 * The two `mode` entries have no constraints at all, and General Training
 * ships a session type called *Hangboard / Finger* whose own block rationale
 * reads: *"48 hours between hangboard sessions."* The rule is written, in
 * prose, in the one program that cannot check it — and a climber running no
 * program at all gets the same silence.
 *
 * ## What counts as a finger session, and what deliberately does not
 *
 * M132 recorded why the obvious build fails: `tissueLoad` attributes fingers
 * to **every** climbing session by definition (`CLIMBING_PARTS`), so a
 * "fingers gap" computed that way is a climbing gap, which `detraining`
 * already covers. The distinction that makes this work is one `bodyLoad`
 * already draws — between what a session's *words* say it did and what
 * having climbs on it implies.
 *
 * So this reads the words, and only the three rules that mean deliberate,
 * high-force finger loading: max hangs, repeaters, density hangs, minimum
 * edge, campus, one-arm work. Not `sustained` — ARC and laps are the low
 * end on purpose, and no program's own gap constraint protects them. Not
 * `open-hand` — a sloper is a grip, not a protocol. Not climbing, which is
 * the mistake this avoids.
 */

import { getDrill } from '@/content/drills';
import { getProgram } from '@/content/programs';
import type { DrillLoad } from '@/content/types';
import type { Session } from '@/db/sessions';
import { daysBetween } from './dates';
import { drillLoads, rulesInText } from './bodyLoad';
import { isRestSession } from './rest';

/**
 * The number eleven programs chose, and the one General Training states in
 * prose. Exported so a test can hold the app to its own content.
 */
export const FINGER_GAP_HOURS = 48;

/** Breaches below this are a bad week rather than a habit — `planVsLog` uses
 *  the same threshold on the same kind of question. */
export const FINGER_GAP_BREACHES = 2;

/** How far back to look. Long enough for a pattern, short enough to be about
 *  how the climber is training now. */
export const FINGER_GAP_WINDOW_DAYS = 56;

/**
 * Rules that mean a session deliberately loaded the fingers hard.
 *
 * A subset of the rules whose `parts` include `fingers`, and the subset is
 * the whole point — see the header for the two left out.
 */
export const DIRECT_FINGER_RULES: readonly DrillLoad[] = ['campus', 'one-arm', 'fingers'];

function isDirect(ids: readonly DrillLoad[]): boolean {
  return ids.some((id) => DIRECT_FINGER_RULES.includes(id));
}

/**
 * Everything the log itself says about what a session was.
 *
 * The session type's name is the most reliable of the three: a climber who
 * taps "Hangboard / Finger" and completes it has said what they did without
 * filling in an exercise. The exercise names are next, and the drill last.
 */
function words(session: Session): string {
  const parts: string[] = [];
  if (session.programId !== undefined && session.sessionTypeId !== undefined) {
    const type = getProgram(session.programId)?.sessionTypes.find((t) => t.id === session.sessionTypeId);
    if (type) parts.push(type.name);
  }
  for (const exercise of session.exercises ?? []) parts.push(exercise.name);
  return parts.join(' ');
}

/** Whether a session loaded the fingers directly, by what the log says. */
export function loadsFingersDirectly(session: Session): boolean {
  if (!session.completed || isRestSession(session)) return false;
  if (isDirect(rulesInText(words(session)))) return true;
  if (session.drillId !== undefined) {
    const drill = getDrill(session.drillId);
    // A drill's own words *and* its kit: a hangboard drill loads fingers
    // whatever it is called.
    if (drill && drillLoads(drill).includes('fingers') && isDirect(rulesInText(`${drill.name} ${drill.focus}`))) {
      return true;
    }
  }
  return false;
}

export interface FingerGaps {
  /** Finger sessions inside the window — the sample the count is out of. */
  sessions: number;
  /** Consecutive pairs closer together than the gap allows. */
  breaches: number;
  /** The tightest of them, in hours. */
  tightestHours: number;
  /** The date of the second session in the tightest pair. */
  on: string;
}

/**
 * How often two finger sessions landed inside the gap.
 *
 * Null when there is nothing worth saying: fewer than two breaches, or not
 * enough finger sessions for two to be a pattern rather than a fortnight.
 * Day-granular, like `planVsLog`'s own spacing check — the log stores dates,
 * not times, so back-to-back days are 24 hours and the same day is none.
 */
export function fingerGaps(
  sessions: readonly Session[],
  today: string,
  hours: number = FINGER_GAP_HOURS,
): FingerGaps | null {
  const dates = sessions
    .filter((s) => loadsFingersDirectly(s))
    .map((s) => s.date)
    .filter((date) => date <= today && daysBetween(date, today) <= FINGER_GAP_WINDOW_DAYS)
    .sort();
  // Two sessions cannot breach a gap on their own often enough to matter,
  // and a climber with three finger sessions in eight weeks is not the one
  // this is for.
  if (dates.length < FINGER_GAP_BREACHES + 2) return null;

  let breaches = 0;
  let tightest = hours;
  let on = '';
  for (let i = 1; i < dates.length; i += 1) {
    const gap = Math.abs(daysBetween(dates[i - 1]!, dates[i]!)) * 24;
    if (gap >= hours) continue;
    breaches += 1;
    if (gap <= tightest) {
      tightest = gap;
      on = dates[i]!;
    }
  }
  if (breaches < FINGER_GAP_BREACHES) return null;
  return { sessions: dates.length, breaches, tightestHours: tightest, on };
}
