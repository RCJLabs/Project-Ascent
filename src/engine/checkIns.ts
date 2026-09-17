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
  readCheckIn,
  readinessFor,
  type CheckIn,
  type FingerFeel,
  type ReadinessCall,
  type SleepFeel,
} from './readiness';
import { isRestSession } from './rest';

/** Ninety days, to match "Where the ratio has been" on the same page. */
export const CHECKIN_DAYS = 90;

/**
 * How many days on each side before an average is worth printing.
 *
 * The effort comparison divides the window in two and reports a mean from
 * each half, and a mean of two numbers is a pair of numbers with a line
 * through it. Four is still thin — the copy says so when it is — but below
 * four the sentence would swing on a single hard session.
 */
export const ENOUGH_TO_COMPARE = 4;

/**
 * The widest one session can be wrong by (PLAN.md M245).
 *
 * RPE is "an absolute self-rating on a fixed 1-10 scale" — `effort.ts` says
 * so, and its tiers floor at 1 — so the furthest a single logged session can
 * be from where it should have been is nine points, and the furthest it can
 * drag a mean of `n` is `9 / n`.
 */
export const RPE_SWING = 9;

/**
 * How much one session is worth, against a gap between two means.
 *
 * The card used to append *"which is few enough that one hard session moves
 * it"* to **every** difference it printed, on no arithmetic at all. Measured
 * on ten flagged days against twenty clear ones with a three-point gap,
 * closing it would need a single session to move a mean of ten by 3.0 — an
 * RPE thirty points out, on a scale nine points wide. The app was telling a
 * climber to discount the one finding on the card that could not be a fluke.
 *
 * So the number is computed instead of asserted, and it is the same number
 * either way round: one session moves a mean of `n` by at most `9 / n`, and
 * it moves the **smaller** group's mean furthest, which is the side that
 * decides. Stated rather than ruled on — at four days a side it comes out
 * 2.3, which is a thin comparison however large the gap; at twenty it is
 * 0.5, which is a finding.
 */
export function oneSessionIsWorth(flaggedDays: number, clearDays: number): number {
  return RPE_SWING / Math.min(flaggedDays, clearDays);
}

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
  /**
   * Answered days whose answers this version cannot read (PLAN.md M244).
   *
   * Left out of `days` and out of the counts rather than repaired in
   * silence, which is the rule the journal already follows for a project of
   * the wrong shape: tell the climber the list is short.
   */
  unreadable: number;
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
  let unreadable = 0;
  for (const session of inWindow) {
    if (session.checkIn === undefined) continue;
    // A day whose answers are not in the vocabulary is a day this version
    // cannot read, not a day that went badly (PLAN.md M244). Counting it
    // made `fingers[feel] += 1` into `NaN` and grew a column for a word the
    // record has never had.
    const checkIn = readCheckIn(session.checkIn);
    if (checkIn === null) {
      unreadable += 1;
      continue;
    }
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
    unreadable,
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
    if (Math.abs(gap) < 0.5) {
      parts.push(
        `Effort came out about the same either way — ${flagged.toFixed(1)} on the ${flaggedDays} days something was flagged, ${clear.toFixed(1)} on the ${clearDays} that were clear.`,
      );
    } else {
      // The direction, said (PLAN.md M245). "RPE 9.0 against 6.0" and
      // "6.6 against 8.0" are opposite answers to the question this card
      // exists to ask, and they used to be handed over in the same sentence
      // for the reader to sort out. Which way the numbers went is stated;
      // *why* they went that way is not, because nothing here can know —
      // `effortSplit` says so and the note under the list says so again.
      const worth = oneSessionIsWorth(flaggedDays, clearDays);
      const caveat =
        worth >= Math.abs(gap)
          ? ' Few enough days on one side that a single session could close that gap.'
          : ` One session either side moves that by at most ${worth.toFixed(1)}.`;
      parts.push(
        `Sessions after a flagged answer came out ${Math.abs(gap).toFixed(1)} ${gap > 0 ? 'harder' : 'easier'} than the clear ones — RPE ${flagged.toFixed(1)} against ${clear.toFixed(1)}, over ${flaggedDays} days and ${clearDays}.${caveat}`,
      );
    }
  }

  return parts.join(' ');
}
