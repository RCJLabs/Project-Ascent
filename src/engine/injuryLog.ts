/**
 * How an injury has actually been (PLAN.md M103).
 *
 * `Injury` records where a part stands *now* — part, since, severity,
 * status, a checklist — and is overwritten every time it is edited. Nothing
 * anywhere held how it got there. So the question every physio asks first,
 * *how has it been?*, had no answer in an app holding both the injury and
 * every session around it.
 *
 * M72's check-in asks about the fingers and the sleep. Since M103 it also
 * asks about each open injury, and this reads those answers back.
 *
 * ## What it refuses to compute
 *
 * The milestone proposed a co-occurrence: *"worse on 4 of the 5 days after a
 * session that loaded the elbow; 1 of 9 otherwise"*. That is refused, for
 * the same reason M101 refused tissue gaps in the finder and one more.
 *
 * **"Loaded the elbow" is a keyword scan.** `tissueLoad` says so at length
 * about itself — tolerable for a relative picture, "not tolerable for a
 * number with a unit". A ratio built on it is a number with a unit.
 *
 * **And two counts side by side are a causal claim however they are
 * worded.** A climber reading "4 of 5 against 1 of 9" reads *hangboarding
 * hurts my elbow*, on a sample of fourteen, from a scan that guesses which
 * sessions loaded what. The app would be doing epidemiology on a fortnight.
 *
 * So this reports what was answered and shows what was done around it, and
 * the climber draws the line. That is the journal's stance — show the
 * entries rather than summarise them — and `checkIns`' rule that coverage
 * is stated before any number that rests on it.
 *
 * Pure: sessions and one injury in, a reading out.
 */

import type { Session } from '@/db/sessions';
import type { BodyPart } from '@/content/bodyParts';
import type { Injury } from '@/store/profile';
import type { TissueFeel } from './readiness';
import { addDays, daysBetween } from './dates';
import { isRestSession } from './rest';

/**
 * One day the climber said how the part felt.
 *
 * Nothing here about what was done that day. The strip reads one tone per
 * date, and what was around a day is only worth naming on the days it was
 * worse, where `badDays` carries it — so a `did` on every day was work done
 * for nobody, and is gone.
 */
export interface InjuryDay {
  date: string;
  feel: TissueFeel;
}

export interface InjuryHistory {
  part: BodyPart;
  from: string;
  to: string;
  /** Days answered, oldest first. */
  days: InjuryDay[];
  /** Days elapsed since the injury was logged, so coverage can be honest. */
  elapsed: number;
  worse: number;
  tender: number;
  fine: number;
}

/**
 * What a session says it was, without guessing from its content.
 *
 * `isRestSession` rather than a fourteenth copy of its one line — the same
 * predicate is written out inline in ten other engine modules, which is a
 * finding for its own milestone and not this one's to fix.
 */
function describeSession(session: Session, nameOf: (id: string) => string | undefined): string {
  const named = session.sessionTypeId === undefined ? undefined : nameOf(session.sessionTypeId);
  if (named !== undefined) return named;
  if (isRestSession(session)) return 'Rest day';
  return session.mode === 'outdoor' ? 'Outdoor day' : 'Climbing session';
}

export interface InjuryHistoryInput {
  part: BodyPart;
  /** The day the injury was logged, which bounds the window. */
  since: string;
  sessions: readonly Session[];
  to: string;
}

export function injuryHistory(input: InjuryHistoryInput): InjuryHistory {
  const days: InjuryDay[] = [];

  const byDate = new Map<string, Session[]>();
  for (const session of input.sessions) {
    if (session.date < input.since || session.date > input.to) continue;
    byDate.set(session.date, [...(byDate.get(session.date) ?? []), session]);
  }

  for (const [date, onDay] of byDate) {
    // The newest answer of the day: two sessions can each carry a check-in,
    // and the later one is the later word on the same part.
    const answers = onDay
      .map((s) => s.checkIn?.parts?.[input.part])
      .filter((f): f is TissueFeel => f !== undefined);
    const feel = answers.at(-1);
    if (feel === undefined) continue;
    days.push({ date, feel });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : 1));

  return {
    part: input.part,
    from: input.since,
    to: input.to,
    days,
    elapsed: Math.max(1, daysBetween(input.since, input.to) + 1),
    worse: days.filter((d) => d.feel === 'sore').length,
    tender: days.filter((d) => d.feel === 'tender').length,
    fine: days.filter((d) => d.feel === 'good').length,
  };
}

/**
 * Coverage first, then the counts — and no number at all where there is
 * nothing to count.
 *
 * The rule `checkIns` settled on: "you stayed under the ceiling every time"
 * over three sessions is a sentence that means nothing, so every figure is
 * reported against how many days it could have come from.
 */
