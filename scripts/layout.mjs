/**
 * The layout invariants, in a real browser (PLAN.md M270).
 *
 * The suite is 6,608 tests and cannot see any of this. jsdom has no layout
 * engine: every box it reports is zero, so a nav pushed off the bottom of
 * the screen and a nav sitting under the browser's chrome both read as
 * perfectly fine. The two worst bugs this app has shipped were exactly
 * those — M225 and M269 — and both were found by a person on a phone
 * rather than by anything in `src`.
 *
 * So these are the four facts a page has to be able to state about itself,
 * checked where they are decided. They are deliberately few: this is a
 * smoke check to run before shipping something that moves the shell, not a
 * second test suite.
 *
 * Run:  npm run build && npm run preview &
 *       node scripts/layout.mjs [--port 4173]
 *
 * Playwright is not a dependency of the app, for the reason `shots.mjs`
 * gives: it is a tool for the person publishing. Point PLAYWRIGHT at an
 * installed copy and CHROMIUM at a browser if they are not resolvable.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const PORT = flag('port', '4173');
const SERVED_AT =
  /^const BASE = '([^']+)';$/m.exec(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'))?.[1] ?? '/';
const BASE = `http://localhost:${PORT}${SERVED_AT}`;

/**
 * The routes, read from the registry rather than listed here.
 *
 * `shots.mjs` lists its own and has been photographing `#/climber` — a
 * route M118 split in two and deleted — since that milestone, which is a
 * store screenshot of the Not-found page. A list that cannot drift is
 * worth the regex.
 */
const ENTRIES = [...readFileSync(new URL('../src/ui/routes.ts', import.meta.url), 'utf8')
  .matchAll(/^\s*\{ path: '([^']+)'[^\n]*?parent: (?:'([^']+)'|null)/gm)]
  .map((m) => ({ path: m[1], parent: m[2] ?? null }));
const ROUTES = ENTRIES.map((e) => e.path);
if (ROUTES.length < 20) throw new Error(`Only ${ROUTES.length} routes read from routes.ts — the regex has drifted`);
const entryFor = (path) => ENTRIES.find((e) => e.path === path);

const TODAY = new Date().toISOString().slice(0, 10);
/** Parameterised routes need a value that exists. These are the ones a
 *  seeded climber really has; the rest are reported as skipped. */
const FILLED = { ':date': TODAY, ':year': TODAY.slice(0, 4), ':start': TODAY };
const fill = (path) => path.replace(/:[a-zA-Z]+/g, (p) => FILLED[p] ?? p);
const STATIC = ROUTES.filter((p) => !fill(p).includes(':'));
const NEEDS_RECORD = ROUTES.filter((p) => fill(p).includes(':'));

/**
 * What a detail route's address looks like, as a pattern.
 *
 * `/projects/:id` becomes `^#/projects/[^/]+$`, which is what a link on the
 * listing page will match.
 */
const patternOf = (path) => `^#${path.replace(/:[A-Za-z]+/g, '[^/]+').replace(/\//g, '\\/')}$`;

/**
 * The page that lists a detail route's records, walking up `parent` until
 * one can actually be opened.
 *
 * The registry already carries the relationship — it is what draws the back
 * link — so this asks it rather than chopping segments off a path and
 * hoping. `/build/:id/session/:typeId` climbs two levels to `/build`.
 */
function listingFor(path) {
  let at = entryFor(path)?.parent ?? null;
  const seen = new Set();
  while (at !== null && !seen.has(at)) {
    seen.add(at);
    if (!fill(at).includes(':')) return fill(at);
    at = entryFor(at)?.parent ?? null;
  }
  return null;
}

const SIZES = [
  { name: 'phone', width: 390, height: 780 },
  { name: 'small', width: 360, height: 640 },
  { name: 'desktop', width: 1280, height: 900 },
];

const TABS = ['Home', 'Train', 'Calendar', 'Progress', 'Game'];
/** The app's own tap target, quoted in `lib/marks.ts` and `TallyRow`. */
const TARGET = 44;

/** Everything measured in one pass, so a page is read once. Takes a single
 *  argument because that is all `page.evaluate` passes through. */
