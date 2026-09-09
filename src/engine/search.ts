/**
 * Search across everything, offline (PLAN.md M16).
 *
 * Five tabs and twenty-six routes, and the glossary, the guides, the career
 * timeline, objectives, the coach, the board and the altimeter are each
 * reachable only by knowing which page hides them. That is fine for the
 * person who built it and hostile to everyone else.
 *
 * ## Derived, like everything
 *
 * The index is built from the same content modules and stores the rest of
 * the app reads — nothing is written, nothing is kept in step by hand, and
 * a session that is edited is searchable as its new self immediately.
 * Building it is a walk over data already in memory, so it happens on the
 * search page and nowhere else; there is no background index to go stale.
 *
 * ## Ranking
 *
 * Deliberately simple and explainable, in this order:
 *
 * 1. The title starts with what you typed.
 * 2. A word in the title starts with what you typed.
 * 3. The title contains it anywhere.
 * 4. Only the body or the keywords contain it.
 *
 * Ties break on the kind's own weight — a page beats a glossary term beats
 * an old session — and then on recency where the thing has a date. No fuzzy
 * matching: a search that returns "Deadlift" for "deadhang" is worse than
 * one that returns nothing, for the same reason the glossary lookup is
 * exact.
 */

export type ResultKind =
  | 'page'
  | 'program'
  | 'objective'
  | 'project'
  | 'session'
  | 'term'
  | 'guide'
  | 'metric'
  | 'drill';

export interface SearchItem {
  id: string;
  kind: ResultKind;
  title: string;
  /** One line under the title. Searched, but weighted below the title. */
  detail?: string;
  href: string;
  /** Words worth matching that a climber would not see. */
  keywords?: string[];
  /** For ordering things that happened. `YYYY-MM-DD`. */
  date?: string;
  /** Shown as a small label, e.g. the group a page belongs to. */
  badge?: string;
}

export interface SearchResult extends SearchItem {
  score: number;
}

/** How much each kind is worth before the query is considered at all. */
const KIND_WEIGHT: Record<ResultKind, number> = {
  page: 6,
  program: 5,
  objective: 5,
  project: 4,
  term: 3,
  guide: 3,
  metric: 2,
  drill: 2,
  session: 1,
};

const STARTS = 1000;
const WORD = 700;
const CONTAINS = 400;
const BODY = 150;

function normalise(text: string): string {
  return text.trim().toLowerCase();
}

/**
 * Score one item against a query, or 0 for no match.
 *
 * Exported so the ranking can be argued with in a test rather than only
 * observed through the list.
 */
export function scoreItem(item: SearchItem, query: string): number {
  const needle = normalise(query);
  if (needle === '') return 0;

  const title = normalise(item.title);
  let score = 0;

  if (title.startsWith(needle)) score = STARTS;
  else if (title.split(/[\s/(),.-]+/).some((word) => word.startsWith(needle))) score = WORD;
  else if (title.includes(needle)) score = CONTAINS;
  else {
    const body = normalise(
      [item.detail ?? '', ...(item.keywords ?? [])].join(' '),
    );
    if (body.includes(needle)) score = BODY;
    else return 0;
  }

  // Shorter titles are usually the more direct answer: searching "log"
  // should put the Log page above "Logged on the wrong day". Only for
  // authored titles — a session's title is generated, so letting a
  // one-character difference outrank its date would order the log by
  // nothing at all.
  const brevity = item.date === undefined ? Math.max(0, 40 - title.length) : 0;
  return score + KIND_WEIGHT[item.kind] * 10 + brevity;
}

export interface SearchOptions {
  limit?: number;
  /** Only this kind. */
  kind?: ResultKind;
}

export function search(items: readonly SearchItem[], query: string, options: SearchOptions = {}): SearchResult[] {
  const limit = options.limit ?? 40;
  const scored: SearchResult[] = [];

  for (const item of items) {
    if (options.kind !== undefined && item.kind !== options.kind) continue;
    const score = scoreItem(item, query);
    if (score > 0) scored.push({ ...item, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Newer first among things that happened; alphabetical otherwise.
    if (a.date !== undefined && b.date !== undefined && a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.title.localeCompare(b.title);
  });

  return scored.slice(0, limit);
}

/** Group results for display, in the order the kinds should appear. */
export const KIND_LABEL: Record<ResultKind, string> = {
  page: 'Pages',
  program: 'Programs',
  objective: 'Objectives',
  project: 'Projects',
  guide: 'Guides',
  term: 'Glossary',
  metric: 'Assessments',
  drill: 'Drills',
  session: 'Sessions',
};

export function groupResults(results: readonly SearchResult[]): { kind: ResultKind; label: string; items: SearchResult[] }[] {
  const order = Object.keys(KIND_LABEL) as ResultKind[];
  return order
    .map((kind) => ({ kind, label: KIND_LABEL[kind], items: results.filter((r) => r.kind === kind) }))
    .filter((group) => group.items.length > 0);
}
