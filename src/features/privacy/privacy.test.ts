import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

/**
 * What a rebuild would pick up: the source the bundler reads, plus the three
 * files outside `src/` that change its output. Test files are left out — an
 * edit to one cannot change a byte of `dist/`.
 */
const FILES_FOR_STALENESS = [
  ...FILES,
  'index.html',
  'vite.config.ts',
  'package.json',
];
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

  /**
   * The runtime dependencies, named rather than screened (PLAN.md M194).
   *
   * This was a blocklist — `axios|sentry|posthog|…`, eleven patterns — which
   * answers the wrong question. A blocklist passes everything it has not
   * heard of, and the package that phones home next will not be called
   * `analytics`. Six dependencies ship in this app and all six are readable
   * in an afternoon, so the list is the assertion: a seventh fails here
   * until somebody has looked at it and written it down.
   */
  it('ships exactly the six runtime dependencies that have been read', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies ?? {}).sort()).toEqual([
      'idb', // IndexedDB promises. Storage, and local by definition.
      'lucide-react', // Icons, compiled to inline SVG paths.
      'react',
      'react-dom',
      'wouter', // Hash routing, which never asks the network for anything.
      'zustand', // Stores in memory.
    ]);
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

/**
 * The app that ships, not only the source it was built from (PLAN.md M194).
 *
 * Everything above reads `src/`, the names in `package.json` and
 * `index.html`. All of it is true and none of it is about the artefact a
 * climber installs: a bundler emits code of its own, a service worker is
 * generated rather than written, and a dependency's network call lives in
 * `node_modules` where no sweep above can see it. So these read `dist/`.
 *
 * **What they found the first time they were run**, which is why the page's
 * first bullet changed with them: `fetch(` is in the shipped entry chunk —
 * Vite's module-preload polyfill, asking for the app's own chunks — and five
 * times in the workbox runtime, which is what an offline cache is for. The
 * app's own code still contains none, and *"no network requests at all"* was
 * never true of the build.
 *
 * `navigator.connection.downlink` is in the entry chunk too, from a
 * dependency. It reads a number the browser already has and sends nothing,
 * so it is not checked here — named because it looks like networking to
 * anyone reading the bundle and is not.
 */
const DIST = 'dist';
const built = existsSync(DIST);

/** Every file under `dist/`, so a sweep cannot miss one by knowing its name. */
function distFiles(dir = DIST): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...distFiles(path));
      continue;
    }
    out.push(path);
  }
  return out;
}

/** The newest modification time under a directory, tests excluded. */
function newest(paths: readonly string[]): { path: string; at: number } {
  let best = { path: '', at: 0 };
  for (const path of paths) {
    const at = statSync(path).mtimeMs;
    if (at > best.at) best = { path, at };
  }
  return best;
}