function readPage({ tabNames, target }) {
  const nav = document.querySelector('nav[aria-label="Main"]');
  const doc = document.scrollingElement;
  const main = document.getElementById('main');
  if (!nav) return { fatal: 'no nav' };
  const within = (b) =>
    b.width > 0 && b.height > 0 && b.top >= -1 && b.left >= -1 &&
    b.bottom <= window.innerHeight + 1 && b.right <= window.innerWidth + 1;
  const tabs = tabNames.map((name) => {
    const el = [...nav.querySelectorAll('a')].find((a) => (a.textContent ?? '').trim() === name);
    if (!el) return { name, missing: true };
    const b = el.getBoundingClientRect();
    return { name, on: within(b), h: Math.round(b.height), w: Math.round(b.width) };
  });
  /**
   * Controls smaller than the floor the app already commits to.
   *
   * 24px, not 44: `ui.test.ts` holds `Button.tsx` to the WCAG 2.2 AA
   * minimum and 44 is the aspiration `IconButton` meets, not the rule.
   *
   * Buttons and form controls only. A link is text, and WCAG exempts a
   * target in a block of text from having a size of its own — the first
   * draft of this checked links too and reported the skip link, every
   * "Open the week →" and nothing anybody would act on, which is a probe
   * measuring its own noise.
   */
  /**
   * Clipped out of sight — `sr-only` and anything like it.
   *
   * Checked up the ancestry, not just on the element: the charts put their
   * data table inside an `sr-only` wrapper, and the table itself lays out
   * at its natural 372px while being clipped to a single pixel. The first
   * draft reported those as content off the side of a 390px screen, which
   * is a probe measuring something nobody can see.
   */
  const hidden = (el) => {
    for (let at = el; at && at !== document.body; at = at.parentElement) {
      const cs = getComputedStyle(at);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (cs.clipPath !== 'none' || cs.clip !== 'auto') return true;
    }
    return false;
  };

  const SELECTOR = 'button, input, select, textarea, summary, [role="button"], [role="tab"]';
  const small = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline') continue;
    // A skip link is 1×1 until it is focused, and a screen-reader label is
    // not a target at all.
    if (hidden(el)) continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    const side = Math.min(b.width, b.height);
    if (side + 0.5 >= 24) continue;
    const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 28);
    const kind = el.getAttribute('type') ?? el.getAttribute('role') ?? '';
    const cls = (el.getAttribute('class') ?? '').slice(0, 30);
    small.push(
      `${el.tagName.toLowerCase()}${kind ? `[${kind}]` : ''}${name ? ` "${name}"` : ''}` +
      `${cls ? ` .${cls}` : ''} ${Math.round(b.width)}×${Math.round(b.height)}`,
    );
  }

  /**
   * Content off the side of the page.
   *
   * Anything under a box that scrolls sideways on purpose is skipped — a
   * wide table in its own scroller is a decision, not a defect.
   */
  const spill = [];
  if (main) {
    const edge = main.getBoundingClientRect().right;
    const scrollers = [...main.querySelectorAll('*')].filter((el) => {
      const ox = getComputedStyle(el).overflowX;
      return ox === 'auto' || ox === 'scroll';
    });
    for (const el of main.querySelectorAll('*')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) continue;
      if (b.right <= edge + 1) continue;
      if (scrollers.some((sc) => sc !== el && sc.contains(el))) continue;
      if (hidden(el)) continue;
      const cls = (el.getAttribute('class') ?? '').slice(0, 40);
      spill.push(`${el.tagName.toLowerCase()}.${cls} to ${Math.round(b.right)} (edge ${Math.round(edge)})`);
    }
  }

  return {
    tabsOff: tabs.filter((t) => t.missing || !t.on).map((t) => t.name),
    tooSmall: tabs.filter((t) => !t.missing && t.h + 0.5 < target).map((t) => `${t.name} ${t.h}px`),
    docScrolls: doc.scrollHeight > doc.clientHeight + 1,
    pageWide: doc.scrollWidth > doc.clientWidth + 1,
    mainWide: main ? main.scrollWidth > main.clientWidth + 1 : false,
    small: [...new Set(small)].slice(0, 4),
    spill: [...new Set(spill)].slice(0, 3),
  };
}

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });

