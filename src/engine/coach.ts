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
    loadSpike(input),
    staleBenchmarks(input, today),
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
    return {
      id: 'detraining',
      signature: away >= 60 ? 'long' : away >= 28 ? 'month' : 'fortnight',
      tone: 'caution',
      weight: 58,
      headline: `${away} days since you trained`,
      body: 'Finger strength holds for a while and everything else does not. Come back at about two-thirds of the volume you left on and give it a fortnight before judging anything — the first sessions back always feel worse than the fitness actually is.',
      action: { label: 'Plan the week', href: '/calendar' },
    };
  }

  if (acwr !== null && acwr < DETRAINING_ACWR) {
    return {
      id: 'detraining',
      signature: acwr < 0.5 ? 'deep' : 'shallow',
      tone: 'caution',
      weight: 58,
      headline: 'Training has dropped off',
      body: `You are at ${acwr.toFixed(2)}× your own baseline. A week or two here is recovery; a month is losing what you built. The way back up is more sessions, not harder ones — the same ratio punishes a change in either direction.`,
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
function isRestDay(session: Session): boolean {
  return session.restChecklist !== undefined && session.climbs.length === 0;
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
  body: string;
  action: { label: string; href: string };
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
    body: 'Technique is the only stat that will not move for you on volume alone. Your program prescribes a drill each week and it takes ten minutes of a session you are already having.',
    action: { label: 'See this week', href: '/train' },
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

function missingDomains({ state }: CoachInput): Tip[] {
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
      body: d.body,
      action: d.action,
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
