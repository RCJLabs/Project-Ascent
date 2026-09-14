import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The privacy page's claims, held by the source rather than by the page
 * (PLAN.md M171).
 *
 * A privacy statement that overclaims is worse than none, and the strong
 * sentences on that page — *"no server"*, *"no analytics"*, *"nothing you log
 * leaves this device"* — are all one fact: **the app makes no network
 * requests**. That is checkable, so it is checked here rather than promised
 * there, and a future feature that adds one fails this file first.
 */

const SRC = 'src';

/** Every source file under `src/`, tests excluded — they may say anything. */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry)) continue;
    if (/\.test\.tsx?$/.test(entry)) continue;
    out.push(path);
  }
  return out;
}

/**
 * Where a name appears in real code rather than in a comment saying the app
 * does not do it.
 *
 * Crude on purpose: it strips block comments, line comments and string
 * literals, which is enough to tell `fetch(` in an import from `fetch` in the
 * sentence *"the catalogue is fetched, not imported"*. A parser would be more
 * correct and would not change a single answer here.
 */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const FILES = sourceFiles();
const CODE = FILES.map((path) => ({ path, text: code(readFileSync(path, 'utf8')) }));

/**
 * The one file excluded from the *name* sweep below, and only from that one.
 *
 * The privacy page says "no analytics" in its own prose, and JSX text is not
 * a string literal, so `code()` cannot strip it. It stays in the
 * network-call sweep — a `fetch` added to the privacy page would be found —
 * and comes out of the sweep for names it exists in order to deny.
 */
const THE_PAGE = 'src/features/privacy/PrivacyPage.tsx';

/** Files whose code mentions `pattern`. */
const mentioning = (pattern: RegExp, skip: readonly string[] = []) =>
  CODE.filter(({ path, text }) => !skip.includes(path) && pattern.test(text)).map(({ path }) => path);

describe('the app makes no network requests', () => {
  it('reads enough of the source to be worth trusting', () => {
    // A sweep that found nothing because it walked nothing would pass every
    // assertion below.
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain('src/main.tsx');
    expect(FILES).toContain('src/db/exportImport.ts');
  });

  it.each([
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['sendBeacon', /\bsendBeacon\b/],
    ['WebSocket', /\bWebSocket\b/],
    ['EventSource', /\bEventSource\b/],
    ['axios', /\baxios\b/],
  ])('calls no %s anywhere in src', (_name, pattern) => {
    expect(mentioning(pattern)).toEqual([]);
  });

  /**
   * The one thing that looks like a network call and is not: the catalogue
   * "fetched, not imported" (M78) is `import('./catalogue')`, a dynamic
   * import of a chunk this app shipped. Held here so the sweep above cannot
   * be quietly relaxed into allowing a real one.
   */
  it('loads the catalogue with a dynamic import of its own code', () => {
    const registry = readFileSync('src/content/programs/index.ts', 'utf8');
    expect(registry).toMatch(/import\('\.\/catalogue'\)/);
    expect(code(registry)).not.toMatch(/\bfetch\s*\(/);
  });
});

describe('and no third party is watching', () => {
  it.each([
    ['analytics', /\banalytics\b/i],
    ['telemetry', /\btelemetry\b/i],
    ['gtag or Google Analytics', /\bgtag\b|googletagmanager|google-analytics/i],
    ['Sentry', /\bSentry\b/i],
    ['Segment', /\bsegment\.(com|io)\b/i],
    ['PostHog', /\bposthog\b/i],
    ['Mixpanel', /\bmixpanel\b/i],
    ['Amplitude', /\bamplitude\b/i],
  ])('names no %s in code', (name, pattern) => {
    // `engine/progress.ts` opens with "Progress analytics (PLAN.md §5.9)" —
    // in a comment, which `code()` strips. That is the whole reason this
    // reads code rather than text.
    expect(mentioning(pattern, [THE_PAGE]), `${name} appears in code`).toEqual([]);
  });

  it('ships no dependency that talks to a network', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    const names = Object.keys(pkg.dependencies ?? {});
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(
        /axios|superagent|got|node-fetch|analytics|sentry|posthog|mixpanel|amplitude|firebase|supabase|amplify/i.test(name),
        `${name} is a runtime dependency`,
      ).toBe(false);
    }
  });

  /**
   * And nothing loads from anyone else's host. The one absolute URL the app
   * is allowed is an XML namespace, which is an identifier rather than a
   * request, and those are written by the SVG markup rather than by hand.
   */
  it('names no external host in code', () => {
    const external = CODE.flatMap(({ path, text }) =>
      (text.match(/https?:\/\/[^\s'"`)]+/g) ?? [])
        .filter((url) => !/^https?:\/\/(www\.)?w3\.org\//.test(url))
        .map((url) => `${path}: ${url}`),
    );
    expect(external).toEqual([]);
  });

  it('loads no remote font or script from index.html', () => {
    const html = readFileSync('index.html', 'utf8');
    const remote = (html.match(/(?:src|href)="([^"]+)"/g) ?? []).filter((attr) =>
      /="https?:\/\//.test(attr),
    );
    expect(remote).toEqual([]);
  });
});

describe('the page itself', () => {
  // Whitespace flattened, because the formatter wraps these sentences across
  // lines and a claim is a claim wherever the line happens to break.
  const page = readFileSync(THE_PAGE, 'utf8').replace(/\s+/g, ' ');

  it('is reachable, in the route table and in search', () => {
    const routes = readFileSync('src/ui/routes.ts', 'utf8');
    expect(routes).toMatch(/path: '\/privacy'/);
    expect(routes).toMatch(/keywords: \[[^\]]*'privacy'/);
    expect(readFileSync('src/App.tsx', 'utf8')).toMatch(/path="\/privacy"/);
  });

  it('is linked from Settings, where a climber goes looking', () => {
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).toMatch(
      /href="\/privacy"/,
    );
  });

  /**
   * The claims and the limits, both. A privacy page that only says the
   * comfortable half is the kind this milestone exists not to write, so the
   * awkward sentences are pinned too: hosting sees requests, a backup you put
   * in cloud storage is outside the app, and losing the device loses the log.
   */
  it.each([
    'no account',
    'no analytics',
    'aeroplane mode',
    'no sync between your phone and your laptop',
    'outside this app',
    'share sheet',
    'whoever hosts it sees',
    'no password reset because there is no password',
  ])('says %s', (claim) => {
    expect(page.includes(claim), claim).toBe(true);
  });

  /**
   * And promises nothing it cannot keep. "Encrypted", "anonymised" and
   * "we never share" are the three sentences a privacy page reaches for when
   * it has run out of true ones — none of them is true here, because there is
   * no transmission to encrypt, no data set to anonymise and no "we".
   */
  it.each([/encrypt/i, /anonymi[sz]/i, /\bwe (never|do not|don't)\b/i, /GDPR compliant/i])(
    'does not claim %s',
    (pattern) => {
      expect(pattern.test(page)).toBe(false);
    },
  );
});
