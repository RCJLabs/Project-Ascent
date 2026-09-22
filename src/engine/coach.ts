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
import { addDays, daysBetween, fromKey, shortLabel, today as todayKey } from './dates';
import { poorRun } from './conditions';
import { MIN_CHRONIC_DAYS, MIN_RATIO_DAYS, type ClimberState } from './derive';
import { recoverySentence, type Diagnosis } from './plateau';
import { activeProjects, attemptsFor, burnsIn, highPointOf } from './projects';
import type { BlockAdherence } from './adherence';
import type { LoadRelief } from './loadRelief';
import type { Finding } from './planVsLog';
import { FINGER_GAP_HOURS, fingerGaps } from './fingerGap';
import type { Objective } from './objectives';
import { tripNow } from './trip';
import { comedownNow, type Comedown } from './comedown';
import { type AwayPeriod, awayName, explainsGap, wasClimbing } from './away';
import { isRestSession } from './rest';
import { isAddedWeight } from './units';
import { counted } from './phrase';

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
   * Which session the rest of the week could lose (PLAN.md M318).
   *
   * Passed in already computed, like `adherence` and for the same reason:
   * working it out needs the program, its start date, the week plan and the
   * overrides, which is four things the coach has no business holding.
   * Null whenever it cannot be said honestly — no baseline, nothing left in
   * the week, or a planned session of a type this climber has never done,
   * which would put an invented number in a ranking that names one session.
   */
  relief?: LoadRelief | null;
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
  /**
   * The climber's objectives, so the coach can tell a trip from a Tuesday
   * (PLAN.md M163).
   *
   * Passed in whole rather than as a pre-computed "on a trip" boolean,
   * unlike `adherence` and `findings`, because the reading is three lines
   * over a list the store already holds — there is no program, no start
   * date and no plan to assemble — and because the tip names the trip, so
   * it needs the objective and not a verdict about it.
   */
  objectives?: Objective[];
  /**
   * Stretches the climber told the app they were away for (PLAN.md M275).
   *
   * The one fact the log cannot hold, and the answer to the line this file
   * has carried since M100: *"The app cannot tell 'did not train' from 'did
   * not log'"*. Passed whole for the same reason `objectives` is — the
   * reading is a filter over a short list, and two tips name the marker, so
   * they need the record rather than a verdict about it.
   */
  away?: AwayPeriod[];
  today?: string;
}

/** Attempt counts that earn a word. Escalating, so it is not said twice. */
export const BURN_RUNGS = [5, 10, 20, 40] as const;

/** Days away from rock before coming back deserves a different plan. */
export const OUTDOOR_GAP_DAYS = 21;

/** Days between backups before the offline story needs saying out loud. */
export const BACKUP_INTERVAL_DAYS = 30;

/**
 * How far a benchmark has to move, and how recently, to earn a sentence
 * (PLAN.md M178).
 *
 * Five per cent because that is past the noise of a retest — the same hand,
 * the same edge, a different day — and under what a real block moves. A
 * grade metric needs no percentage: a step up a ladder is the size.
 *
 * A hundred and twenty days because a gain is news about *training*. Two
 * readings three years apart say a climber got better at climbing, which they
 * knew; two readings eleven weeks apart say the block worked.
 */
export const GAIN_PERCENT = 5;

/**
 * The same floor for a metric that carries no percentage because it measures
 * added weight (PLAN.md M234).
 *
 * Five pounds: the smallest plate most climbers can actually add, and past
 * the noise of a retest on the same hand and the same edge. A block moves a
 * max hang by five to ten, so this is the bottom of "the block worked" and
 * not the top of it.
 */
export const GAIN_ADDED_LBS = 5;
export const GAIN_WINDOW_DAYS = 120;

/**
 * Sessions before a waved-away nag comes back (PLAN.md M175, M182).
 *
 * A dismissal is against a fact and a fact has to be able to change. Neither
 * of these two rules has a number that grows on its own — a domain gap is
 * binary and a backup that was never taken stays never — so the fact both
 * borrow is the log itself: roughly a month of training, after which the
 * silence has outlived what it was agreed to.
 */
