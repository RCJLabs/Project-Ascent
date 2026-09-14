/**
 * Coach's Corner (PLAN.md §6.6, §9.6).
 *
 * The prototype's Coach Billy sent the climber's numbers to Gemini and read
 * back whatever came out (AUDIT.md §4.6). The triggers underneath it were the
 * good part; the model was the liability. Here the same taxonomy is a set of
 * pure rules over numbers the app already derives, with the copy written up
 * front. Deterministic, offline, and honest about being rules.
 *
 * The line against the weekly review is deliberate and worth keeping:
 * `engine/review.ts` writes **one note about the week just gone**. This
 * writes **standing observations about the training as a whole** — things
 * that stay true until they are dealt with, and that a week-shaped summary
 * would never surface. Nothing appears in both.
 *
 * Every rule reads the derived state. None of them stores anything, so a tip
 * cannot go stale or contradict the numbers on the next screen.
 */

import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import type { MetricEntry } from '@/db/metrics';
import type { MetricId } from '@/content/types';
import { METRICS } from '@/content/metrics';
import { assessmentStatus } from './assessments';
import { daysBetween, today as todayKey } from './dates';
import type { ClimberState } from './derive';
import type { Diagnosis } from './plateau';
import { activeProjects, attemptsFor, highPointOf } from './projects';
import type { BlockAdherence } from './adherence';
import type { Finding } from './planVsLog';
import { isRestSession } from './rest';

export type TipTone = 'good' | 'neutral' | 'caution';

export interface Tip {
  /** Stable across firings of the same kind, so a dismissal can name it. */
  id: string;
  /**
   * The triggering fact, at its current magnitude. Dismissing stores this;
   * when the fact moves on, the tip comes back. Dismissing "ten burns on
   * this project" must not also hide the twentieth.
   */
  signature: string;
  tone: TipTone;
  headline: string;
  body: string;
  action?: { label: string; href: string };
  /** Higher sorts first. */
  weight: number;
}

export interface CoachInput {
  state: ClimberState;
  sessions: Session[];
  projects?: Project[];
  metrics?: MetricEntry[];
  diagnosis?: Diagnosis;
  /** Program assessment ids, so staleness is judged on what you were asked. */
  programMetrics?: MetricId[];
  /** ISO date of the last backup export, if there has ever been one. */
  lastExportAt?: string | null;
  /**
   * M91's planned-against-done, per session type (PLAN.md M104).
   *
   * Passed in already computed, like `diagnosis`, because building it needs
   * the program, its start date, the week plan and the overrides — four
   * things the coach has no business holding to write one tip.
   */
  adherence?: BlockAdherence | null;
  /**
   * Whether the running program puts a drill in any week (PLAN.md M132).
   *
   * Six of the thirteen programs ship no drills at all — Ground Zero, The
   * Cruiser, Two Days a Week, Trip Prep, General Training and Outdoor
   * Climbing — and the drill tip told every one of their climbers that
   * *"your program prescribes a drill each week"*, which for them is
   * simply false. Passed in rather than derived here for the reason
   * `adherence` is: the coach has no business holding a program to write
   * one tip.
   */
  prescribesDrills?: boolean;
  /**
   * What the program asked against what the log says (PLAN.md M148).
   *
   * Passed in already computed for the reason `adherence` and `diagnosis`
   * are: building it needs the program, its start date and the climber's
   * track, and the coach has no business holding a program to write one
   * tip. Already sorted, already gated — everything in the list has earned
   * a sentence, and this file's job is only to decide how many of them get
   * one.
   */
  findings?: Finding[];
  today?: string;
}

/** Attempt counts that earn a word. Escalating, so it is not said twice. */
export const BURN_RUNGS = [5, 10, 20, 40] as const;

/** Days away from rock before coming back deserves a different plan. */
export const OUTDOOR_GAP_DAYS = 21;

/** Days between backups before the offline story needs saying out loud. */
export const BACKUP_INTERVAL_DAYS = 30;

