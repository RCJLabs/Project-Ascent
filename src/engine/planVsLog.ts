/**
 * The plan, checked against the log (PLAN.md M148).
 *
 * ## The shape
 *
 * Every reading here is the same join with different columns: **read what
 * the program asked for a week, read what the log says about that week,
 * report the difference with both numbers.** Six of them existed as two
 * halves that never met — a minute estimate and a logged duration, a
 * declared intensity and a typed RPE, a weekly step and a series of
 * readings, a deload marker and a load index, a spacing constraint and a
 * list of dates, a menu and a set of ticks. Nothing imported both halves of
 * any of them.
 *
 * They live in one module rather than six because they want one vocabulary
 * and one rule about when to stay quiet. Six cards on six screens would be
 * six new opinions; this is one.
 *
 * ## What the estimate cannot say, and so does not
 *
 * The obvious length reading — *"your 60-minute sessions run 95"* — is not
 * one this app is entitled to. `sessionMinutes` counts the **prescribed
 * work** and says so at length: not the warm-up, not the walk to the wall,
 * not the rest between burns that ends when you want to climb again. A
 * session that takes longer than its work estimate is the ordinary case and
 * means nothing. So length is read in one direction only: a session logged
 * *under* the work it was prescribed is a session where the work did not all
 * happen, and that is sayable. The exception is a type whose author wrote a
 * `duration` — that field means the whole session, blocks included
 * (`sessionLength.ts`), so for those the long direction is a real reading
 * and is taken.
 *
 * ## Gates, which are most of the milestone
 *
 * Every one of these can fire on a climber having a normal week, and an app
 * that says so is one nobody opens. So each join carries a sample floor and
 * a magnitude floor, each returns **only its single worst subject** — the
 * rule `skippedType` set, that "you are behind on four things" is an
 * indictment and nobody acts on an indictment — and every finding carries
 * the two numbers it was built from, because an opinion that will not show
 * its reasoning has not earned the screen.
 *
 * Silence is a real answer throughout. A climber who logs no RPE and no
 * duration gets nothing from four of these six, and that is correct: the
 * app has nothing to compare.
 *
 * Pure — sessions and a program in, readings out. Nothing is stored.
 */

import {
  INTENSITY_ORDER,
  type Exercise,
  type Program,
  type SessionType,
} from '@/content/types';
import type { Session } from '@/db/sessions';
import { addDays, daysBetween, programWeek } from './dates';
import { sessionLoad } from './derive';
import { effortOfRpe } from './effort';
import { exerciseKey, hasNumbers, DIMENSIONS } from './exerciseLog';
import { blockWindow } from './plan';
import { joinList } from './phrase';
import { isRestSession } from './rest';
import { intensityOf } from './scheduler';
import { describeWork, sessionMinutes } from './sessionLength';

export type FindingKind = 'spacing' | 'deload' | 'effort' | 'length' | 'progression' | 'menu';

export interface Finding {
  kind: FindingKind;
  /** Stable across firings about the same subject, so a dismissal can name it. */
  id: string;
  /**
   * The magnitude, at its current size. A dismissal stores this, so waving
   * away "twice under the gap" does not also hide the fifth time.
   */
  signature: string;
  /** What it is about — a session type, a block, a constraint. */
  subject: string;
  /** What the program asked, in the climber's own units. */
  asked: string;
  /** What the log says, in the same units. */
  did: string;
  /** How many readings it is built from. Below the gate, silence. */
  sample: number;
  tone: 'neutral' | 'caution';
  headline: string;
  body: string;
  action?: { label: string; href: string };
  /** Higher sorts first. */
  weight: number;
}

/**
 * What each join is called, in one word.
 *
 * Two findings about the same session type read as a repeat without it —
 * *Finger Protocol* twice over, once about the gap between them and once
 * about the effort — and the subject alone cannot tell them apart.
 */
export const JOIN_WORD: Record<FindingKind, string> = {
  spacing: 'spacing',
  deload: 'deload',
  effort: 'effort',
  length: 'length',
  progression: 'progression',
  menu: 'menu',
};

export interface PlanVsLogInput {
  program: Program;
  startDate: string;
  sessions: readonly Session[];
  /** The climber's track, so a menu is the menu they were shown. */
  trackId?: string | undefined;
  today: string;
}

/** Sessions of one type before a reading of it is a pattern. */
export const MIN_SESSIONS = 4;

