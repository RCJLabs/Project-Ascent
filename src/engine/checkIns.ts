/**
 * The check-in, read back as a history (PLAN.md M82).
 *
 * M72 stores a `checkIn` on every session it was answered for, and until
 * now the only thing that ever read one back was the same day's log page.
 * The answers were a prompt, not a record: you could tell the app your
 * fingers were sore forty times and it would never once mention it.
 *
 * **Why this is not marks on the load-trend line**, which is what M82
 * proposed. `LoadTrendLine` gives 288 units to 90 days — 3.2 units a day,
 * measured from its own constants — and the proposal wants two categorical
 * dimensions on that axis. The consistency grid is worse: 4.5px cells, and
 * its doc comment already explains that it is a picture rather than a
 * control because targets that size fail WCAG 2.5.8. Marks a climber cannot
 * separate are not a series. So the strip here is drawn over the same window
 * but carries a mark only for a day that was *answered* — a dozen or so
 * marks rather than ninety slots — which is a density that reads.
 *
 * **Coverage is stated before anything else.** The card asks and does not
 * insist, so most sessions have no check-in, and "you stayed under the
 * ceiling every time" over three sessions is a sentence that means nothing.
 * Every number here is reported against how many sessions it could have
 * come from.
 *
 * **The cap is reconstructed, not stored.** `readinessFor(checkIn).cap`
 * depends on the two answers alone — `context` moves the advice and the test
 * deferral, never the ceiling — so reading it back from a stored check-in
 * gives the number the climber was actually shown, not a fresh guess.
 */

import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  readinessFor,
  type CheckIn,
  type FingerFeel,
  type ReadinessCall,
  type SleepFeel,
} from './readiness';
import { isRestSession } from './templates';

/** Ninety days, to match "Where the ratio has been" on the same page. */
export const CHECKIN_DAYS = 90;

/**
 * How many days on each side before an average is worth printing.
 *
 * The effort comparison divides the window in two and reports a mean from
 * each half, and a mean of two numbers is a pair of numbers with a line
 * through it. Four is still thin — the copy says so — but below four the
 * sentence would swing on a single hard session.
 */
export const ENOUGH_TO_COMPARE = 4;

export interface CheckInDay {
  date: string;
  sessionId: string;
  checkIn: CheckIn;
  call: ReadinessCall;
  /** The RPE ceiling the climber was shown, or null when there was none. */
  cap: number | null;
  /** What they logged, or null when they logged none. */
  rpe: number | null;
  /** How far over the ceiling they went. Null when there is no pair. */
  over: number | null;
}

export interface EffortSplit {
  /** Mean RPE on the days something was flagged, and on the days nothing was. */
  flagged: number;
  clear: number;
  flaggedDays: number;
  clearDays: number;
}

export interface CheckInHistory {
  from: string;
  to: string;
  /** Completed, non-rest sessions in the window: the ones that were asked. */
  asked: number;
  /** Of those, the ones that answered. */
  answered: number;
  /** The answered days, oldest first. */
  days: CheckInDay[];
  fingers: Record<FingerFeel, number>;
  sleep: Record<SleepFeel, number>;
  /** Answered days that produced a ceiling *and* logged an RPE. */
  capped: number;
  /** Of those, the ones that went over it. */
  overCap: number;
  /** Null until there are enough days on both sides to mean anything. */
  effort: EffortSplit | null;
}

export interface CheckInInput {
  sessions: readonly Session[];
  /** The last day of the window. */
  to: string;
  days?: number;
}

/** Whether an answer is one the engine acts on, rather than "fine". */
export function isFlagged(checkIn: CheckIn): boolean {
  return checkIn.fingers !== 'good' || checkIn.sleep !== 'good';
}

export function checkInHistory(input: CheckInInput): CheckInHistory {
  const days = input.days ?? CHECKIN_DAYS;
  const from = addDays(input.to, -(days - 1));

  // Only completed sessions count as "asked": an abandoned draft was never
  // a session, and counting it would report the climber as ignoring a
  // question that was never finished being put to them.
  const inWindow = input.sessions.filter(
    (s) => s.completed && s.date >= from && s.date <= input.to && !isRestSession(s),
  );

  const answered: CheckInDay[] = [];
  for (const session of inWindow) {
    const checkIn = session.checkIn;
    if (checkIn === undefined) continue;
    const { call, cap } = readinessFor(checkIn);
    const rpe = session.rpe ?? null;
    answered.push({
      date: session.date,
      sessionId: session.id,
      checkIn,
      call,
      cap,
      rpe,
      over: cap !== null && rpe !== null ? Math.max(0, rpe - cap) : null,
    });
  }
  answered.sort((a, b) => (a.date === b.date ? a.sessionId.localeCompare(b.sessionId) : a.date < b.date ? -1 : 1));

  const fingers: Record<FingerFeel, number> = { good: 0, tender: 0, sore: 0 };
  const sleep: Record<SleepFeel, number> = { good: 0, short: 0, none: 0 };
  for (const day of answered) {
    fingers[day.checkIn.fingers] += 1;
    sleep[day.checkIn.sleep] += 1;
  }

  const withPair = answered.filter((d) => d.over !== null);

  return {
    from,
    to: input.to,
    asked: inWindow.length,
    answered: answered.length,
    days: answered,
    fingers,
    sleep,
    capped: withPair.length,
    overCap: withPair.filter((d) => d.over! > 0).length,
    effort: effortSplit(answered),
  };
}

