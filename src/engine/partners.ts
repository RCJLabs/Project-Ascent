/**
 * Who you climbed with (PLAN.md M237).
 *
 * A `Climb` holds grade, scale, count, result, style, angle, rope style and a
 * name. A `Session` holds mode, RPE, duration, drill, exercises, check-in,
 * project attempts, a rest checklist and notes. **Neither has ever held a
 * person**, and every occurrence of "partner" in `src/` before this was prose
 * in the glossary or a guide.
 *
 * Roped climbing has a second person in it by definition. `ropeStyle.ts`
 * already reasons about one it cannot see — *"there are real reasons a log is
 * all top-rope: an autobelay gym, **a partner who does not lead**, a
 * shoulder"* — and then says nothing, because it has no way to know.
 *
 * ## The whole design is the privacy of it
 *
 * A partner's name is personal data about **someone who never installed this
 * app and was never asked**. That is a different thing from every other field
 * in the log, and it sets the rules:
 *
 * - **It never leaves the device in anything shareable.** The backup and the
 *   CSV are the climber's own data going to their own disk, so a name that
 *   was dropped from those would make a backup that silently loses history.
 *   A **share card** is a picture made to be posted, and `shared.test.ts`
 *   holds it: no card carries a name.
 * - **It is one free-text field and not a contact.** No address book, no
 *   identifier, no account. A first name or a nickname is what a climber
 *   would write in a paper logbook, and the app knows no more than that.
 * - **It reports and never scores.** How often you climb with someone is a
 *   fact about your log; who you climb *best* with is a judgement about a
 *   person who is not here to answer it.
 *
 * ## Per session, not per climb
 *
 * You climb a session with someone. Per-climb would be twenty fields on a
 * bouldering session and nobody would fill one, and the reading that matters
 * — how much of your roped climbing happens with anyone at all — is a
 * question about sessions.
 */

import type { Session } from '@/db/sessions';
import { isRestSession } from './rest';

/** Longest a stored name may be, so a field cannot become a note. */
export const NAME_LIMIT = 40;

/**
 * A typed name, cleaned, or null when it is not a name.
 *
 * Trimmed and collapsed rather than rejected, because "  sam " and "sam" are
 * the same partner and a log that held both would tally them apart.
 */
export function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, NAME_LIMIT);
  return name.length === 0 ? null : name;
}

/**
 * Add a name to a list, case-insensitively, keeping the spelling already
 * there.
 *
 * "Sam" and "sam" are one person, and the first spelling wins — re-casing
 * somebody's name because of how it was typed the second time is the app
 * correcting a climber about their own friend.
 */
export function withPartner(current: readonly string[], raw: string): string[] {
  const name = cleanName(raw);
  if (name === null) return [...current];
  const have = current.some((p) => p.toLowerCase() === name.toLowerCase());
  return have ? [...current] : [...current, name];
}

export function withoutPartner(current: readonly string[], name: string): string[] {
  return current.filter((p) => p.toLowerCase() !== name.toLowerCase());
}

/**
 * Everyone in the log, most recently climbed with first.
 *
 * The logger's suggestions, so recording a partner is one tap after the first
 * time. Recency rather than frequency: the person you climbed with on Tuesday
 * is the likeliest answer on Thursday, and a list sorted by lifetime count
 * would bury a new partner under an old one for months.
 */
export function knownPartners(sessions: readonly Session[]): string[] {
  const seen = new Map<string, string>();
  const byDate = [...sessions].sort((a, b) => (a.date < b.date ? 1 : -1));
  for (const session of byDate) {
    for (const name of session.partners ?? []) {
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return [...seen.values()];
}

export interface PartnerCount {
  name: string;
  sessions: number;
  /** The most recent session with them. */
  last: string;
}

/**
 * A session this reading is about — one that was climbed (PLAN.md M260).
 *
 * The same split `totalsFor` makes, and for the reason M246 made it: a rest
 * day is counted as a rest day and as nothing else. Both readings below
 * skipped it, and the year page divides one by the other against the year's
 * **session** count, which has excluded rest since M246. Forty training
 * sessions and twenty rest days read *“Named on −10 of 40 sessions”* — a
 * negative, printed directly under a line whose whole job is to say how much
 * of the log this card can actually see.
 *
 * This module's own question settles which way to split it: *“how much of
 * your roped climbing happens with anyone at all”*. A rest day is not
 * climbing, and a card headed *Who you climbed with* should not count one.
 */
function climbed(session: Session): boolean {
  return session.completed && !isRestSession(session);
}

/**
 * How many sessions each person is on, most first.
 *
 * A count and a date, and nothing else. Grades climbed with each person would
 * be the app ranking a climber's friends, which is not a thing a training log
 * gets to do.
 */
export function partnerTally(sessions: readonly Session[]): PartnerCount[] {
  const counts = new Map<string, PartnerCount>();
  for (const session of sessions) {
    if (!climbed(session)) continue;
    for (const name of session.partners ?? []) {
      const key = name.toLowerCase();
      const row = counts.get(key);
      if (row === undefined) {
        counts.set(key, { name, sessions: 1, last: session.date });
      } else {
        row.sessions += 1;
        if (session.date > row.last) row.last = session.date;
      }
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.sessions - a.sessions || (a.last < b.last ? 1 : -1) || a.name.localeCompare(b.name),
  );
}

/**
 * Sessions that were climbed and named nobody.
 *
 * Not "sessions climbed alone" — an unfilled field is a field nobody filled,
 * and most sessions in every log will be exactly that. The distinction is the
 * same one `ropeStyle.ts` makes about an absent rope style, and it is why the
 * reading states coverage before it states anything else.
 *
 * Counted over the same set as `partnerTally`, so that *named* and *not
 * named* add up to the number the page divides them by (PLAN.md M260).
 */
export function unsaid(sessions: readonly Session[]): number {
  return sessions.filter((s) => climbed(s) && (s.partners ?? []).length === 0).length;
}