/** Under this share of the prescribed work, the work did not all happen. */
export const SHORT_RATIO = 0.6;

/** Over this share of an authored session length, it is not that session. */
export const LONG_RATIO = 1.5;

/** The share of rated sessions that must miss the declared intensity. */
export const EFFORT_SHARE = 0.75;

/** Breaches of a spacing rule before it is a pattern and not a bad week. */
export const SPACING_BREACHES = 2;

/** At or above this share of the weeks before it, a deload was not one. */
export const DELOAD_RATIO = 0.95;

/** Weeks that asked for a change and got the same numbers. */
export const FLAT_STEPS = 2;

/**
 * The lower median, so a set of RPEs comes back as an RPE.
 *
 * Averaging four sevens and four eights gives 7.5, which is not a number
 * anybody typed, and the whole point of these readings is that both sides
 * are things that exist.
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 0;
}

/** A completed session the program has a type for, placed in its week. */
interface Logged {
  session: Session;
  type: SessionType;
  week: number;
  deload: boolean;
}

function loggedDays(input: PlanVsLogInput, from: string, through: string): Logged[] {
  const { program } = input;
  const known = new Map(program.sessionTypes.map((t) => [t.id, t]));
  const deloads = new Set(program.deloadWeeks ?? []);
  const out: Logged[] = [];
  for (const session of input.sessions) {
    if (!session.completed || session.date < from || session.date > through) continue;
    if (isRestSession(session)) continue;
    const type = session.sessionTypeId ? known.get(session.sessionTypeId) : undefined;
    if (!type || type.isRest === true) continue;
    const week = programWeek(input.startDate, session.date, program.weeks);
    if (week === null) continue;
    out.push({ session, type, week, deload: deloads.has(week) });
  }
  return out.sort((a, b) =>
    a.session.date === b.session.date
      ? a.session.id.localeCompare(b.session.id)
      : a.session.date < b.session.date
        ? -1
        : 1,
  );
}

/** The logged days of each type, in date order. */
function byType(days: Logged[]): Map<string, Logged[]> {
  const out = new Map<string, Logged[]>();
  for (const day of days) {
    const list = out.get(day.type.id) ?? [];
    list.push(day);
    out.set(day.type.id, list);
  }
  return out;
}

// ── Length ────────────────────────────────────────────────────────────────

function lengths(input: PlanVsLogInput, days: Logged[]): Finding | null {
  const out: Finding[] = [];
  for (const [, group] of byType(days)) {
    const type = group[0]!.type;
    const rows: { minutes: number; low: number; high: number }[] = [];
    for (const day of group) {
      const minutes = day.session.durationMin;
      if (minutes === undefined || !Number.isFinite(minutes) || minutes <= 0) continue;
      const estimate = sessionMinutes({
        type,
        program: input.program,
        week: day.week,
        trackId: input.trackId,
        deload: day.deload,
      });
      if (estimate === null) continue;
      rows.push({ minutes, low: estimate.low, high: estimate.high });
    }
    if (rows.length < MIN_SESSIONS) continue;

    const medMinutes = median(rows.map((r) => r.minutes));
    const medLow = median(rows.map((r) => r.low));
    const medHigh = median(rows.map((r) => r.high));
    const asked = describeWork({ low: medLow, high: medHigh, read: 1, lines: 1 }) ?? '';
    const did = `${medMinutes} min logged`;

    const short = rows.filter((r) => r.minutes < r.low * SHORT_RATIO).length;
    if (short / rows.length >= EFFORT_SHARE) {
      out.push({
        kind: 'length',
        id: `plan-vs-log:length:${type.id}`,
        signature: `short:${medMinutes}`,
        subject: type.name,
        asked,
        did,
        sample: rows.length,
        tone: 'neutral',
        weight: 52,
        headline: `${type.name} is coming in short`,
        body: `The prescription for this session comes to ${asked}, and your last ${rows.length} ran ${medMinutes} minutes. That is not the warm-up difference — the estimate never counted the warm-up, the walk to the wall or the rest between burns, so it sits under a real session by design and yours is under it. Some of the prescribed work is not happening. If the session does not fit the evening it is on, a shorter version of it beats the top half of a long one.`,
        action: { label: 'See this week', href: '/train' },
      });
      continue;
    }

    // Only where the author wrote a length. A derived estimate counts the
    // prescribed work and nothing else, so running over it is what every
    // real session does.
    if (type.duration === undefined) continue;
    const long = rows.filter((r) => r.minutes > r.high * LONG_RATIO).length;
    if (long / rows.length < EFFORT_SHARE) continue;
    out.push({
      kind: 'length',
      id: `plan-vs-log:length:${type.id}`,
      signature: `long:${medMinutes}`,
      subject: type.name,
      asked: `${type.duration} as written`,
      did,
      sample: rows.length,
      tone: 'neutral',
      weight: 48,
      headline: `${type.name} is taking half again as long as it asks for`,
      body: `The program writes this one as ${type.duration} and your last ${rows.length} ran ${medMinutes} minutes. A session type that carries its own length carries it for the whole session, so this is not the estimate being conservative. Sessions that overrun are usually sessions with something else folded into them, which is fine until the week is built on the one that was written.`,
      action: { label: 'See this week', href: '/train' },
    });
  }
  return worst(out);
}