export const DOMAIN_RETURN = 10;
export const BACKUP_RETURN = 10;

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
  // Built first and handed to `plateau`, because the two cards sit next to
  // each other and one of them has the load number in it (PLAN.md M190).
  // Passed rather than re-derived: asking "will the spike fire?" twice is
  // two copies of one predicate, which is the rule M169 states.
  const spike = loadSpike(input, today);
  const tips = [
    firstSession(input),
    coldStart(input),
    plateau(input, spike),
    ...projectBurns(input, today),
    outdoorReentry(input, today),
    poorConditions(input, today),
    detraining(input, today),
    fingerGap(input, today),
    unscoredEffort(input),
    spike,
    benchmarks(input, today),
    benchmarkGain(input, today),
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

/**
 * What the app can say before it can model anything (PLAN.md M173).
 *
 * ## The hole this fills, measured
 *
 * A probe built four climbers and asked `buildTips` what it had on each day
 * of their first two months. A climber training three times a week gets
 * `firstSession` on day zero and then **nothing at all until day eighteen**
 * — and `HomePage`'s `CoachCard` renders `null` on an empty list, so
 * Coach's Corner is not a quiet card in that window. It is **gone**. The
 * single act of logging a first session removes the feature from the front
 * door.
 *
 * Opening it deliberately was no better. The page's empty state read *"Every
 * rule here has looked at your log and found nothing worth interrupting you
 * about, which is the good outcome"* — a clean bill of health, issued to a
 * climber whose log no rule here is able to read yet.
 *
 * ## And for some climbers it is not a window
 *
 * A readable ratio needs both of `derive.ts`'s conditions: `MIN_RATIO_DAYS`
 * of span *and* `MIN_CHRONIC_DAYS` of scored training inside the rolling
 * 28-day window. Density is the one nobody had counted against a real
 * schedule. **At one session a week it tops out at four**, so the second
 * condition is never met — not at three weeks, not at a year. Measured: that
 * climber's first tip of any kind arrives on **day 56**, and the ratio never
 * arrives at all.
 *
 * `ui/loadZone.ts` used to tell them *"three weeks of logged sessions and
 * this becomes meaningful"*. It does not become meaningful. Saying so is the
 * point of the third branch below.
 *
 * ## Why this is a rule and not a copy change
 *
 * Because the honest answer differs by climber, and the app already holds
 * everything needed to tell them apart: whether anything is scored at all,
 * how much span there is, and how dense it is. M162 made the same argument
 * one condition over — *"telling a climber three weeks in to score their
 * sessions is advice that does not work"* — and this is that argument
 * applied to the other half.
 *
 * It sits below every rule that reads real data and above the domain gaps,
 * because in this window nothing else can fire; once something can, it
 * should win.
 */
function coldStart({ state }: CoachInput): Tip | null {
  const { zone, unknownBecause, daysOfHistory, scoredDays, unmeasuredDays } = state.load;
  // `unscoredEffort` owns the other reason, and `firstSession` owns a log
  // with nothing in it. This rule is the gap between them.
  if (zone !== 'unknown' || unknownBecause !== 'history') return null;
  if (state.completedSessions === 0) return null;

  // Nothing is counting. Said first because a countdown that never moves is
  // worse than no countdown — `daysOfHistory` is measured from the earliest
  // *scored* day, so for this climber it reads zero however long they log.
  if (scoredDays === 0 && unmeasuredDays > 0) {
    return {
      id: 'cold-start',
      signature: `unscored:${unmeasuredDays}`,
      tone: 'caution',
      weight: 55,
      headline: 'None of what you have logged is counting yet',
      body: 'Load is effort × hours, so a session with no effort score contributes nothing to it — and every screen built on load is waiting on those numbers rather than on more training. An RPE is one tap at the bottom of the logger, and it is worth adding to the sessions already logged while you can still remember how they felt.',
      action: { label: 'Open the calendar', href: '/calendar' },
    };
  }

  // Span short: a real countdown, from a number the app already holds and
  // no screen has ever shown.
  if (daysOfHistory < MIN_RATIO_DAYS) {
    const left = MIN_RATIO_DAYS - daysOfHistory;
    return {
      id: 'cold-start',
      // Weekly, so setting it aside in week one does not also set aside
      // week two. Dismissal is against a fact, and the fact here is how far
      // in you are.
      signature: `history:${Math.floor(daysOfHistory / 7)}`,
      tone: 'neutral',
      weight: 55,
      headline: `${left} more ${left === 1 ? 'day' : 'days'} before the load ratio can say anything`,
      body: `The ratio compares your last week against your own four-week baseline, and you do not have four weeks yet — so the app would rather show nothing than divide one small number by another. What it needs is ${MIN_RATIO_DAYS} days of span and at least ${MIN_CHRONIC_DAYS} days of scored training inside the last four weeks. Everything else works now: the grades, the pyramid, the projects and the log itself do not wait on this.`,
    };
  }

  // Span is there and density is not, which is a fact about the schedule
  // rather than about how long they have been at it.
  return {
    id: 'cold-start',
    signature: `rate:${scoredDays}`,
    tone: 'neutral',
    weight: 55,
    // Not "more weeks than yours have" (PLAN.md M249). The comment above
    // this branch has always said what it is — *span is there and density
    // is not* — and the body says it too: "You have the history for it."
    // The headline said the opposite of both, on the card directly above
    // the sentence contradicting it.
    headline: 'Enough weeks logged, not enough training days in them',
    body: `You have the history for it — what it also needs is ${MIN_CHRONIC_DAYS} days of scored training inside any four-week window, and at your current rate there are ${scoredDays}. That is not a fault and it is not a reason to train more than suits you; it is a number that simply does not apply at this frequency. The grade pyramid, the benchmarks and the consistency grid all read your log as it is.`,
    action: { label: 'See what does read it', href: '/progress' },
  };
}

/**
 * The verdict, minus whatever the card above it already said (PLAN.md M190).
 *
 * `load-spike` sits at weight 93 and this at 92, so on a board where the
 * load is the problem they were adjacent and quoting the same ratio to two
 * decimal places: *"You are at 2.43× your own four-week baseline"* and then
 * *"your load has jumped to 2.43× your baseline"*. Two cards spending the
 * climber's attention on one number is the noise the board exists to avoid.
 *
 * The verdict itself is not the duplicate and does not go: *no verdict on
 * your training until this is dealt with* is a different fact from *ease
 * off*, and it is the one that explains why Progress has stopped giving a
 * read. Only the clause that repeats is dropped — and only when the spike
 * card is really there, which is why it is passed in rather than guessed at
 * from the zone. A deload suppresses the spike, and then this card is the
 * only place the number appears.
 *
 * `diagnosis.explanation` is left alone: Progress renders it whole, and
 * there is nothing beside it there to repeat.
 */
function plateau({ diagnosis }: CoachInput, spike: Tip | null): Tip | null {
  if (!diagnosis) return null;
  if (diagnosis.verdict === 'recovery-compromised') {
    const reasons = spike
      ? diagnosis.reasons.filter((reason) => reason.kind !== 'overload')
      : diagnosis.reasons;
    // Every reason was the one the spike card is carrying. The verdict still
    // stands and still has somewhere to send them; what it must not do is
    // say the number again to fill the space.
    //
    // Named as the fact rather than as the card — no "above", no "the card
    // beside this". Home shows exactly one tip, so a sentence that points at
    // a neighbour is wrong there, and card order is not something copy
    // should depend on anywhere.
    const said =
      reasons.length > 0
        ? recoverySentence(reasons)
        : 'The load ratio is the whole of it, and no verdict on your training holds while it stands.';
    return {
      id: 'recovery',
      // The reasons, not just the verdict: waving this away with a tweaked
      // finger must not also wave it away three weeks later when the reason
      // is a load spike (PLAN.md M175).
      signature: `${diagnosis.verdict}:${diagnosis.reasons.map((r) => r.kind).join('+')}`,
      tone: 'caution',
      weight: 92,
      headline: 'Recovery is the blocker',
      body: `${said} Nothing else in your training is worth changing until this is.`,
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
    // `burnsIn` rather than a sum of its own (PLAN.md M309): this counted
    // `count` with no floor, so an attempt row carrying a zero — which an
    // import can produce — was a go this headline did not count.
    const burns = burnsIn(attempts);
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

/**
 * Three days on rock, all of them against you (PLAN.md M289).
 *
 * The app has always been able to see a flat stretch of outdoor grades and
 * has never been able to see why. `pyramidShape.ts` states the general
 * version — a reading of a log is a statement about the log at least as much
 * as about the climber — and this is the one case where the climber can
 * settle it themselves, because they were there.
 *
 * **It corrects nothing.** No grade moves, no ladder is adjusted, no session
 * is re-priced; `conditions.ts` says why at length. What it does is put the
 * sentence where the wrong conclusion gets drawn, which is the same job the
 * M275 tip above does for a fortnight in Font.
 *
 * Low weight on purpose. It is context for a number the climber is reading,
 * not a thing to do, and it carries no action for the same reason — there is
 * nothing to fix and the next cold spell is not on a button.
 *
 * The browser is what asked for the bound below. The sample climber's last
 * three days on rock spanned twelve days, which is fine, and nothing stopped
 * the same sentence being said about three days spread across a winter —
 * true, stale, and sitting under `outdoorReentry` saying something about the
 * same gap.
 */
function poorConditions({ sessions }: CoachInput, today: string): Tip | null {
  const run = poorRun(sessions);
  if (run === null) return null;
  // And not about a stretch that is already history. Past `OUTDOOR_GAP_DAYS`
  // the rule below has the floor and says something stronger about the same
  // days; two cards about one gap is the app talking over itself, and the
  // grades this qualifies are not the ones being read any more.
  if (daysBetween(run.to, today) >= OUTDOOR_GAP_DAYS) return null;
  return {
    id: 'poor-conditions',
    // The length, so a fourth bad day brings it back after a dismissal and
    // the third does not keep coming back once waved away.
    signature: `${run.days}`,
    tone: 'neutral',
    weight: 30,
    headline: `Your last ${run.days} days on rock were ${run.word}`,
    body: `You said so yourself, on every one of them since ${shortLabel(run.from)}. Grades from a stretch like that are a reading of the rock as much as of you — nothing here has been adjusted for it, and nothing should be, but a flat few weeks outdoors with this behind it is not the same fact as a flat few weeks in good nick.`,
  };
}

/**
 * Coming back to rock, and the gap that was not one (PLAN.md M275).
 *
 * This rule read the log and nothing else, twenty lines above `detraining`,
 * which has read `comedownNow` since M188 for exactly this reason. So a
 * climber who spent a fortnight in Font and logged none of it — which is the
 * normal way a fortnight in Font goes — came home to *"35 days since you were
 * on rock. Plan the first day back two grades under your indoor number."*
 *
 * Every word of that is wrong for them, and the advice is the part that
 * matters: telling someone fresh off three weeks of granite to drop two
 * grades is worse than saying nothing.
 *
 * **It still fires**, which is M163's rule and holds here: the gap in the
 * *ladder* is real whatever happened, and those days are missing from the
 * outdoor grades, the venues and the year. Only the sentence changes, to the
 * one the climber's own marker supports.
 */
function outdoorReentry({ state, sessions, away: marked }: CoachInput, today: string): Tip | null {
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

  // Only a `trip` marker contradicts this tip. Three weeks off with a
  // shoulder is three weeks off rock, and the advice below is exactly right
  // for it — reading every kind alike would throw away the one thing the
  // climber went to the trouble of saying.
  const trip = explainsGap(marked, addDays(last, 1), today);
  if (trip !== null && wasClimbing(trip.kind)) {
    return {
      id: 'outdoor-reentry',
      // The marker is part of the fact, so waving this away for a logged
      // trip does not also wave away the real layoff the same gap becomes.
      signature: `after:${bucket}`,
      tone: 'neutral',
      weight: 48,
      headline: `${awayName(trip)} is missing from your outdoor log`,
      body: 'You marked those days away, so this is the app reading the log rather than doubting you — nothing here needs fixing for your fingers. It does mean the grades, the venues and the ladder all stop before that trip. Backfilling even the best day of it puts the outdoor side of every number back where it belongs.',
      action: { label: 'Add the days', href: '/calendar' },
    };
  }

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

/**
 * What a quiet stretch is called when something explains it (PLAN.md M188).
 *
 * The tip still fires — M163's rule, and it holds harder here: a comedown
 * that runs long really does become a layoff, and swallowing the sentence
 * would leave the climber with nothing at the point it starts being true.
 * Only the words change, and they change to the true ones.
 */
/**
 * What the quiet is "since".
 *
 * A function rather than `comedown.trip?.name`, which is what this was: the
 * union grew a third member at M275 and `trip` is not a field on it. The
 * optional chain would have compiled against a wider type and silently read
 * `undefined` for every away marker, printing "Quiet since the last block" to
 * a climber who had just typed the name of the trip.
 */
function comedownSince(comedown: Comedown): string {
  if (comedown.because === 'away') return awayName(comedown.period);
  return comedown.trip?.name ?? 'the last block';
}

function comedownBody(comedown: Comedown, tail: string): string {
  const days = `${comedown.quietDays} day${comedown.quietDays === 1 ? '' : 's'}`;
  if (comedown.because === 'away') {
    return `${days} quiet, and you said why: ${awayName(comedown.period)}. Climbing that is not written down looks exactly like climbing that did not happen, and this is the app taking your word for it rather than the log's. ${tail}`;
  }
  if (comedown.because === 'trip') {
    return `${days} quiet, and ${comedown.trip.name} is the obvious reason — a trip that is climbed and not logged looks exactly like a trip that did not happen, and this is the app reading the log rather than doubting you. ${tail}`;
  }
  const named = comedown.trip?.name ?? 'the fortnight before it';
  return `${days} quiet after ${named} ran at ${comedown.ratio.toFixed(1)}× your own baseline. That is a taper, not a loss: the ratio falls after a peak because the peak is what raised it. ${tail}`;
}

function detraining({ state, sessions, objectives, away: marked }: CoachInput, today: string): Tip | null {
  const { acwr, inPlannedDeload, daysOfHistory } = state.load;
  if (inPlannedDeload || daysOfHistory < 28) return null;

  // Read before either branch, because both were saying the same wrong thing
  // for the same reason.
  const comedown = comedownNow(sessions, objectives, today, marked);

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
    if (comedown !== null) {
      return {
        id: 'detraining',
        // The explanation is part of the fact. A climber who waves this away
        // coming home from a trip has not waved away the layoff that the
        // same silence becomes three weeks later.
        signature: `after:${comedown.because}:${away >= 28 ? 'month' : 'fortnight'}`,
        tone: 'neutral',
        weight: 44,
        headline: `Quiet since ${comedownSince(comedown)}`,
        body: comedownBody(
          comedown,
          'Nothing to fix today. If you did climb through it, marking those days on the calendar puts the numbers back where they belong.',
        ),
        action: { label: 'Mark the days you trained', href: '/calendar' },
      };
    }
    /**
     * A marker that is not a trip (PLAN.md M275).
     *
     * `comedownNow` deliberately returns null for these: a comedown is quiet
     * *after load*, and flu is quiet after nothing. So the layoff is real, the
     * advice below is exactly the advice this climber needs, and the only
     * thing wrong with the old tip was the first line — it asked a question
     * they had already answered.
     *
     * Which is why this changes the headline and the opening clause and
     * nothing else. Softening the rest would be the app congratulating
     * someone on three weeks off sick.
     */
    const off = explainsGap(marked, last ? addDays(last, 1) : today, today);
    if (off !== null) {
      return {
        id: 'detraining',
        signature: `off:${away >= 60 ? 'long' : away >= 28 ? 'month' : 'fortnight'}`,
        tone: 'caution',
        weight: 58,
        headline: `${away} days off — ${awayName(off)}`,
        body: 'You told the app, so nothing here is a surprise and there is nothing to correct. Coming back is still the part worth planning: finger strength holds for a while and everything else does not, so come back at about two-thirds of the volume you left on and give it a fortnight before judging anything — the first sessions back always feel worse than the fitness actually is.',
        action: { label: 'Plan the week', href: '/calendar' },
      };
    }

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
    if (comedown !== null) {
      return {
        id: 'detraining',
        signature: `after:${comedown.because}:${acwr < 0.5 ? 'deep' : 'shallow'}`,
        tone: 'neutral',
        weight: 44,
        headline: `Coming down from ${comedownSince(comedown)}`,
        body: comedownBody(
          comedown,
          `You are at ${figure} your baseline now, which is where a week off is meant to put you. A fortnight here is still recovery; if it is still this quiet in a month, that is the one worth acting on.`,
        ),
      };
    }
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
 * Two finger sessions inside the gap, for a climber the program rules cannot
 * reach (PLAN.md M160).
 *
 * Eleven programs declare `min-gap-hours` and `planVsLog` checks it, behind
 * `program && startDate`. This is the same rule for everyone else: the two
 * open-ended modes, which carry no constraints at all, and a climber running
 * no program. General Training ships a *Hangboard / Finger* session type
 * whose own rationale says *"48 hours between hangboard sessions"* and has
 * nothing that could check it.
 *
 * Silent when `planVsLog` already has something to say about spacing —
 * being told the same thing twice in two voices is worse than once.
 */
function fingerGap(input: CoachInput, today: string): Tip | null {
  if ((input.findings ?? []).some((f) => f.kind === 'spacing')) return null;
  const found = fingerGaps(input.sessions, today);
  if (found === null) return null;

  const tightest =
    found.tightestHours === 0 ? 'twice in one day' : `${found.tightestHours} hours apart`;
  return {
    id: 'finger-gap',
    signature: `${found.breaches}`,
    tone: 'caution',
    // Above `plateau` (88) and below `recovery` (92) and a danger-zone
    // `load-spike` (93). Home shows one tip, so the order is the editorial
    // decision: the two above this are happening to the climber right now,
    // and a stalled grade is a training-quality observation. This is a
    // repeated behaviour the app's own programs forbid and its own Home
    // copy warns about — *"hangboarding and campusing injure fingers and
    // elbows when loaded too soon"* — which puts it above the grade.
    weight: 90,
    headline: `${found.breaches} finger sessions inside the ${FINGER_GAP_HOURS}-hour gap`,
    body: `Out of ${found.sessions} in the last eight weeks — the closest ${tightest}. Connective tissue adapts slower than the muscle that makes a hang feel easy, and the gap is what lets it: the programs here that prescribe fingerboarding all ask for ${FINGER_GAP_HOURS} hours between sessions, and this is the same rule when you are not running one of them. Climbing on the days between is fine; hanging is what needs the space.`,
    action: { label: 'See the week', href: '/calendar' },
  };
}

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

/**
 * What the week weighs, and the one session that is most of it.
 *
 * A sentence about the plan, never about the climber: *"the week as planned
 * comes to 1.84×"* is arithmetic anyone can check against their own
 * calendar, where *"you will be at 1.84×"* would be a claim about what
 * somebody is going to do. `engine/objectives.ts` sets that rule — *"no
 * projection that has not been earned"* — and `peak.ts` is the precedent
 * for staying inside it by projecting a prescription.
 */
function reliefLine(relief: LoadRelief | null | undefined): string {
  if (!relief?.drop) return '';
  const { session, without } = relief.drop;
  const left = relief.planned.length;
  const day = fromKey(session.date).toLocaleDateString(undefined, { weekday: 'long' });
  /**
   * *"The week ends at"*, not *"comes to"*.
   *
   * Reading the first draft's output is what found this. It read *"You are
   * at 2.24× … the week comes to 1.94× with it"*, which looks like training
   * more lowering the ratio. The arithmetic is right — by Thursday the
   * heavy days at the start of this week have rolled out of a seven-day
   * window — and the sentence was wrong, because two numbers about two
   * different days were printed as though they were about one. Both of
   * these are the end of the week; saying so is the whole fix.
   */
  return ` ${left} ${left === 1 ? 'session' : 'sessions'} left in the week as planned, and ${day}'s ${session.name} is the biggest of them: the week ends at ${relief.asPlanned.toFixed(2)}× with it and ${without.toFixed(2)}× without.`;
}

function loadSpike({ state, objectives, relief }: CoachInput, today: string): Tip | null {
  const { acwr, zone, inPlannedDeload } = state.load;
  // A deload is a deliberate change of load in the other direction, and the
  // ratio moving is the point of it rather than a surprise.
  if (inPlannedDeload || acwr === null) return null;
  if (zone !== 'caution' && zone !== 'danger') return null;

  const ratio = acwr.toFixed(2);
  // A trip is the other way round: the ratio moving is still a surprise to
  // nobody, but what it describes is *more* likely on a trip, not less. So
  // nothing is suppressed and nothing is downgraded — the advice changes,
  // because "an easier week" and "plan the week" are two things a climber
  // four days into nine in Céüse cannot do (PLAN.md M163).
  const trip = tripNow(objectives, today);
  if (zone === 'danger') {
    if (trip) {
      return {
        id: 'load-spike',
        signature: `trip:${trip.id}:${acwr >= STEEP_ACWR ? 'steep' : 'danger'}`,
        tone: 'caution',
        weight: 93,
        headline: 'Load spike',
        body: `You are at ${ratio}× your own four-week baseline, which is most of what ${trip.name} is for: a taper took the baseline down while the days on took the load up, so part of this number is the plan working. The pattern is real all the same, and a trip is where it usually lands — day four or five, on skin and finger tendons. What is still yours to choose is the shape of the days: a rest day between the hard ones rather than saved for the end, stopping while there is skin left, and the limit goes on the mornings you are fresh.`,
      };
    }
    return {
      id: 'load-spike',
      signature: acwr >= STEEP_ACWR ? 'danger-steep' : 'danger',
      tone: 'caution',
      weight: 93,
      headline: 'Load spike',
      body: `You are at ${ratio}× your own four-week baseline, and a jump this size is what this model exists to flag — not the training itself, the speed of the change.${reliefLine(relief)} An easier week now costs a week. Fingers and tendons adapt slower than the muscles that made this feel possible.`,
      action: { label: 'Plan the week', href: '/calendar' },
    };
  }
  if (trip) {
    return {
      id: 'load-spike',
      signature: `trip:${trip.id}:caution`,
      tone: 'caution',
      weight: 62,
      headline: 'Ramping quickly',
      body: `You are at ${ratio}× your own four-week baseline, which for a trip is a gentle start: if ${trip.name} has days left in it, most of the jump is still ahead. Nothing to change today — the day this matters is the one after two big days back to back.`,
    };
  }
  return {
    id: 'load-spike',
    signature: 'caution',
    tone: 'caution',
    weight: 62,
    headline: 'Ramping quickly',
    body: `You are at ${ratio}× your own four-week baseline. That is a fine week and a bad month — the ratio is about the speed of the change, not the size of the load, so holding here for a while is how it becomes the new baseline safely.${reliefLine(relief)}`,
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

/** Sessions before the coach asks for a first benchmark (PLAN.md M174). */
const MIN_SESSIONS_FOR_BASELINE = 2;

/**
 * The battery, and the two things that can be wrong with it (PLAN.md M174).
 *
 * ## The field that was declared for this and never filled
 *
 * `CoachInput.programMetrics` has carried the comment *"Program assessment
 * ids, so staleness is judged on what you were asked"* since it was written.
 * Nothing read it and nothing passed it — `useTips` built every other input
 * the board needs and skipped this one — so the rule below could only ever
 * look at metrics the climber had **already recorded**, which is why it had
 * nothing to say to a climber who had recorded none.
 *
 * It matters twice over. A prescribed number nobody has taken is invisible
 * to a rule reading the entries, and a number the climber took once out of
 * curiosity is nagged about for ever even though no program asked for it.
 * Both are the same missing input.
 *
 * ## Never taken beats gone stale
 *
 * They are two ids rather than two branches of one, so a dismissal of either
 * is about its own fact — and only one can fire, because the file's own rule
 * is one gap at a time and *"a list of five things you are not doing reads
 * as an indictment"*.
 *
 * A first baseline goes first because the window for it closes: a number
 * taken in week one is the only *before* a twelve-week block will ever have,
 * and one taken in week six compares against nothing. That is also the
 * argument for the weight, and it was the hard part. **52 rather than 58**,
 * so M173's `cold-start` still leads the front door while the load model is
 * warming up: both sit on the board throughout, and the difference is only
 * which card Home shows for the first three weeks. A single Home card
 * reading *"take seven measurements"* on day two is a worse first
 * impression than one explaining why the app looks quiet, and the ask is
 * not lost — it becomes the top card the moment the countdown resolves.
 */
function benchmarks(input: CoachInput, today: string): Tip | null {
  const entries = input.metrics ?? [];
  const prescribed = input.programMetrics ?? [];
  // What the climber was asked for. With nothing asked — no program, or
  // Trip Prep, the one entry in the catalogue that prescribes none — fall
  // back to what they have chosen to track, which is the behaviour this rule
  // had before and the only honest reading when nobody set a battery.
  const ids = prescribed.length > 0 ? prescribed : [...new Set(entries.map((e) => e.metricId))];
  const known = [...new Set(ids)].filter((id) => METRICS[id]);
  if (known.length === 0) return null;

  const statuses = known
    .map((id) => assessmentStatus(id, entries, { today }))
    .filter((s): s is NonNullable<ReturnType<typeof assessmentStatus>> => s !== null);

  // Nothing in the battery has ever been measured. `assessmentStatus` has
  // reported this as `due: 'baseline'` since it was written; no rule had
  // ever asked it.
  if (statuses.every((s) => s.latest === null)) {
    if (input.state.completedSessions < MIN_SESSIONS_FOR_BASELINE) return null;
    const n = statuses.length;
    return {
      id: 'no-baseline',
      // The size of the battery, so a climber who switches to a program
      // asking for more is asked again.
      signature: `${n}`,
      tone: 'neutral',
      weight: 52,
      headline: `No baseline for the ${n} number${n === 1 ? '' : 's'} your training is meant to move`,
      body: 'Every one of them is a measurement the app will chart, compare and put in the block report — and none of it can happen without a first reading to compare against. Taken now it is a before; taken in two months it is just a number. Most of the battery is one session.',
      action: { label: 'Take a baseline', href: '/assessments' },
    };
  }

  const due = statuses.filter((s) => s.due === 'stale');
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

/**
 * The one thing that went right, said out loud (PLAN.md M178).
 *
 * ## The measurement this milestone was built on
 *
 * Twenty-three tips are constructed in this file and **exactly one carries
 * `tone: 'good'`** — `streakPraise`, at weight 20, the lowest number in the
 * table. Everything above it is a fault, a gap, a risk or a nag. Over a year
 * of use Coach's Corner is a list of what is wrong with you, and a coach who
 * only speaks when something is wrong trains a climber to stop reading —
 * which matters most for the rules in here that are about not getting hurt.
 *
 * ## And the app was already computing the other half
 *
 * `assessmentStatus` returns a `change` beside the `due`: the delta between
 * the last two readings, whether it was an improvement, and by what percent.
 * `benchmarks` above has called that function since M174 and reads **only**
 * `due`. The good news was in the coach's hand and it was looking at the
 * other field — which is M174's own finding one level deeper.
 *
 * ## What makes it praise rather than noise
 *
 * The second brainstorm parked *a thin top of the pyramid* because praise
 * that fires for almost everyone almost always is worth nothing, and that is
 * the whole difficulty here. This one has the three things `streakPraise`
 * does not: a **subject** (which number), a **size** (how much it moved) and
 * a **window** (over how long). It fires on a measurement the climber chose
 * to take, twice, and it is silent for everybody else — including a climber
 * who is training well and has not tested anything.
 *
 * Ranked above the gaps and the nags and below every fault, because it is
 * news rather than a standing fact: a gain happened on a day, and *no rest
 * days logged, ever* will still be true tomorrow.
 */
function benchmarkGain({ metrics }: CoachInput, today: string): Tip | null {
  const entries = metrics ?? [];
  // No registry filter: `assessmentStatus` already returns null for an id the
  // catalogue does not know, and the null filter below is the one that drops it.
  const ids = [...new Set(entries.map((entry) => entry.metricId))];

  const gains = ids
    .map((id) => assessmentStatus(id, entries, { today }))
    .filter((status): status is NonNullable<typeof status> => status !== null)
    .flatMap((status) => {
      const { change, series, metric } = status;
      if (change?.improved !== true) return [];
      const latest = series.at(-1)!;
      const previous = series.at(-2)!;
      // News, not history: the gain has to be recent *and* the two readings
      // close enough together to be about a block rather than a decade.
      const span = daysBetween(previous.date, latest.date);
      if (span > GAIN_WINDOW_DAYS || daysBetween(latest.date, today) > GAIN_WINDOW_DAYS) return [];
      // A grade, a pass, or a number that used to be zero carries no
      // percentage and needs none — a step up a ladder is already the size,
      // and off zero is every percentage there is. The rest clear the noise.
      //
      // **Added weight carries none either, and does need one** (PLAN.md
      // M234). It used to carry a percentage and the percentage was wrong —
      // of the plate rather than of the load — and taking it away left the
      // metric on `Infinity`, where a one-pound retest outranked a grade.
      //
      // So both are ranked as multiples of their own noise floor, which is
      // the only scale the two share: five per cent for the things that
      // carry a percentage, five pounds for the things that cannot.
      const size =
        change.percent === null
          ? isAddedWeight(metric.unit)
            ? (Math.abs(change.delta) / GAIN_ADDED_LBS) * GAIN_PERCENT
            : Infinity
          : Math.abs(change.percent);
      if (size < GAIN_PERCENT) return [];
      return [{ metric, change, latest, span, size }];
    })
    // Biggest first, and among the percentless ones — all of them Infinity —
    // the one that moved the most rungs.
    .sort((a, b) => b.size - a.size || Math.abs(b.change.delta) - Math.abs(a.change.delta));

  const best = gains[0];
  if (best === undefined) return null;
  const weeks = Math.max(1, Math.round(best.span / 7));
  // "improved", not "is up": `min_edge` gets better by going down, and a
  // headline reading *Min Edge Achievable is up: −2 mm* would be a lie told
  // by a rule whose whole job is saying something true and nice.
  const size =
    best.change.percent === null
      ? best.change.label
      : `${best.change.label} (${Math.round(Math.abs(best.change.percent))}%)`;
  return {
    id: 'benchmark-gain',
    // The reading it is about, so it is said once and the next retest earns
    // its own sentence rather than repeating this one.
    signature: `${best.metric.id}:${best.latest.date}`,
    tone: 'good',
    weight: 56,
    headline: `${best.metric.label} improved: ${size}`,
    body: `Measured, over ${weeks} week${weeks === 1 ? '' : 's'}, by you — which is the only kind of progress this app will claim. Nothing to do about it; the number is here because a training log that only ever reports faults is a log nobody reads for long.`,
    action: { label: 'See the curve', href: '/assessments' },
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
    // Three states, where M132 left two (PLAN.md M249). Its own note says
    // the fix was "to say the true thing to each of them", and `undefined`
    // — no program at all — fell into the branch naming one. A climber
    // eight sessions in with no program was told *"Your program does not
    // prescribe drills"* about a program they have never had, which is the
    // state this tip is most likely to find them in.
    body: (input) =>
      input.prescribesDrills === undefined
        ? 'Technique is the only stat that will not move for you on volume alone. You are not running a program, so nothing is going to put one in your week for you: the library has a hundred and fifty-odd, twelve of which need no wall at all, and any of them can go on today.'
        : input.prescribesDrills
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
      // The fact, rather than the word "missing" (PLAN.md M175).
      //
      // Every other rule in this file signs itself with what raised it, and
      // `visibleTips` hides a tip while `dismissed[id] === signature` — so a
      // constant signature is a dismissal that can never expire. These five
      // are the rules aimed at a climber's habits, gated at eight to
      // twenty-five sessions, and they each had exactly one chance to be
      // read.
      //
      // What changes is not the gap, which is binary, but the history that
      // makes it worth saying: *still no rest days after forty sessions* is a
      // stronger sentence than after ten. So it returns every
      // `DOMAIN_RETURN` sessions, which is roughly a month of training.
      signature: `${Math.floor(state.completedSessions / DOMAIN_RETURN)}`,
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
    // What is at risk, not only when it was last banked (PLAN.md M182).
    //
    // `lastExportAt ?? 'never'` alone re-armed on the **action being asked
    // for**: dismiss it before you have ever exported and the signature
    // stays `'never'` for as long as you never export, which is precisely
    // the climber it is written for. One tap in month one silenced it
    // through a decade of logging, on the one rule whose subject is total
    // loss. The session count is the fact that actually grows, so the
    // dismissal lasts a month of training rather than for ever.
    signature: `${lastExportAt ?? 'never'}:${Math.floor(state.completedSessions / BACKUP_RETURN)}`,
    tone: 'caution',
    weight: 35,
    headline:
      days === null
        ? `${counted(state.completedSessions, 'session')} logged and never exported`
        : `${days} days since your last backup`,
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