export function describeInjuryHistory(history: InjuryHistory): string | null {
  if (history.days.length === 0) return null;
  const answered = `Answered on ${history.days.length} of the ${history.elapsed} days since you logged it`;
  const parts: string[] = [];
  if (history.worse > 0) parts.push(`${history.worse} worse`);
  if (history.tender > 0) parts.push(`${history.tender} niggly`);
  if (history.fine > 0) parts.push(`${history.fine} fine`);
  return `${answered}: ${parts.join(', ')}.`;
}

/**
 * The days it was worse, newest first, with what was logged around each.
 *
 * Around, not before: an injury that flares *during* a session and one that
 * flares the morning after are different stories, and the check-in is taken
 * before the session it sits on. So each bad day carries the day before it
 * and the day itself, and says which is which rather than picking one.
 */
/**
 * Episodes, which is what an injury record could not see (PLAN.md M177).
 *
 * `injuryHistory` above reads inside **one** episode — how the part has felt
 * since `since`. It is scoped to a live injury, and until M177 a healed one
 * was deleted, so the reading died with the record and the question a physio
 * asks second — *has this happened before?* — had no answer at all.
 *
 * ## What it reports and what it refuses
 *
 * The same line this module draws everywhere else. It reports **what
 * happened**: how many times, how long each ran, how long the climber was
 * clear in between. It refuses to say what that means. Two episodes is not a
 * pattern, a gap of forty days is not a prognosis, and the app has one
 * self-reported flag per episode rather than a diagnosis — so the numbers go
 * on the screen and the climber takes them to someone who can read them.
 *
 * It gates nothing, deliberately. M161 blocks a maximal test on a *live*
 * injury because that is a fact about today; blocking one on a history would
 * be the app deciding a climber is fragile, which is a clinical judgement it
 * is in no position to make.
 */
export interface Episode {
  part: BodyPart;
  since: string;
  /** The day it was marked healed. */
  healedAt: string;
  /** How long it ran, in days. */
  days: number;
}

export interface Recurrence {
  part: BodyPart;
  /** Closed episodes, oldest first. */
  past: Episode[];
  /** Past episodes plus the live one, when there is a live one. */
  total: number;
  /** Days clear between the last episode ending and the live one starting. */
  clearDays: number | null;
}

/** The episodes on one part, and where a live injury sits among them. */
export function recurrenceFor(
  part: BodyPart,
  healed: readonly Injury[],
  live?: Injury,
): Recurrence {
  const past = healed
    .filter((injury) => injury.part === part && injury.healedAt !== undefined)
    .map((injury) => ({
      part,
      since: injury.since,
      healedAt: injury.healedAt!,
      days: Math.max(0, daysBetween(injury.since, injury.healedAt!)),
    }))
    .sort((a, b) => (a.since < b.since ? -1 : 1));
  const last = past.at(-1);
  return {
    part,
    past,
    total: past.length + (live ? 1 : 0),
    clearDays: last && live ? Math.max(0, daysBetween(last.healedAt, live.since)) : null,
  };
}

const ORDINAL = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];

/**
 * `third`, or `9th` once the words stop being worth it.
 *
 * With the real suffix past the words, because `21th` looks like a bug and
 * the one place this reads is a sentence about somebody's body.
 */
export function ordinal(n: number): string {
  const word = ORDINAL[n];
  if (word !== undefined) return word;
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * One sentence about how often this part has gone, or nothing.
 *
 * Nothing when there is no history to report, which is most climbers most of
 * the time — the same rule `describeInjuryHistory` follows above, and the
 * reason neither of them renders an empty heading.
 */
export function describeRecurrence(recurrence: Recurrence): string | null {
  const { past, total, clearDays, part } = recurrence;
  if (past.length === 0) return null;
  const runs = `${past.length === 1 ? 'The last one ran' : 'They ran'} ${past
    .map((episode) => plural(episode.days, 'day'))
    .join(', ')}.`;
  if (total === past.length) {
    return `${past.length === 1 ? 'One episode' : `${plural(past.length, 'episode')}`} on this ${part} before, healed. ${runs}`;
  }
  const clear = clearDays === null ? '' : ` You were clear for ${plural(clearDays, 'day')} in between.`;
  return `The ${ordinal(total)} time this ${part} has gone. ${runs}${clear}`;
}

export interface BadDay {
  date: string;
  /** What was logged the day before — what the check-in is reacting to. */
  before: string[];
  /** What was logged on the day itself, after the answer was given. */
  after: string[];
}

export function badDays(history: InjuryHistory, sessions: readonly Session[], nameOf?: (id: string) => string | undefined): BadDay[] {
  const name = nameOf ?? (() => undefined);
  const onDay = (date: string): string[] => [
    ...new Set(
      sessions
        .filter((s) => s.date === date && s.completed)
        .map((s) => describeSession(s, name)),
    ),
  ];
  return history.days
    .filter((d) => d.feel === 'sore')
    .map((d) => ({ date: d.date, before: onDay(addDays(d.date, -1)), after: onDay(d.date) }))
    .reverse();
}