// ── Effort ────────────────────────────────────────────────────────────────

function efforts(days: Logged[]): Finding | null {
  const out: Finding[] = [];
  for (const [, group] of byType(days)) {
    const type = group[0]!.type;
    // A deload week is meant to be easier than the type declares, and the
    // declaration does not know about deloads.
    const rated = group.filter((d) => !d.deload && effortOfRpe(d.session.rpe) !== null);
    if (rated.length < MIN_SESSIONS) continue;

    const asked = intensityOf(type);
    const askedRank = INTENSITY_ORDER.indexOf(asked);
    const ranks = rated.map((d) => INTENSITY_ORDER.indexOf(effortOfRpe(d.session.rpe)!));
    const harder = ranks.filter((r) => r > askedRank).length;
    const easier = ranks.filter((r) => r < askedRank).length;
    const medRpe = median(rated.map((d) => d.session.rpe!));

    if (harder / rated.length >= EFFORT_SHARE) {
      out.push({
        kind: 'effort',
        id: `plan-vs-log:effort:${type.id}`,
        signature: `harder:${medRpe}`,
        subject: type.name,
        asked: `${asked} as written`,
        did: `RPE ${medRpe} logged`,
        sample: rated.length,
        tone: 'caution',
        weight: 68,
        headline: `${type.name} is written ${asked} and you log it at ${medRpe}`,
        body: `${harder} of your last ${rated.length} came in above what this day asks for. The four intensities are defined by what you can do the *next* day, which is the whole reason the week is laid out the way it is — a ${asked} day run at ${medRpe} takes a recovery the day after it was planned against. Either the session is being run harder than it is written, or it is sitting on a day where you arrive with something to prove.`,
        action: { label: 'See this week', href: '/train' },
      });
      continue;
    }
    if (easier / rated.length < EFFORT_SHARE) continue;
    out.push({
      kind: 'effort',
      id: `plan-vs-log:effort:${type.id}`,
      signature: `easier:${medRpe}`,
      subject: type.name,
      asked: `${asked} as written`,
      did: `RPE ${medRpe} logged`,
      sample: rated.length,
      tone: 'neutral',
      weight: 42,
      headline: `${type.name} is written ${asked} and you log it at ${medRpe}`,
      body: `${easier} of your last ${rated.length} came in below what this day asks for. This is the quieter failure of the two and the more common: the dose moves week by week and it is easy to keep running the one you learned in week one. Check what the day is actually prescribing now — and if it is right and still feels like a ${medRpe}, the block has more room in it than you are using.`,
      action: { label: 'See this week', href: '/train' },
    });
  }
  return worst(out);
}

// ── Progression ───────────────────────────────────────────────────────────

/** One week the program said would ask more than the week before it. */
interface Step {
  week: number;
  typeId: string;
  typeName: string;
  says: string;
}

/**
 * Every authored weekly step, placed on the program week it falls on.
 *
 * `WeekStep.week` is the week *within its phase*, which is what makes a step
 * survive `adapt.ts` moving the phase.
 */
export function authoredSteps(program: Program): Step[] {
  const out: Step[] = [];
  for (const phase of program.phases) {
    for (const type of program.sessionTypes) {
      for (const block of type.blocks ?? []) {
        for (const step of block.perPhase[phase.id]?.perWeek ?? []) {
          out.push({
            week: phase.weekStart + step.week - 1,
            typeId: type.id,
            typeName: type.name,
            says: step.step,
          });
        }
      }
    }
  }
  return out.sort((a, b) => a.week - b.week);
}

