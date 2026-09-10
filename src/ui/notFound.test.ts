import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * One shape for a record that is not there (PLAN.md M41).
 *
 * Eleven routes take a parameter. Five different things happened when the
 * parameter named nothing:
 *
 *  - `/build/<gone>` and `/build/<gone>/session/<gone>` said "Not found";
 *  - `/train/<gone>` said "Program not found" — a second heading for the
 *    same event — under the message "That program has not been converted
 *    yet", true of the prototype port and untrue since;
 *  - `/projects/<gone>` and `/assessments/<gone>` rendered a bare card with
 *    **no `h1` at all**, so nothing named where you had landed;
 *  - `/objectives/<gone>`, `/guides/<gone>` and `/injury/<gone>` navigated
 *    silently to the index — `/injury` to *Settings* — which throws away the
 *    only evidence of what happened. A stale bookmark becomes an ordinary
 *    index page and the reader concludes they mis-tapped;
 *  - `/year/<bad>` and `/log/<bad>` rendered as though the parameter were
 *    fine, which is a malformed parameter rather than a missing record and
 *    belongs to M42.
 *
 * These rules hold the first nine to one shape. The `h1` comes from
 * `RecordNotFound` itself, so a page that uses it cannot lose its heading in
 * the branch — which the general heading check could never catch, because it
 * reads whether the *file* contains a `PageHeader`, not whether the branch
 * you are looking at renders one.
 */

const APP = readFileSync('src/App.tsx', 'utf8');
const COMPONENT = readFileSync('src/ui/RecordNotFound.tsx', 'utf8');

/**
 * Routes whose parameter names a stored record.
 *
 * `:date` and `:year` are excluded on purpose: a bad date is not a deleted
 * record, and answering it with "That date is not here" would be a worse lie
 * than the one it replaces.
 */
const RECORD_PARAM = /:(id|typeId)\b/;

interface RoutedPage {
  path: string;
  component: string;
  file: string;
}

function routedPages(): RoutedPage[] {
  const imports = new Map<string, string>();
  // Lazy: `const X = lazy(() => import('@/features/…'))`.
  for (const m of APP.matchAll(/const (\w+) = lazy\(\(\) => import\('@\/(features\/[^']+)'/g)) {
    imports.set(m[1]!, `src/${m[2]}.tsx`);
  }
  // Static: `import { X, Y } from '@/features/…'`. Reading only the first
  // name here missed `import { LogPage, TodayRedirect }`, which is why
  // `/log/:date` fell out of this list and the rule below found nothing to
  // check — caught by the coverage test rather than by noticing.
  for (const m of APP.matchAll(/import \{([^}]+)\} from '@\/(features\/[^']+)'/g)) {
    for (const name of m[1]!.split(',')) {
      const clean = name.trim().replace(/^type\s+/, '');
      if (clean) imports.set(clean, `src/${m[2]}.tsx`);
    }
  }
  const found: RoutedPage[] = [];
  for (const m of APP.matchAll(/<Route path="([^"]+)" component=\{(\w+)\}/g)) {
    const file = imports.get(m[2]!);
    if (file !== undefined) found.push({ path: m[1]!, component: m[2]!, file });
  }
  return found;
}

