/**
 * A block that notices it was interrupted (PLAN.md M149).
 *
 * `prescriptionFor` takes a session type, a phase, a track, a week number
 * and a deload flag. It takes **no history**. Miss a fortnight and week
 * seven prescribes week seven, at week seven's load, off a base the climber
 * no longer has — and nothing between a single day's readiness cap and a
 * full restart had anything to say about it.
 *
 * ## The whole thing is one number
 *
 * Every week in this app is derived: `programWeek(startDate, date, weeks)`.
 * Nothing stores which week it is, so **moving the start date moves the
 * block** — the calendar, the prescription, adherence and the block window
 * all follow with nothing else touched.
 *
 * That collapses what looked like two different answers into one. *Resume
 * where you left off* and *drop back and re-enter lighter* are the same
 * operation with a different number of weeks: shift by the gap and today is
 * the week you were going to do next; shift by more and today is an earlier
 * week, at an earlier week's load. Neither rewrites a dose, so the
 * catalogue's prose stays true and the climber can still read ahead — which
 * is the constraint `adapt.ts` recorded when it said a phase describing
 * *"the next four weeks"* still says it after a remap.
 *
 * ## A shift cannot close the gap, and must not try
 *
 * The first build had this wrong and the screen test found it. A shift is a
 * **translation**: moving the start date by `S` weeks takes today's week and
 * the last trained week down by `S` each, so `nowWeek - lastTrainedWeek` is
 * exactly what it was. The gap is a difference, and no translation closes a
 * difference — so a card that fires on that difference fires again the
 * moment it has been dealt with, and offers to shift again, forever.
 *
 * What a shift actually does is re-point the **prescription**: today asks
 * for week seven instead of week nine. The missed fortnight stays in the
 * history, where it belongs and where `adherence.ts` already reports it. So
 * the question is one the climber answers once, and `resumedAt` records that
 * they did. It clears itself: train again and the gap genuinely closes, go
 * away again and it reopens against the new one.
 *
 * ## Proposed, never applied
 *
 * Nothing here moves anything. It works out what the honest choices are and
 * what each would mean; the climber picks. A block that rewrites itself
 * while you are not looking is a block you cannot trust to be the thing you
 * read last week.
 *
 * ## Why it asks
 *
 * The app knows exactly how long the gap was and where in the block it fell.
 * It does not know why, and the three reasons do not want the same answer: a
 * climber back from a fortnight's holiday has lost very little, one coming
 * off an illness has lost more than they think, and one whose fingers are
 * only now quiet should not re-enter at the week that hurt them. So it asks,
 * once, and the answer changes which choice leads.
 */

import { phaseForWeek, type Program } from '@/content/types';
import type { Session } from '@/db/sessions';
import { addDays, daysBetween, programWeek } from './dates';
import { blockStatus, blockWindow } from './plan';
import { isRestSession } from './rest';

/** Why the climber was away. The app cannot derive this and does not try. */
export type AwayReason = 'away' | 'ill' | 'hurt';

/**
 * A whole program week with nothing in it, before the block has anything to
 * say. Less than that is a week off, which is a rest week and already what
 * a deload is for.
 */
export const MIN_MISSED_WEEKS = 1;

export interface ResumeOption {
  /** `resume` picks up where the log stopped; `rewind` re-enters earlier. */
  kind: 'resume' | 'rewind';
  /** The program week this would put today on. */
  week: number;
  /** Weeks to push the start date back by to get there. */
  shiftWeeks: number;
  headline: string;
  body: string;
}

export interface Interruption {
  /** Days since the last training day logged inside this block. */
  away: number;
  /** The week the block currently thinks it is, having counted the gap. */
  nowWeek: number;
  /** The last week of the block that carries a completed session. */
  lastTrainedWeek: number;
  /** Whole weeks of the block that passed with nothing logged. */
  missedWeeks: number;
  /** Best first. The reason decides which that is. */
  options: ResumeOption[];
}

export interface ResumeInput {
  program: Program;
  startDate: string;
  sessions: readonly Session[];
  today: string;
  /** Absent until the climber has answered, which is the common case. */
  reason?: AwayReason | undefined;
  /**
   * When this block was last picked up, if it has been.
   *
   * A shift cannot close the gap — see the header — so this is what stops
   * the card asking a question the climber has already answered. Training
   * again clears it, because the gap is then genuinely behind them.
   */
  resumedAt?: string | undefined;
}

function weeksWord(n: number): string {
  return n === 1 ? 'a week' : `${n} weeks`;
}

/**
 * What the block would look like resumed, and what it would look like
 * re-entered a phase earlier.
 *
 * The rewind is the current phase's opening week, not a fixed number of
 * weeks back: a phase is the unit the catalogue writes progressions in, so
 * re-entering at one starts a coherent stretch rather than landing in the
 * middle of a ramp with no run-up.
 */