/** The last reading of each exercise logged across these days. */
function readings(days: Logged[]): Map<string, { name: string; entry: Record<string, number | undefined> }> {
  const out = new Map<string, { name: string; entry: Record<string, number | undefined> }>();
  for (const day of days) {
    for (const entry of day.session.exercises ?? []) {
      if (!hasNumbers(entry)) continue;
      out.set(exerciseKey(entry.name), {
        name: entry.name,
        entry: { sets: entry.sets, reps: entry.reps, hold: entry.hold, load: entry.load },
      });
    }
  }
  return out;
}

function progression(input: PlanVsLogInput, days: Logged[]): Finding | null {
  const steps = authoredSteps(input.program);
  if (steps.length === 0) return null;

  const flat: { step: Step; names: string[] }[] = [];
  for (const step of steps) {
    if (step.week < 2) continue;
    const here = readings(days.filter((d) => d.week === step.week && d.type.id === step.typeId));
    const before = readings(days.filter((d) => d.week === step.week - 1 && d.type.id === step.typeId));
    const names: string[] = [];
    let compared = 0;
    for (const [key, now] of here) {
      const then = before.get(key);
      if (!then) continue;
      // Only the dimensions written down both weeks. Logging sets one week
      // and load the next is two things measured — not a change, and
      // equally not a flat reading, which is the half a first draft got
      // wrong: with nothing in common it found nothing moved and called
      // the step ignored. The rule `exerciseMovement` set, both ways round.
      const shared = DIMENSIONS.filter(
        (d) => now.entry[d] !== undefined && then.entry[d] !== undefined,
      );
      if (shared.length === 0) continue;
      compared += 1;
      if (shared.every((d) => now.entry[d] === then.entry[d])) names.push(now.name);
    }
    if (compared > 0 && names.length === compared) flat.push({ step, names });
  }
  if (flat.length < FLAT_STEPS) return null;

  const last = flat[flat.length - 1]!;
  const named = joinList([...new Set(last.names)].slice(0, 3));
  return {
    kind: 'progression',
    id: `plan-vs-log:progression:${last.step.typeId}`,
    signature: `${flat.length}`,
    subject: last.step.typeName,
    asked: last.step.says,
    did: 'the same numbers as the week before',
    sample: flat.length,
    tone: 'neutral',
    weight: 56,
    headline: `${flat.length} weeks asked for a step up and got the same numbers`,
    body: `Week ${last.step.week} of ${last.step.typeName} says: "${last.step.says}" — and ${named} went in at last week's figures. The program cannot know what your top set felt like, which is why these weeks are written as a line rather than a number; the decision is yours and this is only the record of it. If the numbers are right, the block is not asking enough. If they are not, the step is the week to take it.`,
    action: { label: 'See this week', href: '/train' },
  };
}

// ── Deloads ───────────────────────────────────────────────────────────────

/** The Sunday a program week opens on, counting from the block's own start. */
function weekStart(from: string, week: number): string {
  return addDays(from, (week - 1) * 7);
}