/** Below this ACWR the body is losing what it built, deload aside. */
export const DETRAINING_ACWR = 0.8;

/** Past this the spike tip changes its signature, so a dismissal does not
 *  cover a ratio that has gone on climbing. */
export const STEEP_ACWR = 1.8;

/** A gap this long is not a rest week. */
export const LAYOFF_DAYS = 10;

/** Times a type has to have been placed before skipping it is a pattern
 *  rather than a fortnight that went badly. */
export const SKIPPED_TYPE_PLANNED = 4;

/** Done ÷ planned at or under this, and the plan is not being run. */
export const SKIPPED_TYPE_RATE = 0.5;


/** A session that starts this late costs the sleep it needs to pay for. */
export const LATE_HOUR = 21;

export function buildTips(input: CoachInput): Tip[] {
  const today = input.today ?? todayKey();
  const tips = [
    firstSession(input),
    plateau(input),
    ...projectBurns(input, today),
    outdoorReentry(input, today),
    detraining(input, today),
    unscoredEffort(input),
    loadSpike(input),
    staleBenchmarks(input, today),
    skippedType(input),
    planVsLog(input),
    ...missingDomains(input),
    lateSessions(input),
    backupNudge(input, today),
    streakPraise(input),
  ].filter((t): t is Tip => t !== null);

  return tips.sort((a, b) => b.weight - a.weight);
}

/** The tips left after the climber has waved some of them away. */
export function visibleTips(tips: Tip[], dismissed: Record<string, string>): Tip[] {
  return tips.filter((t) => dismissed[t.id] !== t.signature);
}

// ── Rules ─────────────────────────────────────────────────────────────────

function firstSession({ state }: CoachInput): Tip | null {
  if (state.completedSessions > 0) return null;
  return {
    id: 'first-session',
    signature: 'none',
    tone: 'neutral',
    weight: 95,
    headline: 'Nothing logged yet',
    body: 'Three of your five stats are built from what you log, and none of them can move until there is a session to read. It does not have to be a good one.',
    action: { label: 'Log today', href: '/today' },
  };
}

function plateau({ diagnosis }: CoachInput): Tip | null {
  if (!diagnosis) return null;
  if (diagnosis.verdict === 'recovery-compromised') {
    return {
      id: 'recovery',
      signature: diagnosis.verdict,
      tone: 'caution',
      weight: 92,
      headline: 'Recovery is the blocker',
      body: `${diagnosis.explanation} Nothing else in your training is worth changing until this is.`,
      action: { label: 'See the evidence', href: '/progress' },
    };
  }
  if (diagnosis.verdict === 'plateau') {
    return {
      id: 'plateau',
      signature: `${diagnosis.verdict}:${diagnosis.reset?.steps.length ?? 0}`,
      tone: 'caution',
      weight: 88,
      headline: 'The line has gone flat',
      body: `${diagnosis.explanation} There is a seven-day reset written for exactly this.`,
      action: { label: 'Open the reset', href: '/progress' },
    };
  }
  return null;
}

function projectBurns(input: CoachInput, today: string): Tip[] {
  const projects = activeProjects(input.projects ?? []);
  const out: Tip[] = [];
  for (const project of projects) {
    const attempts = attemptsFor(project.id, input.sessions);
    const burns = attempts.reduce((n, a) => n + a.count, 0);
    const rung = [...BURN_RUNGS].reverse().find((r) => burns >= r);
    if (rung === undefined) continue;

    const high = attempts.reduce<number | null>((best, a) => {
      const point = highPointOf(a);
      return point === null ? best : Math.max(best ?? 0, point);
    }, null);
    out.push({
      id: `burns:${project.id}`,
      signature: `${rung}`,
      tone: 'neutral',
      weight: 80,
      headline: `${burns} burns on ${project.name}`,
      body:
        high === null
          ? 'No high point recorded yet, so there is nothing to tell you whether the goes are working. Record where you fall and the next twenty will mean something.'
          : `Your high point is ${high}%. If it has not moved in three sessions, more goes is the one lever that has already failed — take the crux to the ground, or take a week off it and come back fresh.`,
      action: { label: 'Open the project', href: `/projects/${project.id}` },
    });
  }
  // Quieten the noise: two loud projects at once is a to-do list, not advice.
  return out.slice(0, 2).map((t) => ({ ...t, signature: `${t.signature}:${today.slice(0, 7)}` }));
}