const failures = [];
/** Detail-route addresses, found once and reused at every size. */
let discovered = null;
const note = (where, what) => { failures.push(`${where}: ${what}`); };

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(700); }
  // The app's own sample climber, so no page is measured empty.
  await page.evaluate(() => { location.hash = '#/settings'; });
  await page.waitForTimeout(800);
  const load = page.getByRole('button', { name: 'Load a sample climber' });
  if (await load.count()) { await load.click(); await page.waitForTimeout(2500); }

  // The detail routes, found by opening the page that lists them and
  // reading a real link — the ids belong to the sample climber and are
  // nobody's business to invent.
  if (discovered === null) {
    discovered = new Map();
    for (const path of NEEDS_RECORD) {
      const listing = listingFor(path);
      if (listing === null) continue;
      await page.evaluate((h) => { location.hash = `#${h}`; }, listing);
      await page.waitForTimeout(700);
      const href = await page.evaluate((src) => {
        const re = new RegExp(src);
        return [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .find((h) => h !== null && re.test(h)) ?? null;
      }, patternOf(path));
      if (href !== null) discovered.set(path, href.replace(/^#/, ''));
    }
  }

  const checking = [
    ...STATIC.map((path) => [path, fill(path)]),
    ...[...discovered].map(([path, href]) => [path, href]),
  ];

  for (const [path, href] of checking) {
    errors.length = 0;
    await page.evaluate((h) => { location.hash = `#${h}`; }, href);
    await page.waitForTimeout(500);
    const r = await page.evaluate(readPage, {
      tabNames: TABS,
      target: size.name === 'desktop' ? 0 : TARGET,
    });
    const at = `${size.name} ${path}`;
    if (r.fatal) { note(at, r.fatal); continue; }
    if (r.tabsOff.length) note(at, `tabs off screen: ${r.tabsOff.join(', ')}`);
    if (r.tooSmall.length) note(at, `tab under ${TARGET}px: ${r.tooSmall.join(', ')}`);
    if (r.docScrolls) note(at, 'the document scrolls (M225: only `main` may)');
    if (r.pageWide) note(at, 'the page scrolls sideways');
    if (r.mainWide) note(at, '`main` scrolls sideways');
    if (r.small.length) note(at, `control under 24px: ${r.small.join('; ')}`);
    if (r.spill.length) note(at, `off the side: ${r.spill.join('; ')}`);
    if (errors.length) note(at, `threw: ${errors[0]}`);
  }

  /**
   * The squeeze (PLAN.md M269).
   *
   * The banners render inside the nav, so anything that appears there adds
   * to its height — and the tab row must survive any of it. Padding the
   * banner box is the only way to reach the state from outside: a real
   * stack tall enough needs a storage warning, an update prompt and a live
   * session at once.
   */
  if (size.name !== 'desktop') {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(400);
    for (const extra of [400, 800]) {
      await page.evaluate((h) => {
        const box = document.querySelector('nav[aria-label="Main"] > div');
        let pad = document.getElementById('layout-pad');
        if (!pad) { pad = document.createElement('div'); pad.id = 'layout-pad'; box.appendChild(pad); }
        pad.style.height = `${h}px`;
      }, extra);
      const r = await page.evaluate(readPage, { tabNames: TABS, target: TARGET });
      const at = `${size.name} banner +${extra}px`;
      if (r.fatal) note(at, r.fatal);
      else if (r.tabsOff.length) note(at, `tabs off screen: ${r.tabsOff.join(', ')}`);
    }
    await page.evaluate(() => document.getElementById('layout-pad')?.remove());
  }

  await ctx.close();
}
await browser.close();

const found = discovered ?? new Map();
console.log(`${STATIC.length + found.size} routes × ${SIZES.length} sizes, plus the banner squeeze.`);
if (found.size) console.log(`found a record for: ${[...found.keys()].join(' ')}`);
const missing = NEEDS_RECORD.filter((p) => !found.has(p));
if (missing.length) console.log(`no record to point at: ${missing.join(' ')}`);
if (failures.length === 0) {
  console.log('\nlayout OK');
} else {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