function deloads(input: PlanVsLogInput, from: string, through: string): Finding | null {
  const weeks = input.program.deloadWeeks ?? [];
  if (weeks.length === 0) return null;

  const load = new Map<number, number>();
  /**
   * Weeks holding training that was never scored (PLAN.md M162).
   *
   * This finding is a ratio of one week's load to the weeks before it, so an
   * unscored session in *either* half moves it: in the deload week it reads
   * lighter than it was and the finding goes quiet, and in the baseline it
   * reads lighter and the deload looks heavy by comparison. Neither is worth
   * a sentence this confident, so a week with a hole in it is skipped.
   */
  const holes = new Set<number>();
  for (const session of input.sessions) {
    if (!session.completed || session.date < from || session.date > through) continue;
    const week = programWeek(input.startDate, session.date, input.program.weeks);
    if (week === null) continue;
    if (isRestSession(session)) continue;
    const measured = sessionLoad(session);
    if (measured === null) {
      holes.add(week);
      continue;
    }
    load.set(week, (load.get(week) ?? 0) + measured);
  }

  let found: { week: number; ratio: number; baseline: number; here: number } | null = null;
  for (const week of weeks) {
    // Only a week that has finished. Half a deload measured against three
    // whole weeks reads light for the reason the arithmetic says it does.
    if (addDays(weekStart(from, week), 6) > through) continue;
    if (holes.has(week)) continue;
    const here = load.get(week) ?? 0;
    if (here <= 0) continue;
    const before: number[] = [];
    for (let w = week - 1; w >= 1 && before.length < 3; w -= 1) {
      if (weeks.includes(w) || holes.has(w)) continue;
      const earlier = load.get(w) ?? 0;
      if (earlier > 0) before.push(earlier);
    }
    if (before.length < 2) continue;
    const baseline = before.reduce((n, l) => n + l, 0) / before.length;
    const ratio = here / baseline;
    if (ratio < DELOAD_RATIO) continue;
    if (found === null || ratio > found.ratio) found = { week, ratio, baseline, here };
  }
  if (found === null) return null;

  const shown = found.ratio.toFixed(2);
  return {
    kind: 'deload',
    id: 'plan-vs-log:deload',
    signature: `${found.week}:${shown}`,
    subject: `Week ${found.week}`,
    asked: 'a lighter week',
    did: `${shown}× the weeks before it`,
    sample: found.week,
    tone: 'caution',
    weight: 72,
    headline: `Week ${found.week} was a deload and the load did not drop`,
    body: `You trained ${shown}× the weeks before it. The app takes a set off the prescription for a deload week and stamps the session, and everywhere else it sees that stamp it stops warning you about the dip — this is the one place that checks there was a dip. Training through a deload does not bank the work: adaptation lands in the week the load comes off, and a block that never lets it land is three hard weeks repeated. The only thing that makes it a deload is doing less.`,
    action: { label: 'See the load', href: '/progress' },
  };
}

// ── Spacing ───────────────────────────────────────────────────────────────

/** Hours between two dates, which for a log without clock times is days. */
function hoursBetween(a: string, b: string): number {
  return Math.abs(daysBetween(a, b)) * 24;
}

function spacing(input: PlanVsLogInput, days: Logged[]): Finding | null {
  const out: Finding[] = [];
  const nameOf = (id: string) => input.program.sessionTypes.find((t) => t.id === id)?.name ?? id;
  const datesOf = (ids: readonly string[]) => {
    const wanted = new Set(ids);
    return days.filter((d) => wanted.has(d.type.id)).map((d) => d.session.date);
  };

  for (const c of input.program.constraints) {
    if (c.kind === 'min-gap-hours') {
      const dates = datesOf(c.between);
      let breaches = 0;
      let tightest = c.hours;
      for (let i = 1; i < dates.length; i += 1) {
        const gap = hoursBetween(dates[i - 1]!, dates[i]!);
        if (gap >= c.hours) continue;
        breaches += 1;
        tightest = Math.min(tightest, gap);
      }
      if (breaches < SPACING_BREACHES) continue;
      const subject = joinList(c.between.map(nameOf));
      out.push({
        kind: 'spacing',
        id: `plan-vs-log:spacing:${c.between.join('+')}`,
        signature: `${breaches}`,
        subject,
        asked: `${c.hours}h apart`,
        did: `${tightest}h, ${breaches} times`,
        sample: dates.length,
        tone: 'caution',
        weight: 78,
        headline: `${breaches} times under the ${c.hours}-hour gap on ${subject}`,
        body: `${c.note} Your week layout is checked against this before you commit to it — the dates are not, and the dates are what happened. Moving a session is how a plan survives a real week, and this is what it costs when the move lands next to the thing the rule was there to protect.`,
        action: { label: 'Plan the week', href: '/calendar' },
      });
      continue;
    }
    if (c.kind !== 'not-day-before') continue;
    const first = new Set(datesOf([c.sessionTypeId]));
    const after = new Set(datesOf([c.before]));
    let breaches = 0;
    for (const date of first) {
      if (after.has(addDays(date, 1))) breaches += 1;
    }
    if (breaches < SPACING_BREACHES) continue;
    const subject = `${nameOf(c.sessionTypeId)} before ${nameOf(c.before)}`;
    out.push({
      kind: 'spacing',
      id: `plan-vs-log:spacing:${c.sessionTypeId}>${c.before}`,
      signature: `${breaches}`,
      subject,
      asked: 'never the day before',
      did: `${breaches} times`,
      sample: first.size,
      tone: 'caution',
      weight: 76,
      headline: `${breaches} times ${nameOf(c.sessionTypeId)} landed the day before ${nameOf(c.before)}`,
      body: `${c.note} The layout you planned respects this; the dates you logged did not. This is the ordering rule most often lost to a rescheduled week, because moving one session forward a day moves it onto the one it was meant to stay clear of.`,
      action: { label: 'Plan the week', href: '/calendar' },
    });
  }
  return worst(out);
}