function outdoorReentry({ state, sessions }: CoachInput, today: string): Tip | null {
  if (state.outdoorDays === 0) return null;
  const last = sessions
    .filter((s) => s.completed && s.mode === 'outdoor')
    .map((s) => s.date)
    .sort()
    .at(-1);
  if (!last) return null;
  const away = daysBetween(last, today);
  if (away < OUTDOOR_GAP_DAYS) return null;

  const bucket = away >= 180 ? '180' : away >= 90 ? '90' : away >= 42 ? '42' : '21';
  return {
    id: 'outdoor-reentry',
    signature: bucket,
    tone: 'neutral',
    weight: 62,
    headline: `${away} days since you were on rock`,
    body: 'Skin and footwork go first, and neither shows up on a plastic grade. Plan the first day back two grades under your indoor number, bring more pads than you think, and treat it as a skills day rather than a send day.',
    action: { label: 'Log an outdoor day', href: '/today' },
  };
}

function detraining({ state, sessions }: CoachInput, today: string): Tip | null {
  const { acwr, inPlannedDeload, daysOfHistory } = state.load;
  if (inPlannedDeload || daysOfHistory < 28) return null;

  const last = sessions
    .filter((s) => s.completed && !isRestDay(s))
    .map((s) => s.date)
    .sort()
    .at(-1);
  const away = last ? daysBetween(last, today) : null;

  // A long enough gap stops the ratio computing at all: the density guard in
  // derive.ts wants six training days inside the last month, and a layoff has
  // fewer. Silence there means "stopped", not "fine", so read the gap itself
  // rather than trusting a null to mean nothing is wrong.
  if (away !== null && away >= LAYOFF_DAYS) {
    // The app cannot tell "did not train" from "did not log", and it used to
    // assert the first: "24 days since you trained", to a climber who may
    // have climbed through every one of them (PLAN.md M100). The advice
    // underneath is still the right advice for the reading that is true, so
    // it stays — behind the sentence the log actually supports.
    return {
      id: 'detraining',
      signature: away >= 60 ? 'long' : away >= 28 ? 'month' : 'fortnight',
      tone: 'caution',
      weight: 58,
      headline: `${away} days since you logged anything`,
      body: 'If you have been training and not writing it down, mark those days on the calendar and everything here follows. If you have actually been off: finger strength holds for a while and everything else does not, so come back at about two-thirds of the volume you left on and give it a fortnight before judging anything — the first sessions back always feel worse than the fitness actually is.',
      action: { label: 'Mark the days you trained', href: '/calendar' },
    };
  }

  // The **zone**, not the raw ratio (PLAN.md M162).
  //
  // Unscored sessions pull the ratio down, so `acwr < DETRAINING_ACWR` was
  // the one reading this data could produce without the training having
  // dropped off at all. The zone is the answer that survives the missing
  // sessions: `derive.ts` reports 'detraining' only when the ratio lands
  // there however those sessions actually went, and 'unknown' when they
  // could change it. So a genuine drop is still called — with the number
  // hedged, because a range has no second decimal.
  if (state.load.zone === 'detraining' && acwr !== null) {
    const figure = state.load.estimated ? `about ${acwr.toFixed(1)}×` : `${acwr.toFixed(2)}×`;
    return {
      id: 'detraining',
      signature: acwr < 0.5 ? 'deep' : 'shallow',
      tone: 'caution',
      weight: 58,
      headline: 'Training has dropped off',
      body: `You are at ${figure} your own baseline. A week or two here is recovery; a month is losing what you built. The way back up is more sessions, not harder ones — the same ratio punishes a change in either direction.`,
      action: { label: 'Plan the week', href: '/calendar' },
    };
  }
  return null;
}

