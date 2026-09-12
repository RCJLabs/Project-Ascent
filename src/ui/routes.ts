/**
 * The app's shape, in one place (PLAN.md M16).
 *
 * Two problems this solves at once.
 *
 * **Back links.** Twenty-one pages each wrote their own
 * `<Link href="/train"><ArrowLeft /> Train</Link>`, which meant twenty-one
 * copies of the same class string and twenty-one chances for a page to
 * point at the wrong parent — or, when a page gained a second way in, to
 * point at a parent you did not come from. Derived from here instead.
 *
 * **Finding anything.** Five tabs and twenty-six routes: the glossary, the
 * guides, the career timeline, objectives, the coach, the board and the
 * altimeter are all reachable only by knowing which page hides them. The
 * search page reads this table, so a destination is listed because it
 * exists rather than because someone remembered to add it.
 */

export interface RouteMeta {
  /** The wouter path, patterns included. */
  path: string;
  /** What to call it, in a list and in a back link. */
  title: string;
  /** Where "back" goes. Null for the five tabs, which are the roots. */
  parent: string | null;
  /** Extra words someone might search for that are not in the title. */
  keywords?: string[];
  /** Grouping in the search page's browse list. Absent means unlisted —
   *  detail routes with an id in them cannot be linked to blind. */
  group?: 'Train' | 'Log' | 'Progress' | 'Climber' | 'Reference' | 'Play';
}

/**
 * Every route, including the ones with parameters.
 *
 * A test asserts this matches `App.tsx`, so a new page cannot quietly
 * appear without a title, a parent and a decision about whether it belongs
 * in search.
 */