// ── Menus ─────────────────────────────────────────────────────────────────

function menus(input: PlanVsLogInput, days: Logged[]): Finding | null {
  const out: Finding[] = [];
  const tracked = (exercises: readonly Exercise[]) =>
    input.trackId ? exercises.filter((e) => !e.track || e.track === input.trackId) : exercises;

  for (const [, group] of byType(days)) {
    const type = group[0]!.type;
    for (const block of type.blocks ?? []) {
      for (const phase of input.program.phases) {
        const entry = block.perPhase[phase.id];
        const rule = entry?.selection;
        if (!entry || !rule) continue;
        const menu = tracked(entry.exercises);
        if (menu.length <= rule.pick) continue;
        const keys = new Set(menu.map((e) => exerciseKey(e.name)));

        const inPhase = group.filter((d) => d.week >= phase.weekStart && d.week <= phase.weekEnd);
        const chosen = new Set<string>();
        let sessions = 0;
        for (const day of inPhase) {
          const ticked = (day.session.exercises ?? [])
            .map((e) => exerciseKey(e.name))
            .filter((k) => keys.has(k));
          if (ticked.length === 0) continue;
          sessions += 1;
          for (const key of ticked) chosen.add(key);
        }
        if (sessions < MIN_SESSIONS || chosen.size > rule.pick) continue;

        const note = rule.note ? ` ${rule.note}` : '';
        const thin = chosen.size < rule.pick;
        out.push({
          kind: 'menu',
          id: `plan-vs-log:menu:${type.id}:${block.id}:${phase.id}`,
          signature: `${chosen.size}/${sessions}`,
          subject: block.name,
          asked: `pick ${rule.pick} of ${menu.length}`,
          did: `the same ${chosen.size} across ${sessions} sessions`,
          sample: sessions,
          tone: 'neutral',
          weight: 44,
          headline: thin
            ? `${block.name} asks for ${rule.pick} and you are logging ${chosen.size}`
            : `The same ${chosen.size} of ${menu.length} on ${block.name}, ${sessions} sessions running`,
          body: thin
            ? `Across ${sessions} sessions in ${phase.name} you have logged ${chosen.size} of the ${rule.pick} this block asks for, and always the same ${chosen.size}.${note} A short menu is a lighter session than the one the phase was built around, and the lines that keep getting dropped are usually the ones that were least fun and most needed.`
            : `${menu.length} options, ${rule.pick} to choose, and the same ${chosen.size} every time across ${sessions} sessions in ${phase.name}.${note} The menu is a menu because the choosing is part of the dose — the other ${menu.length - chosen.size} are there because no ${rule.pick} of them cover what the block is for. Swapping one line next session costs nothing and is the cheapest new stimulus in the program.`,
          action: { label: 'See this week', href: '/train' },
        });
      }
    }
  }
  return worst(out);
}

// ── The whole reading ─────────────────────────────────────────────────────

/**
 * One subject per join: the worst of them.
 *
 * "You are behind on four things" is an indictment and nobody acts on an
 * indictment — the rule `missingDomains` and `skippedType` both follow.
 */
function worst(findings: Finding[]): Finding | null {
  return [...findings].sort((a, b) => b.weight - a.weight || b.sample - a.sample)[0] ?? null;
}

/**
 * Every divergence worth a sentence, heaviest first.
 *
 * Null-free and order-stable: a caller showing one shows the same one until
 * the facts move, which is what makes a dismissal mean anything.
 */
export function planVsLog(input: PlanVsLogInput): Finding[] {
  const { from, to } = blockWindow(input.program, input.startDate);
  // No guard for `through < from` — a block that has not started yet has
  // every session filtered out by the same window, and every join comes
  // back empty on its own. An explicit check here survived every mutation,
  // which is how it was found to be saying nothing.
  const through = input.today < to ? input.today : to;
  const days = loggedDays(input, from, through);

  return [
    spacing(input, days),
    deloads(input, from, through),
    efforts(days),
    progression(input, days),
    lengths(input, days),
    menus(input, days),
  ]
    .filter((f): f is Finding => f !== null)
    .sort((a, b) => b.weight - a.weight);
}