/**
 * The other direction, which is the one that hurts people (PLAN.md M46).
 *
 * Everything needed for this existed and none of it spoke. `derive.ts` names
 * the bands, the load chart paints optimal, caution and danger, the XP brake
 * withholds the effort bonus above 1.3, and Progress prints the ratio. The
 * coach — the app's only proactive voice, which will tell you about a
 * plateau, a stale benchmark, a missing backup and a streak worth keeping —
 * had ten rules and not one of them fired when the ratio climbed. An app
 * that carries an injury tracker and warns about losing fitness was silent
 * about the pattern most associated with getting hurt.
 *
 * **Both zones speak, and a worsening spike speaks again.** Ramping quickly
 * is a normal week for someone deliberately adding load, so it says so once
 * and can be waved away; the signature is the zone, so dismissing that does
 * not also dismiss the spike it may become. Above 1.8 the signature changes
 * again, because a dismissal is "I have read this", not "I have handled it",
 * and a ratio that keeps climbing after one has earned a second sentence.
 * A spike outranks every tip that fires on real data: a plateau is a
 * months-long problem and this is a this-week one.
 */
/**
 * The effort field, left blank often enough that the ratio cannot be read
 * (PLAN.md M162).
 *
 * This is the tip that replaces a wrong one. The load model used to read an
 * unscored session as a day off, so a climber who logged everything except
 * the effort was told their training had dropped off — and the app's own
 * advice, *"mark those days on the calendar and everything here follows"*,
 * was what produced the sessions that broke it.
 *
 * It only speaks when the silence is actually costing something: the window
 * has to hold unscored training **and** the zone has to have gone unknown
 * because of it. A climber who leaves one session blank in a month still
 * gets their number, because the bracket in `derive.ts` can still place it.
 */
function unscoredEffort({ state }: CoachInput): Tip | null {
  const { unmeasuredDays, unknownBecause, daysOfHistory } = state.load;
  if (unknownBecause !== 'unscored' || unmeasuredDays === 0) return null;
  // Nothing useful to say to someone three sessions in — `firstSession` and
  // the empty states are already talking to them.
  if (daysOfHistory < 21 && state.completedSessions < MIN_SESSIONS_FOR_SCORE) return null;

  const days = `${unmeasuredDays} ${unmeasuredDays === 1 ? 'day' : 'days'}`;
  return {
    id: 'unscored-effort',
    signature: `${unmeasuredDays}`,
    tone: 'neutral',
    weight: 60,
    headline: `Effort is missing on ${days} of the last month`,
    body: 'Training load is how hard against how long, so a session without an effort score cannot go into it — and the app would rather say so than count those days as rest and tell you that you have eased off. Add the RPE to those sessions and the load chart, the ratio and everything built on them fill back in. It is one tap per session at the bottom of the logger.',
    action: { label: 'Open the calendar', href: '/calendar' },
  };
}

/** Enough of a log that a missing score is worth mentioning at all. */
const MIN_SESSIONS_FOR_SCORE = 6;

function loadSpike({ state }: CoachInput): Tip | null {
  const { acwr, zone, inPlannedDeload } = state.load;
  // A deload is a deliberate change of load in the other direction, and the
  // ratio moving is the point of it rather than a surprise.
  if (inPlannedDeload || acwr === null) return null;
  if (zone !== 'caution' && zone !== 'danger') return null;

  const ratio = acwr.toFixed(2);
  if (zone === 'danger') {
    return {
      id: 'load-spike',
      signature: acwr >= STEEP_ACWR ? 'danger-steep' : 'danger',
      tone: 'caution',
      weight: 93,
      headline: 'Load spike',
      body: `You are at ${ratio}× your own four-week baseline, and a jump this size is the pattern most associated with injury — not the training itself, the speed of the change. An easier week now costs a week. Fingers and tendons adapt slower than the muscles that made this feel possible.`,
      action: { label: 'Plan the week', href: '/calendar' },
    };
  }
  return {
    id: 'load-spike',
    signature: 'caution',
    tone: 'caution',
    weight: 62,
    headline: 'Ramping quickly',
    body: `You are at ${ratio}× your own four-week baseline. That is a fine week and a bad month — the ratio is about the speed of the change, not the size of the load, so holding here for a while is how it becomes the new baseline safely.`,
    action: { label: 'Plan the week', href: '/calendar' },
  };
}