/**
 * What the flagged days actually felt like, against the clear ones.
 *
 * RPE rather than load, and deliberately: `readiness.ts` nominates
 * perceived effort as the instrument precisely because "the same hang that
 * was a 6 last week is an 8 today". Load would mostly restate the duration.
 *
 * This is a count of what was logged, not a claim about why. A climber who
 * reports a bad night and then trains harder to prove a point will show up
 * here the same as one whose session genuinely cost more.
 */
function effortSplit(days: readonly CheckInDay[]): EffortSplit | null {
  const rated = days.filter((d) => d.rpe !== null);
  const flagged = rated.filter((d) => isFlagged(d.checkIn));
  const clear = rated.filter((d) => !isFlagged(d.checkIn));
  if (flagged.length < ENOUGH_TO_COMPARE || clear.length < ENOUGH_TO_COMPARE) return null;
  const mean = (rows: CheckInDay[]) => rows.reduce((n, d) => n + d.rpe!, 0) / rows.length;
  return {
    flagged: mean(flagged),
    clear: mean(clear),
    flaggedDays: flagged.length,
    clearDays: clear.length,
  };
}

/**
 * Sessions, counted, with the verb and the possessive that agree with it.
 *
 * The M80 helper, needed again: three of the headlines below take a count
 * and every one of them was a place to write "1 sessions".
 */
function sessions(n: number): string {
  return `${n} session${n === 1 ? '' : 's'}`;
}

/**
 * What the answers say, or why they cannot say it yet.
 *
 * Coverage leads every sentence that follows it. A rate over four answers
 * is not a rate, and the difference between "you went over twice" and "you
 * went over twice out of three" is the whole reading.
 */
export function describeCheckIns(history: CheckInHistory): string {
  if (history.asked === 0) {
    return 'No sessions logged in the last three months, so there was nothing to check in for.';
  }
  if (history.answered === 0) {
    return `Nothing answered yet. The check-in sits at the top of a session, asks two questions, and adjusts the day around the answers — ${sessions(history.asked)} went by without one.`;
  }

  const parts = [
    `Answered on ${history.answered} of ${sessions(history.asked)} in the last three months.`,
  ];

  const tender = history.fingers.tender + history.fingers.sore;
  if (history.fingers.sore > 0) {
    parts.push(
      `Fingers came back sore on ${sessions(history.fingers.sore)} of the ${history.answered}${tender > history.fingers.sore ? `, tender on ${history.fingers.tender} more` : ''}.`,
    );
  } else if (tender > 0) {
    parts.push(`Fingers came back tender on ${sessions(tender)} of the ${history.answered}.`);
  }

  const rough = history.sleep.short + history.sleep.none;
  if (rough > 0) {
    parts.push(
      `You trained on a short night ${rough === 1 ? 'once' : `${rough} times`}${history.sleep.none > 0 ? `, ${history.sleep.none} of those on barely any sleep` : ''}.`,
    );
  }

  if (history.capped === 0) {
    parts.push(
      'No session yet has both a suggested ceiling and a logged RPE, so there is nothing to say about whether the ceiling held.',
    );
  } else if (history.overCap === 0) {
    parts.push(
      `The check-in suggested an RPE ceiling on ${sessions(history.capped)} with an effort logged, and you stayed under it every time.`,
    );
  } else {
    parts.push(
      `The check-in suggested an RPE ceiling on ${sessions(history.capped)} with an effort logged, and ${history.overCap} of those went over it.`,
    );
  }

  if (history.effort !== null) {
    const { flagged, clear, flaggedDays, clearDays } = history.effort;
    const gap = flagged - clear;
    parts.push(
      Math.abs(gap) < 0.5
        ? `Effort came out about the same either way — ${flagged.toFixed(1)} on the ${flaggedDays} days something was flagged, ${clear.toFixed(1)} on the ${clearDays} that were clear.`
        : `Sessions after a flagged answer were logged at RPE ${flagged.toFixed(1)} on average against ${clear.toFixed(1)} on the clear days — ${flaggedDays} against ${clearDays}, which is few enough that one hard session moves it.`,
    );
  }

  return parts.join(' ');
}
