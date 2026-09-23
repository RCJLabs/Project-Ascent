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
 * So this reads the words, and only what means deliberate, high-force finger
 * loading: max hangs, repeaters, density hangs, minimum edge, campus,
 * one-arm work. Not `sustained` — ARC and laps are the low end on purpose,
 * and no program's own gap constraint protects them. Not `open-hand` — a
 * sloper is a grip, not a protocol. Not climbing, which is the mistake this
 * avoids.
 *
 * ## And not a dead hang, which the borrowed rule said it was (PLAN.md M321)
 *
 * That list was the prose. The code asked `bodyLoad`'s `fingers` rule, whose
 * pattern also carries `dead ?hang` — correct for the question *that* table
 * answers, which is whether a line loads a part a climber has hurt. A
 * bodyweight hang does. It is not the question here, and the catalogue says
 * so in its own words: Ground Zero prescribes `Dead Hang` at *"3 x 10-15s"*
 * because it *"builds passive hanging tolerance — your first exposure to
 * finger-tendon load"*, and Peak Performance puts `Passive Dead Hangs` in a
 * block called **Shoulder**, where the rationale reads *"decompress the
 * shoulder capsule and spine. Light resistance, perfect form — this is
 * insurance, not a workout."*
 *
 * Neither is a protocol that needs forty-eight hours after it. So the
 * protocols are stated here rather than borrowed, and `campus` and
 * `one-arm` still come from the table, because for those two the table
 * already asks this question. Swept over all 368 authored names in the
 * catalogue, the narrowing moves exactly two strings and nothing else:
 * `Dead Hang` and `Passive Dead Hangs`.
 *
 * ## What the words are, which was less than the app knew (PLAN.md M321)
 *
 * `words()` read the session type's **name** and the exercises the climber
 * typed. Nine of the catalogue's session types prescribe finger protocols
 * and **five of them were missed**, because their names do not say so:
 * Iron Grip's *Finger Protocol + Engine*, Trip Prep's *Finger Primer*, Two
 * Days a Week's *Climb & Apply*, Lockdown's *Session A: Static Power* and
 * Ground Zero's *Structural Integrity* — the last of which is the dead-hang
 * false positive above and stays missed on purpose.
 *
 * A climber who taps a session type and completes it has said what they did.
 * The app has the prescription behind that type and was not reading it, so a
 * finger day logged without typing an exercise into it counted as nothing.
 * It reads every phase's lines rather than resolving which phase the date
 * falls in — the date is not in this function's hands, and a test holds the
 * approximation to being one: no shipped session type prescribes finger work
 * in some phases and not others, so for the catalogue as it stands the two
 * readings are the same reading.
 */

import { getDrill } from '@/content/drills';
import { getProgram } from '@/content/programs';
import type { Drill, DrillLoad } from '@/content/types';
import type { Session } from '@/db/sessions';
import { daysBetween } from './dates';
import { rulesInText } from './bodyLoad';
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
export const DIRECT_FINGER_RULES: readonly DrillLoad[] = ['campus', 'one-arm'];

/**
 * The protocols the forty-eight hours are about, named here.
 *
 * `fingers` used to be on the list above and is not, for the reason the
 * header gives: its pattern matches a passive dead hang, which is the one
 * thing under that rule this question wants to exclude. Everything else in
 * it is restated here, minus a bare `\bedge\b` — `min-edge` and `Min-Edge
 * Hangs` are covered by the clause before it, and nothing else in the
 * catalogue reaches the rule through that word alone.
 */
const PROTOCOLS = /max hang|repeater|density hang|min(imum)?[- ]edge|hangboard|fingerboard|crimp/i;

function isDirect(ids: readonly DrillLoad[]): boolean {
  return ids.some((id) => DIRECT_FINGER_RULES.includes(id));
}

/**
 * Whether some text describes deliberate, high-force finger work.
 *
 * Exported so the builder asks the same question of a *prescription* that
 * this asks of a *log* (PLAN.md M167). One definition, or a custom program
 * could be warned about spacing it would never be checked against — or the
 * reverse, which is worse.
 */
export function directFingerWork(text: string): boolean {
  if (PROTOCOLS.test(text)) return true;
  return isDirect(rulesInText(text));
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
    if (type) {
      parts.push(type.name);
      // And what it prescribes, which is the half the name leaves out
      // (PLAN.md M321). Every phase: see the header for why that is the same
      // answer as resolving the date's own phase, and the test that holds it.
      for (const block of type.blocks ?? []) {
        for (const prescription of Object.values(block.perPhase)) {
          for (const exercise of prescription.exercises) parts.push(exercise.name);
        }
      }
    }
  }
  for (const exercise of session.exercises ?? []) parts.push(exercise.name);
  return parts.join(' ');
}

/** Whether a session loaded the fingers directly, by what the log says. */
export function loadsFingersDirectly(session: Session): boolean {
  if (!session.completed || isRestSession(session)) return false;
  if (directFingerWork(words(session))) return true;
  if (session.drillId !== undefined) {
    const drill = getDrill(session.drillId);
    if (drill) return drillOnTheBoard(drill);
  }
  return false;
}

/** The kit that makes a drill a board session rather than a climbing one. */
const BOARD_KIT: readonly Drill['equipment'][number][] = ['hangboard', 'campus'];

/**
 * Whether a drill is finger work in this rule's sense (PLAN.md M324).
 *
 * The comment this replaced said *"a hangboard drill loads fingers whatever
 * it is called"* and the code did the opposite. It asked for the drill's
 * words **and** its kit, and the words decided: swept over all 156 drills,
 * the rule counted seven and **every one of them was a wall drill** —
 * *Limit Boulders on the Crimps*, *Volume on Moderate Crimps*, *Projecting
 * With Crimp Focus*, *The Crimp Project*, *Crimp Pull-Power Application*,
 * *Offset Pull Practice* (for "One-Arm" in its focus) and *Lead Fall
 * Practice — The Fall Ladder* (for `ladder`, which is a campus word). The
 * library's only three hangboard drills, the graduation retests, it missed.
 *
 * That is climbing, which the header above rules out by name, and it was
 * never seen because no fixture had ever carried a `drillId` until M324 gave
 * the sample climber the one `PreSession` stamps on every perf day. Iron
 * Grip places the first three on weeks 1–3, the Wednesday before a Thursday
 * finger day — so a climber running it exactly as written was told they had
 * breached the forty-eight hours, by the app, about the program's own
 * layout. The program's rhythm says what it means: *"2 fingerboard sessions
 * per week, with 72 hours between. Supplementary climbing fills in the other
 * days."*
 *
 * So the kit decides, in the order the words above always implied:
 *
 * - **A board** in its kit, and it counts whatever it is called.
 * - **The wall**, and it does not — it is climbing, however hard.
 * - **Neither**, which is a drill written for somewhere this app does not
 *   know about, and its words are all there is to go on.
 */
export function drillOnTheBoard(drill: Pick<Drill, 'name' | 'focus' | 'equipment'>): boolean {
  const kit = drill.equipment ?? [];
  if (kit.some((k) => BOARD_KIT.includes(k))) return true;
  if (kit.includes('wall')) return false;
  return directFingerWork(`${drill.name} ${drill.focus}`);
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