/** A logged rest day is not training, and must not hold off a layoff tip. */
/**
 * A session type the plan keeps placing and you keep not doing (PLAN.md M104).
 *
 * **The only rule M104 turned out to need.** Of the five it proposed, two
 * already shipped here (`projectBurns`, `missingDomains`), one was refused
 * as a third voice on a fact `staleBenchmarks` and `blockEnd` both already
 * carry, and two — a PR reaction and a warmups-skipped nag — are already
 * said by `review.ts`, whose note leads the Home card that sits directly
 * above this board. Two cards on one screen about one fact is what the
 * line against the weekly review exists to prevent.
 *
 * This one the review provably cannot say: M91's premise is that it counts
 * sessions against a weekly *number*, "which cannot tell four climbing
 * sessions from four skipped Finger Protocols".
 *
 * §6.6 asked for a *hangboard-gap warning*, and the obvious build —
 * `daysSinceLoaded('fingers')` from `tissueLoad` — does not work. That
 * module attributes fingers to **every** climbing session by definition
 * (`CLIMBING_PARTS`), so a fingers gap is a climbing gap, which `detraining`
 * and the layoff rule already say. What the climber in question is actually
 * doing is climbing instead of hangboarding, and M91 measures exactly that:
 * planned against done, per type, over the block.
 *
 * One type, the one furthest behind. "You are behind on four things" is the
 * indictment `missingDomains` refuses to write, for the same reason.
 */
function skippedType({ adherence }: CoachInput): Tip | null {
  if (!adherence) return null;
  const behind = adherence.types
    .filter((t) => t.planned >= SKIPPED_TYPE_PLANNED && t.done / t.planned <= SKIPPED_TYPE_RATE)
    .sort((a, b) => b.planned - b.done - (a.planned - a.done));
  const worst = behind[0];
  if (worst === undefined) return null;
  return {
    id: `skipped-type:${worst.typeId}`,
    // The shortfall, so doing one more brings it back rather than leaving a
    // dismissal to cover a gap that has gone on growing.
    signature: `${worst.planned - worst.done}`,
    tone: 'neutral',
    weight: 65,
    headline: `${worst.done} of ${worst.planned} ${worst.name} sessions`,
    // The headline carries the count. The body is for the part a number
    // cannot say.
    body:
      worst.done === 0
        ? `Not once, in ${adherence.weeks} week${adherence.weeks === 1 ? '' : 's'} of it being on the calendar. A session type nobody does is not a weakness in the program — it is a scheduling problem or a kit problem, and both have answers: move it in the week, or swap the block for one built around what you actually have.`
        : 'This is the part of the plan doing the least work for you, and it is usually the part that was hardest to fit rather than the part you disagreed with. Move it to the day it would survive, or take it out of the week honestly rather than by accident.',
    action: { label: 'See this week', href: '/train' },
  };
}

function isRestDay(session: Session): boolean {
  return isRestSession(session);
}