describe.runIf(built)('the app that ships', () => {
  const FILES = distFiles();
  const TEXT = FILES.filter((f) => /\.(js|css|html|webmanifest|json)$/.test(f)).map((path) => ({
    path,
    text: readFileSync(path, 'utf8'),
  }));

  /**
   * A build older than the source is a check that reads the previous
   * milestone's answer and passes on it. `perf.test.ts` records nearly
   * shipping red for exactly this, and a privacy guarantee is the worst
   * place for a test that cannot tell whether it checked anything.
   */
  it('was built from the source in the tree', () => {
    const sources = FILES_FOR_STALENESS;
    // A list that walked nothing dates from 1970 and is older than any
    // build, so this check would pass having compared nothing at all — the
    // mutation that found it emptied the list and survived.
    expect(sources.length).toBeGreaterThan(200);
    expect(sources).toContain('index.html');
    expect(sources).toContain('vite.config.ts');
    const src = newest(sources);
    const out = newest(FILES);
    expect(
      src.at <= out.at,
      `${src.path} is newer than everything in dist (${out.path}) — run npm run build first`,
    ).toBe(true);
  });

  it('reads enough of the build to be worth trusting', () => {
    expect(FILES.length).toBeGreaterThan(100);
    expect(TEXT.length).toBeGreaterThan(100);
    expect(FILES.some((f) => /assets\/index-.*\.js$/.test(f))).toBe(true);
    expect(FILES.some((f) => /^dist\/sw\.js$/.test(f))).toBe(true);
  });

  /**
   * Every absolute URL in the build, each one named and none of them a
   * request. Three are text a library prints or licenses itself with; the
   * `w3.org` ones are XML namespaces, which identify a vocabulary and are
   * never fetched.
   */
  it('names no host it could reach', () => {
    const ALLOWED = [
      'http://www.w3.org/2000/svg',
      'http://www.w3.org/1999/xlink',
      'http://www.w3.org/1998/Math/MathML',
      'http://www.w3.org/XML/1998/namespace',
      'https://react.dev/errors/', // React's minified-error decoder, in a message.
      'https://bit.ly/wb-precache', // A doc link in a workbox console warning.
      'https://tailwindcss.com', // The licence banner at the top of the stylesheet.
    ];
    const found = new Set<string>();
    for (const { text } of TEXT) {
      for (const url of text.match(/https?:\/\/[A-Za-z0-9._/-]+/g) ?? []) {
        if (!ALLOWED.some((ok) => url.startsWith(ok))) found.add(url);
      }
    }
    expect([...found]).toEqual([]);
  });

  /**
   * And the request primitives, by the file that holds them.
   *
   * The file set is the guarantee: a new chunk containing `fetch` is a new
   * thing asking for something, whoever wrote it. The counts below are
   * pinned too and are the softer half — a workbox release can move five to
   * six without meaning anything. A count that changes is a prompt to read
   * the diff, not to update the number.
   */
  const holding = (pattern: RegExp) =>
    TEXT.filter(({ text }) => pattern.test(text)).map(({ path }) => path);

  it('calls fetch only where the app fetches itself', () => {
    const files = holding(/\bfetch\(/);
    expect(files.map((f) => f.replace(/-[A-Za-z0-9_-]{8,}\./, '-*.')).sort()).toEqual([
      'dist/assets/index-*.js', // Vite's module-preload polyfill: the app's own chunks.
      'dist/workbox-*.js', // The offline cache, filling itself from the app's own assets.
    ]);
  });

  it.each([
    ['sendBeacon', /\bsendBeacon\b/],
    ['WebSocket', /\bWebSocket\b/],
    ['EventSource', /\bEventSource\b/],
  ])('ships no %s', (_name, pattern) => {
    expect(holding(pattern)).toEqual([]);
  });

  it('ships XMLHttpRequest only in the sentence denying it', () => {
    const files = holding(/\bXMLHttpRequest\b/);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/PrivacyPage-.*\.js$/);
  });

  it('would notice a request primitive that moved', () => {
    // The sweep has to be able to fail. A pattern the build really does
    // contain, asserted absent, is the control for every assertion above.
    expect(() => expect(holding(/\bfetch\(/)).toEqual([])).toThrow();
  });

  it('asks for nothing outside itself in the manifest', () => {
    const manifest = TEXT.find(({ path }) => path.endsWith('.webmanifest'));
    expect(manifest, 'no webmanifest in the build').toBeDefined();
    expect(manifest!.text).not.toMatch(/https?:\/\//);
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
    // The sentence that replaced the one the build disproved (PLAN.md M194).
    // Pinned for the same reason as the awkward ones above: saying what the
    // app does ask for is what makes "no network requests" safe to lose.
    'its page, its scripts and its icons',
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
  it.each([
    /encrypt/i,
    /anonymi[sz]/i,
    /\bwe (never|do not|don't)\b/i,
    /GDPR compliant/i,
    // The fifth is this page's own former first bullet (PLAN.md M194), and
    // the subject is the whole of it: *the app* makes no network requests is
    // disproved by the build — Vite's preload polyfill and the offline cache
    // both call `fetch` — while *the app's own code* makes none, which is
    // what the sweeps above prove. Pinned absent rather than only rewritten,
    // so the easier sentence cannot come back.
    /\bapp makes no network/i,
  ])(
    'does not claim %s',
    (pattern) => {
      expect(pattern.test(page)).toBe(false);
    },
  );
});
