/**
 * Where you climbed (PLAN.md M88b).
 *
 * **The milestone undercounts the problem.** It names `session.fields.location`
 * — six session types across two programs. There are **three** independent
 * free-text location strings with no relationship to each other:
 * `session.fields.location`, `Project.location`, and `Objective.location`.
 * The app renders all three and groups by none of them, so a climber who has
 * been to the same crag on forty sessions, kept two projects there and set an
 * objective for it has that place written down forty-three times and counted
 * zero.
 *
 * **Derived, not a stored catalogue.** A venue here is a reading of what has
 * been typed, not a record to curate: no new store, no migration, no list to
 * keep tidy, and it works on the history a climber already has. The cost is
 * that the app cannot *merge* what it cannot prove is the same place — see
 * the normalisation rule below, which is deliberately timid.
 *
 * **The rule that makes it work is on the way in, not the way out.** A
 * grouping over free text is only as good as the text, so the three inputs
 * offer what has been typed before. That is what turns "the works", "The
 * Works" and "the  works" into one place — by never creating them.
 */

import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import type { Objective } from './objectives';
import { joinCapped } from './phrase';

/**
 * The key two spellings have to share to be one place.
 *
 * Case and surrounding space only. **Not** a leading "the", not
 * punctuation, not a plural: "The Works" and "Works" may well be the same
 * crag and the app cannot know it, and a grouping that guessed would
 * silently merge two real places that happen to read alike.
 */
export function venueKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export interface Venue {
  key: string;
  /** The spelling to show: the one typed most often. */
  name: string;
  /** Every spelling seen, most-used first. */
  spellings: string[];
  sessions: number;
  /** Distinct days a session there was logged. */
  days: number;
  /** Of those, the ones logged as outdoor. */
  outdoorDays: number;
  projects: number;
  objectives: number;
}

export interface VenueInput {
  sessions?: readonly Session[];
  projects?: readonly Project[];
  objectives?: readonly Objective[];
}

interface Spelling {
  count: number;
  /** The latest day it was typed on, or '' when only a project or objective used it. */
  last: string;
}

interface Tally {
  key: string;
  spellings: Map<string, Spelling>;
  sessions: number;
  days: Set<string>;
  outdoorDays: Set<string>;
  projects: number;
  objectives: number;
}

export function venues(input: VenueInput): Venue[] {
  const found = new Map<string, Tally>();
  const at = (raw: string | number | undefined, on = ''): Tally | null => {
    if (typeof raw !== 'string') return null;
    const key = venueKey(raw);
    if (key === '') return null;
    const spelling = raw.trim();
    const existing = found.get(key);
    if (existing) {
      const seen = existing.spellings.get(spelling);
      existing.spellings.set(spelling, {
        count: (seen?.count ?? 0) + 1,
        last: on > (seen?.last ?? '') ? on : (seen?.last ?? ''),
      });
      return existing;
    }
    const tally: Tally = {
      key,
      spellings: new Map([[spelling, { count: 1, last: on }]]),
      sessions: 0,
      days: new Set(),
      outdoorDays: new Set(),
      projects: 0,
      objectives: 0,
    };
    found.set(key, tally);
    return tally;
  };

  for (const session of input.sessions ?? []) {
    if (!session.completed) continue;
    const tally = at(session.fields?.location, session.date);
    if (tally === null) continue;
    tally.sessions++;
    tally.days.add(session.date);
    if (session.mode === 'outdoor') tally.outdoorDays.add(session.date);
  }
  for (const project of input.projects ?? []) {
    const tally = at(project.location);
    if (tally !== null) tally.projects++;
  }
  for (const objective of input.objectives ?? []) {
    const tally = at(objective.location);
    if (tally !== null) tally.objectives++;
  }

  return [...found.values()]
    .map((t) => {
      // Most used, then most recent, then a stable fallback. Recency
      // second because a climber who has switched from "the works" to "The
      // Works" is telling the app which one they mean, and a tie broken
      // alphabetically would keep showing the one they stopped typing.
      const spellings = [...t.spellings.entries()]
        .sort(
          (a, b) =>
            b[1].count - a[1].count ||
            b[1].last.localeCompare(a[1].last) ||
            (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
        )
        .map(([spelling]) => spelling);
      return {
        key: t.key,
        name: spellings[0]!,
        spellings,
        sessions: t.sessions,
        days: t.days.size,
        outdoorDays: t.outdoorDays.size,
        projects: t.projects,
        objectives: t.objectives,
      };
    })
    .sort((a, b) => b.days - a.days || b.sessions - a.sessions || a.name.localeCompare(b.name));
}

/**
 * Every spelling already used, for an input to offer.
 *
 * Spellings rather than names: someone who has typed "the works" should be
 * offered it back, or the suggestion list is a second place to disagree
 * with. Alphabetical, because a datalist is read as a list and not as a
 * ranking.
 */
export function venueSuggestions(list: readonly Venue[]): string[] {
  return [...new Set(list.flatMap((v) => v.spellings))].sort(
    // Base sensitivity puts two spellings of one place together; the code
    // -unit fallback decides which of the two comes first, because a list
    // whose order depends on insertion is a list that reorders itself as a
    // climber types.
    (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0),
  );
}

/** "You climb at the Works most — 40 days there." Null when there is no pattern. */
export function describeVenues(list: readonly Venue[]): string | null {
  const climbed = list.filter((v) => v.days > 0);
  if (climbed.length === 0) return null;

  const top = climbed[0]!;
  const outdoors = climbed.filter((v) => v.outdoorDays > 0);
  const lead =
    climbed.length === 1
      ? `Every session you have named a place for was at ${top.name} — ${days(top.days)}.`
      : // Not "days out": the place you climb most is usually a gym, and
        // "out" reads as outdoors — which the next clause is actually about.
        `You climb at ${top.name} most — ${days(top.days)} of ${climbed.reduce((n, v) => n + v.days, 0)} across ${climbed.length} places.`;

  if (outdoors.length === 0) return lead;
  return `${lead} Outdoors: ${joinCapped(
    outdoors.map((v) => `${v.name} (${v.outdoorDays})`),
    3,
  )}.`;
}

function days(n: number): string {
  return n === 1 ? '1 day' : `${n} days`;
}