/**
 * The plan against the log, one divergence at a time (PLAN.md M148).
 *
 * `engine/planVsLog.ts` joins six things the app stored in halves that never
 * met — a minute estimate and a logged duration, a declared intensity and a
 * typed RPE, a weekly step and a series of readings, a deload marker and a
 * load index, a spacing constraint and a list of dates, a menu and a set of
 * ticks. Every one of them can fire on a climber having a normal week, which
 * is why the module gates each join and returns only its worst subject, and
 * why this takes only the heaviest of what survives.
 *
 * **One, and not the list.** `missingDomains` slices to one because five
 * things you are not doing reads as an indictment; six ways your block is
 * not the block you are running reads as a worse one. The full set is not
 * lost — it is the block report's, at the end, where a list is a record
 * rather than a verdict.
 *
 * The copy is the module's rather than this file's on purpose: both surfaces
 * say the same thing about the same fact, in the same vocabulary, and a
 * second wording here would be a second opinion.
 */
function planVsLog({ findings }: CoachInput): Tip | null {
  const worst = (findings ?? [])[0];
  if (!worst) return null;
  return {
    id: worst.id,
    signature: worst.signature,
    tone: worst.tone,
    weight: worst.weight,
    headline: worst.headline,
    body: worst.body,
    ...(worst.action ? { action: worst.action } : {}),
  };
}

function staleBenchmarks(input: CoachInput, today: string): Tip | null {
  const entries = input.metrics ?? [];
  if (entries.length === 0) return null;
  const seen = [...new Set(entries.map((e) => e.metricId))].filter((id) => METRICS[id]);
  const due = seen
    .map((id) => assessmentStatus(id, entries, { today }))
    .filter((s) => s !== null && s.due === 'stale');
  if (due.length === 0) return null;
  return {
    id: 'stale-benchmarks',
    signature: `${due.length}`,
    tone: 'neutral',
    weight: 50,
    headline: `${due.length} benchmark${due.length === 1 ? '' : 's'} out of date`,
    body: 'A number you took three months ago is a number about a climber you no longer are. Retesting takes one session and it is the only way the strength curve stays honest.',
    action: { label: 'Retest', href: '/assessments' },
  };
}

interface Domain {
  id: string;
  /** Only worth saying once there is enough history for it to be a choice. */
  after: (s: ClimberState) => boolean;
  missing: (s: ClimberState) => boolean;
  headline: string;
  /** A function where the advice depends on more than the climber's log. */
  body: string | ((input: CoachInput) => string);
  action: { label: string; href: string } | ((input: CoachInput) => { label: string; href: string });
}

/**
 * The gaps a training log makes visible and nothing else does. Each waits for
 * enough history that the gap is a pattern rather than a coincidence.
 */
const DOMAINS: Domain[] = [
  {
    id: 'domain:rest',
    after: (s) => s.completedSessions >= 10,
    missing: (s) => s.restSessions === 0,
    headline: 'No rest days logged, ever',
    body: 'Adaptation happens on the days off, and the app treats a logged rest day as training because it is. It also pays into your vitality and pays The Ascent half again as much.',
    action: { label: 'Log a rest day', href: '/today' },
  },
  {
    id: 'domain:drills',
    after: (s) => s.completedSessions >= 8,
    missing: (s) => s.drillsCompleted === 0,
    headline: 'No drills yet',
    // Two sentences, because the first one was false for six of thirteen
    // programs (PLAN.md M132). A climber on The Cruiser has never been
    // prescribed a drill in their life and was being told they skip one
    // every week; the fix is to say the true thing to each of them, and
    // to point the second sort at the library, which is now somewhere a
    // drill can actually be chosen from.
    body: (input) =>
      input.prescribesDrills === true
        ? 'Technique is the only stat that will not move for you on volume alone. Your program prescribes a drill each week and it takes ten minutes of a session you are already having.'
        : 'Technique is the only stat that will not move for you on volume alone. Your program does not prescribe drills, so this one is on you: the library has a hundred and fifty-odd, twelve of which need no wall at all, and any of them can go on today.',
    action: (input) =>
      input.prescribesDrills === true
        ? { label: 'See this week', href: '/train' }
        : { label: 'Browse the drills', href: '/drills' },
  },
  {
    id: 'domain:outdoor',
    after: (s) => s.completedSessions >= 15,
    missing: (s) => s.outdoorDays === 0,
    headline: 'Everything so far is indoors',
    body: 'Rock asks different questions: reading a line with no colour to follow, feet you cannot see, and consequence. It is a quarter of the Mental stat for that reason.',
    action: { label: 'Log an outdoor day', href: '/today' },
  },
  {
    id: 'domain:style',
    after: (s) => s.boulder.totalSends + s.sport.totalSends >= 25,
    missing: (s) => s.styleSends.onsight + s.styleSends.flash === 0,
    headline: 'Every send is a redpoint',
    body: 'Nothing logged first go. Working a climb until it yields trains the body; reading one cold trains the part that actually transfers outdoors. Warm up on something unfamiliar and commit to the first go.',
    action: { label: 'Log a session', href: '/today' },
  },
  {
    id: 'domain:projects',
    after: (s) => s.completedSessions >= 15,
    missing: (s) => s.boulder.totalAttempts + s.sport.totalAttempts === 0,
    headline: 'Nothing logged as an attempt',
    body: 'A log of only sends is a log of things that were never hard enough to fail on. The attempts are where the training is; record them and the project view has something to draw.',
    action: { label: 'Track a project', href: '/projects' },
  },
];