describe('a record that is not there', () => {
  const pages = routedPages();
  const recordRoutes = pages.filter((p) => RECORD_PARAM.test(p.path));

  it('finds the routes it means to check', () => {
    // The floor. A parser that stops matching App.tsx passes every rule
    // below by having nothing to judge — the way the heading sweep here
    // quietly fell from twenty-five pages to four (PLAN.md M40).
    expect(pages.length).toBeGreaterThan(25);
    expect(recordRoutes.length).toBeGreaterThan(7);
    expect(recordRoutes.map((r) => r.path)).toContain('/projects/:id');
  });

  it('answers every record route with the one shape', () => {
    // `<RecordNotFound`, not `RecordNotFound`: an import left behind after
    // the JSX was replaced satisfied the looser form, which is how this
    // rule survived its first mutation.
    const wrong = recordRoutes
      .filter(({ file }) => !readFileSync(file, 'utf8').includes('<RecordNotFound'))
      .map(({ path, file }) => `${path} → ${file} does not render RecordNotFound`);
    expect(wrong).toEqual([]);
  });

  it('puts a heading on it, from the component rather than from each caller', () => {
    expect(COMPONENT).toMatch(/<PageHeader title="Not found"/);
  });

  it('never navigates away instead of saying so', () => {
    // The exact antipattern that was removed: decide the record is missing,
    // then replace the URL with the index.
    const offences: string[] = [];
    for (const { path, file } of recordRoutes) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(/if \([^)]*!\w+\)\s*(?:\{\s*)?navigate\(/g)) {
        offences.push(`${path}: ${m[0].trim()}…`);
      }
    }
    expect(offences).toEqual([]);
  });

  it('keeps one wording for it across the app', () => {
    // Two headings for one event is two things to learn. The global 404 in
    // App.tsx and every record route say the same two words.
    expect(APP).toMatch(/<PlaceholderPage title="Not found"/);
    const rogue = recordRoutes
      .flatMap(({ path, file }) =>
        [...readFileSync(file, 'utf8').matchAll(/title="([^"]*[Nn]ot found[^"]*)"/g)]
          .filter((m) => m[1] !== 'Not found')
          .map((m) => `${path} says "${m[1]}"`),
      );
    expect(rogue).toEqual([]);
  });
});

/**
 * A route parameter that is not what the route says it is (PLAN.md M42).
 *
 * `/log/:date` used the parameter as the session's **stored primary key**,
 * so a malformed URL did not just render badly — it wrote rows the rest of
 * the app could never read. Logging from `/log/nope` stored
 * `{ id: 'nope#0', date: 'nope' }`; logging from `/log/2026-9-1` stored a
 * session that `/log/2026-09-01`, the same day written the way this app
 * writes days, reported as "Nothing planned". Neither appeared on the
 * calendar, in a streak, or in any derivation.
 *
 * And `/log/2026-13-45` rendered "Sunday, February 14", because the parse is
 * `new Date(y, m - 1, d)` and that rolls overflow forward without a word.
 *
 * Two layers, so neither is the only one: the route refuses to mount the
 * page, and `newSession` refuses to build a row.
 */
describe('a parameter that is not what it claims', () => {
  const PARAM_VALIDATOR: Record<string, string> = {
    '/log/:date': 'isDateKey',
    '/year/:year': 'isYearKey',
  };

  const pages = routedPages();

  it('finds the routes it means to check', () => {
    const paths = pages.map((p) => p.path);
    for (const route of Object.keys(PARAM_VALIDATOR)) {
      expect(paths, `${route} is no longer a route — this rule is checking nothing`).toContain(route);
    }
  });

  it('validates the parameter before the page can use it', () => {
    // A source check, and it can only prove the call is written — not that
    // it still gates anything. Disabling the guard with `if (false && …)`
    // passes this and was not caught. The invariant that matters is not
    // this one: it is `newSession` refusing to build a row on a date that
    // is not one, which is a real behavioural test in `dates.test.ts` and
    // does kill that mutation.

    const wrong: string[] = [];
    for (const [route, validator] of Object.entries(PARAM_VALIDATOR)) {
      const page = pages.find((p) => p.path === route);
      if (page === undefined) continue;
      const source = readFileSync(page.file, 'utf8');
      if (!source.includes(`${validator}(`)) wrong.push(`${route} → ${page.file} never calls ${validator}`);
      if (!source.includes('<BadParameter')) wrong.push(`${route} → ${page.file} has nothing to render when it fails`);
    }
    expect(wrong).toEqual([]);
  });

  it('says something different from a missing record', () => {
    // A malformed date is not a deleted record. Answering `/log/2026-13-45`
    // with "That day is not here" would be a worse lie than the "Sunday,
    // February 14" it replaced.
    expect(COMPONENT).toMatch(/<PageHeader title="Not a valid link"/);
    expect(COMPONENT).toMatch(/<PageHeader title="Not found"/);
  });
});