function optionsFor(
  program: Program,
  nowWeek: number,
  lastTrainedWeek: number,
  reason: AwayReason | undefined,
): ResumeOption[] {
  // No clamp against `program.weeks`, because one cannot fire: an
  // interruption needs a whole empty week, so `lastTrainedWeek <= nowWeek - 2`,
  // and `programWeek` clamps `nowWeek` at the block's length. The next week is
  // therefore at most `program.weeks - 1`. A `Math.min` sat here and survived
  // every mutation, which is how it was found to be saying nothing.
  const next = lastTrainedWeek + 1;
  const out: ResumeOption[] = [];

  if (nowWeek > next) {
    out.push({
      kind: 'resume',
      week: next,
      shiftWeeks: nowWeek - next,
      headline: `Pick up at week ${next}`,
      body: `The block holds its shape and its dates move with you — week ${next} happens now, and everything after it keeps the order it was written in. You lose nothing except the calendar.`,
    });
  }

  const phase = phaseForWeek(program, lastTrainedWeek);
  const opening = phase?.weekStart ?? 1;
  // Only `nowWeek > opening` is a real condition. A phase opening is always
  // at or before the week it contains, so `opening < next` is true by
  // construction — it was written here as a guard and says nothing.
  //
  // Which means a climber who stopped *on* a phase opening is offered a
  // rewind to the week they just did, and that is the right offer: after a
  // fortnight away, running the opening week again is what re-entering at
  // the start of a phase means.
  if (nowWeek > opening) {
    out.push({
      kind: 'rewind',
      week: opening,
      shiftWeeks: nowWeek - opening,
      headline: `Go back to week ${opening}, the start of ${phase?.name ?? 'this phase'}`,
      body: `Re-entering at the opening of the phase gives you a run-up instead of dropping you into the middle of a ramp. It costs ${weeksWord(next - opening)} you have already done, and a phase is the unit these progressions are written in.`,
    });
  }

  // A hurt climber should not re-enter at the week that hurt them, and one
  // back from a fortnight away has lost very little. The options are the
  // same either way; which one leads is what the answer changes.
  if (reason === 'hurt' || reason === 'ill') {
    out.sort((a, b) => (a.kind === 'rewind' ? -1 : 0) - (b.kind === 'rewind' ? -1 : 0));
  }
  return out;
}

/**
 * Whether this block has been interrupted, and what could be done about it.
 *
 * Null for everything ordinary: a block not running, a block that has ended,
 * a gap shorter than a whole week, and — the one worth naming — a block with
 * nothing logged in it at all. Somebody who started a program and has not
 * begun has not been interrupted; they have not started.
 */
export function interruption(input: ResumeInput): Interruption | null {
  const { program, startDate, today } = input;
  if (blockStatus(program, startDate, today).state !== 'running') return null;

  const { from, to } = blockWindow(program, startDate);
  const last = input.sessions
    .filter((s) => s.completed && !isRestSession(s) && s.date >= from && s.date <= to && s.date <= today)
    .map((s) => s.date)
    .sort()
    .at(-1);
  if (last === undefined) return null;

  const nowWeek = programWeek(startDate, today, program.weeks);
  const lastTrainedWeek = programWeek(startDate, last, program.weeks);
  if (nowWeek === null || lastTrainedWeek === null) return null;

  // Whole weeks with nothing in them: the week the last session fell in is
  // not missed, and neither is the one in progress.
  const missedWeeks = nowWeek - lastTrainedWeek - 1;
  if (missedWeeks < MIN_MISSED_WEEKS) return null;

  // Already answered, and nothing has been trained since. Asking again would
  // offer to shift a block that has just been shifted.
  if (input.resumedAt !== undefined && last <= input.resumedAt) return null;

  const options = optionsFor(program, nowWeek, lastTrainedWeek, input.reason);
  if (options.length === 0) return null;

  return {
    away: daysBetween(last, today),
    nowWeek,
    lastTrainedWeek,
    missedWeeks,
    options,
  };
}

/** The start date a chosen option would move the block to. */
export function shiftedStart(startDate: string, option: ResumeOption): string {
  return addDays(startDate, option.shiftWeeks * 7);
}

/** What the gap itself says, before any choice is made. */
export function describeInterruption(found: Interruption, reason?: AwayReason): string {
  const missed = weeksWord(found.missedWeeks);
  const because =
    reason === 'hurt'
      ? ' Coming back from something that hurt, the week you stopped on is the last one to re-enter at.'
      : reason === 'ill'
        ? ' Illness costs more than it feels like it did, and the first sessions back always read worse than the fitness actually is.'
        : reason === 'away'
          ? ' A fortnight off costs very little that a week of normal training will not give back.'
          : '';
  return `Nothing is logged for ${missed} of this block, so it has moved on without you: today is week ${found.nowWeek}, and the last week you trained was ${found.lastTrainedWeek}.${because}`;
}