function missingDomains(input: CoachInput): Tip[] {
  const { state } = input;
  return DOMAINS.filter((d) => d.after(state) && d.missing(state))
    // One gap at a time. A list of five things you are not doing reads as an
    // indictment, and nobody acts on an indictment.
    .slice(0, 1)
    .map((d) => ({
      id: d.id,
      signature: 'missing',
      tone: 'neutral' as const,
      weight: 45,
      headline: d.headline,
      body: typeof d.body === 'function' ? d.body(input) : d.body,
      action: typeof d.action === 'function' ? d.action(input) : d.action,
    }));
}

function lateSessions({ sessions }: CoachInput): Tip | null {
  const timed = sessions
    .filter((s) => s.completed && s.startedAt)
    .sort((a, b) => (a.startedAt! < b.startedAt! ? 1 : -1))
    .slice(0, 8);
  if (timed.length < 4) return null;
  const late = timed.filter((s) => new Date(s.startedAt!).getHours() >= LATE_HOUR).length;
  if (late < 3) return null;
  return {
    id: 'late-sessions',
    signature: `${late}`,
    tone: 'neutral',
    weight: 30,
    headline: `${late} of your last ${timed.length} sessions started after ${LATE_HOUR % 12 || 12}pm`,
    body: 'Late training is training you pay for with sleep, and sleep is where the adaptation happens. If the schedule cannot move, keep the late ones lower-intensity and put the hard sessions where you can get to bed after them.',
  };
}

function backupNudge({ state, lastExportAt }: CoachInput, today: string): Tip | null {
  if (state.completedSessions < 10) return null;
  const days = lastExportAt ? daysBetween(lastExportAt, today) : null;
  if (days !== null && days < BACKUP_INTERVAL_DAYS) return null;
  return {
    id: 'backup',
    signature: lastExportAt ?? 'never',
    tone: 'caution',
    weight: 35,
    headline: days === null ? 'You have never exported a backup' : `${days} days since your last backup`,
    body: 'Everything lives on this device and nowhere else. A cleared browser, a lost phone or a reinstalled app takes the lot with it, and there is no account to restore from. The export is one tap and one file.',
    action: { label: 'Export now', href: '/settings' },
  };
}

function streakPraise({ state }: CoachInput): Tip | null {
  if (state.streakWeeks < 4) return null;
  return {
    id: 'streak',
    signature: `${Math.min(state.streakWeeks, 52)}`,
    tone: 'good',
    weight: 20,
    headline: `${state.streakWeeks} weeks on target`,
    body: 'This is the part almost nobody manages, and it is worth more than any single session in the run. Nothing to change — this is here so the record says it happened.',
  };
}