export const ROUTES: RouteMeta[] = [
  { path: '/', title: 'Home', parent: null },
  { path: '/train', title: 'Train', parent: null },
  { path: '/calendar', title: 'Calendar', parent: null },
  { path: '/projects', title: 'Projects', parent: null },
  { path: '/progress', title: 'Progress', parent: null },

  { path: '/search', title: 'Search', parent: null },

  // Train
  { path: '/find', title: 'Find my program', parent: '/train', group: 'Train', keywords: ['finder', 'recommend', 'which program'] },
  { path: '/finish', title: 'Block review', parent: '/train', group: 'Train', keywords: ['finished', 'block end', 'what next', 'graduation', 'last week', 'history', 'blocks you have run'] },
  { path: '/finish/:id', title: 'Block', parent: '/finish' },
  { path: '/train/:id', title: 'Program', parent: '/train' },
  { path: '/train/:id/start', title: 'Start a program', parent: '/train/:id' },
  { path: '/build', title: 'Your programs', parent: '/train', group: 'Train', keywords: ['builder', 'write', 'custom', 'fork'] },
  { path: '/build/:id', title: 'Edit a program', parent: '/build' },
  { path: '/build/:id/session/:typeId', title: 'Edit a session', parent: '/build/:id' },
  { path: '/objectives', title: 'Objectives', parent: '/train', group: 'Train', keywords: ['goal', 'project', 'training for'] },
  { path: '/objectives/:id', title: 'Objective', parent: '/objectives' },

  // Log
  { path: '/log/:date', title: 'Log', parent: '/calendar' },
  { path: '/gym', title: 'Gym mode', parent: '/calendar', group: 'Log', keywords: ['tally', 'rest timer', 'at the wall', 'mid-session'] },
  { path: '/today', title: 'Today', parent: '/calendar', group: 'Log', keywords: ['log a session'] },
  { path: '/board', title: 'The board', parent: '/', group: 'Log', keywords: ['challenges', 'bounties', 'daily', 'weekly'] },

  // Progress
  { path: '/journal', title: 'Journal', parent: '/progress', group: 'Progress', keywords: ['notes', 'beta', 'write-up'] },
  { path: '/assessments', title: 'Assessments', parent: '/progress', group: 'Progress', keywords: ['test', 'benchmark', 'max hang', 'pull-up'] },
  { path: '/assessments/:id', title: 'Assessment', parent: '/assessments' },
  { path: '/career', title: 'Career', parent: '/progress', group: 'Progress', keywords: ['milestones', 'timeline', 'history'] },
  { path: '/year', title: 'Year in review', parent: '/career', group: 'Progress', keywords: ['annual', 'season', 'recap'] },
  { path: '/year/:year', title: 'Year in review', parent: '/career' },
  { path: '/review', title: 'Weekly review', parent: '/', group: 'Progress', keywords: ['week', 'recap', 'sunday'] },
  { path: '/projects/:id', title: 'Project', parent: '/projects' },

  // Climber
  { path: '/climber', title: 'Your climber', parent: '/', group: 'Climber', keywords: ['stats', 'level', 'avatar', 'vitality', 'rank', 'injuries', 'injury'] },
  { path: '/skills', title: 'Skill trees', parent: '/climber', group: 'Climber', keywords: ['unlock', 'nodes', 'power', 'tension'] },
  { path: '/achievements', title: 'Achievements', parent: '/climber', group: 'Climber', keywords: ['badges', 'earned', 'trophies', 'awards'] },
  { path: '/altimeter', title: 'The altimeter', parent: '/', group: 'Climber', keywords: ['height', 'feet', 'everest', 'metres'] },
  { path: '/coach', title: "Coach's Corner", parent: '/', group: 'Climber', keywords: ['tips', 'advice', 'observations'] },

  // Reference
  { path: '/settings', title: 'Settings', parent: '/', group: 'Reference', keywords: ['theme', 'backup', 'export', 'grades', 'sound', 'equipment'] },
  { path: '/guides', title: 'Guides', parent: '/settings', group: 'Reference', keywords: ['manual', 'how to', 'reading'] },
  { path: '/guides/:id', title: 'Guide', parent: '/guides' },
  // A section of one, which is where a search hit on the prose lands.
  { path: '/guides/:id/:section', title: 'Guide', parent: '/guides' },
  { path: '/glossary', title: 'Glossary', parent: '/settings', group: 'Reference', keywords: ['terms', 'jargon', 'what does', 'definition'] },
  { path: '/drills', title: 'Drills', parent: '/settings', group: 'Reference', keywords: ['library', 'exercises', 'technique', 'session ideas', 'what to do'] },
  { path: '/drills/:id', title: 'Drill', parent: '/drills' },
  { path: '/data', title: 'Your data', parent: '/settings', group: 'Reference', keywords: ['storage', 'records', 'health', 'orphaned', 'unreadable', 'tidy'] },
  { path: '/attach', title: 'Add a photo', parent: '/', group: 'Log', keywords: ['photo', 'picture', 'image', 'camera', 'attach', 'upload', 'beta shot', 'share'] },
  { path: '/injury/:id', title: 'Injury', parent: '/climber' },

  // Play
  { path: '/ascent', title: 'The Ascent', parent: '/', group: 'Play', keywords: ['game', 'minigame', 'free solo'] },
];

const BY_PATH = new Map(ROUTES.map((route) => [route.path, route]));

/** Turn a concrete location into the pattern that matched it. */
export function matchRoute(location: string): RouteMeta | undefined {
  const exact = BY_PATH.get(location);
  if (exact) return exact;

  const parts = location.split('/').filter(Boolean);
  // Longest pattern first, so `/train/:id/start` beats `/train/:id`.
  return [...ROUTES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((route) => {
      const pattern = route.path.split('/').filter(Boolean);
      if (pattern.length !== parts.length) return false;
      return pattern.every((segment, i) => segment.startsWith(':') || segment === parts[i]);
    });
}

/** Where a back link on this page should go, and what to call it. */
export function parentOf(location: string): { href: string; title: string } | null {
  const route = matchRoute(location);
  if (!route || route.parent === null) return null;
  const parent = BY_PATH.get(route.parent);
  return parent === undefined ? null : { href: parent.path, title: parent.title };
}

/** Everything worth listing when someone is browsing rather than searching. */
export function browsable(): RouteMeta[] {
  return ROUTES.filter((route) => route.group !== undefined);
}
