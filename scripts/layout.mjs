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
 * one can actually be opened — **or stopping at a parameterised ancestor
 * already discovered** (PLAN.md M280).
 *
 * The original climbed past every path with a `:` in it, which is wrong
 * whenever the link lives on a detail page rather than on a listing.
 * `/train/:id/start` is linked from `ProgramDetailPage`, so climbing to
 * `/train` looked for a Start link on the program *list* and never found
 * one. `/train/:id` had already been discovered by then; the address it was
 * discovered at is the page to look on.
 *
 * The registry already carries the relationship — it is what draws the back
 * link — so this asks it rather than chopping segments off a path and
 * hoping. `/build/:id/session/:typeId` climbs two levels to `/build`.
 */
function listingFor(path, found) {
  let at = entryFor(path)?.parent ?? null;
  const seen = new Set();
  while (at !== null && !seen.has(at)) {
    seen.add(at);
    // A parameterised ancestor whose own address is already known.
    const already = found.get(at);
    if (already !== undefined) return already;
    if (!fill(at).includes(':')) return fill(at);
    at = entryFor(at)?.parent ?? null;
  }
  return null;
}

/**
 * Shortest first, so an ancestor is discovered before its children.
 *
 * `/train/:id` has to be in hand before `/train/:id/start` asks for it, and
 * the registry's order is the router's (longest pattern first, so the more
 * specific route wins) — the exact opposite of what discovery needs.
 */
const BY_DEPTH = (a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b);

/**
 * The viewports, and the one text size that is not the default (PLAN.md M300).
 *
 * `TEXT_SCALE` ships four — 0.92, 1, 1.15 and 1.3 — and this checked one of
 * them for twenty-nine milestones. Text scale is the largest multiplier on
 * layout there is: every size in the app is a `rem` utility and the setting
 * moves `--text-scale` on the root, so at `largest` every box, gap and line
 * grows by 30% at once. That is the class of thing this harness exists for,
 * and the two worst bugs the app has shipped (M225, M269) were both in it.
 *
 * One extra pass, not four. The smallest viewport at the largest text is
 * where it bites — anything that survives 360×640 at 1.3 survives 390×780
 * at 1.15 — and a fourth pass over every route costs about 35 seconds where
 * three more would cost nearly two minutes.
 *
 * ## And the app a new climber opens (PLAN.md M301)
 *
 * The four above load the sample climber before walking a route, and this
 * file said so itself: *"so no page is measured empty."* The empty lists,
 * the *not enough yet* cards and the front door with nothing behind it are
 * a different layout from the same routes with a year in them, and they are
 * the layout every install starts in.
 *
 * `seeded: false` skips the load. Three of them and about twenty seconds
 * each, because they reach only the 36 static routes — the detail routes
 * need a record a new climber has not got — and because the phone, the
 * large text and the mouse are three different ways for an empty page to be
 * wrong. Every pass then proves which it was; `provenEmpty` below says why.
 *
 * `pointer` rather than a name: the tap-target rule read
 * `size.name === 'desktop'`, so the first size added whose name was not
 * exactly that measured a mouse nav against the 44px finger target and
 * reported all five tabs too small on all 36 routes.
 */
const SIZES = [
  { name: 'phone', width: 390, height: 780 },
  { name: 'small', width: 360, height: 640 },
  { name: 'desktop', width: 1280, height: 900, pointer: 'mouse' },
  { name: 'large text', width: 360, height: 640, textSize: 'largest' },
  { name: 'empty', width: 360, height: 640, seeded: false },
  { name: 'empty large text', width: 360, height: 640, seeded: false, textSize: 'largest' },
  { name: 'empty desktop', width: 1280, height: 900, seeded: false, pointer: 'mouse' },
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

  /**
   * A target sitting in a block of text, which WCAG exempts (PLAN.md M280).
   *
   * The note above already says a link is text and is skipped for this
   * reason — and then this checked `button` regardless, so `Term`'s glossary
   * words came back as four failures on every guide page. A dotted-underlined
   * word inside a sentence is text in a block whichever tag renders it; the
   * exemption is about the shape, not the element.
   *
   * Three conditions, and each one is load-bearing:
   *
   * - **Inline-level**, because a block-level control is not in the sentence,
   *   it is under it.
   * - **In a text-flow parent.** A first draft allowed any parent, which
   *   exempted every button in a card that happened to hold a paragraph.
   *   `p`, `li`, `span` and their kind are where prose lives; a `div` is not.
   * - **With real prose beside it, once the other controls are taken out.**
   *   A second draft looked for a bare text node and missed the case it was
   *   written for — `Box Jumps` sits beside a `<span>`, not beside a text
   *   node. Removing the controls first is what stops a row of buttons
   *   counting each other's labels as the sentence they sit in.
   */
  const FLOW = new Set(['P', 'LI', 'SPAN', 'TD', 'DD', 'DT', 'FIGCAPTION', 'LABEL', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);
  const inProse = (el) => {
    if (!getComputedStyle(el).display.startsWith('inline')) return false;
    const parent = el.parentElement;
    if (!parent || !FLOW.has(parent.tagName)) return false;
    const clone = parent.cloneNode(true);
    for (const control of clone.querySelectorAll(SELECTOR)) control.remove();
    // Long enough to be a sentence rather than a separator between chips.
    return (clone.textContent ?? '').trim().length >= 12;
  };
  const small = [];
  for (const el of document.querySelectorAll(SELECTOR)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'inline') continue;
    if (inProse(el)) continue;
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

  /**
   * The one thing the app is opened to do, reachable without scrolling
   * (PLAN.md M294).
   *
   * Home only, because Home is the only screen with a designated primary
   * action — everywhere else "the main control" is a judgement and a check
   * built on one is a check that argues with you.
   *
   * Measured against the nav rather than the viewport: the tab bar sits
   * over the bottom of the page, so a button whose box is inside the window
   * and behind the nav is not reachable and reads as fine to
   * `getBoundingClientRect` alone. M239 moved this button up on a 430×932
   * phone and nothing noticed that it stayed under the nav on a 360×640
   * one, for fifty-four milestones.
   */
  const startNames = /^(Start session|Log a session|Quick log|Log rest day)$/;
  const start = [...document.querySelectorAll('main button, main a')].find((el) =>
    startNames.test((el.getAttribute('aria-label') ?? el.textContent ?? '').trim()),
  );
  /**
   * The bottom of the usable screen, which is not always the nav.
   *
   * On a phone the tab bar is fixed over the foot of the page, so it is the
   * fold. On desktop the same `nav` is at the top, and measuring against it
   * reports every button on the page as unreachable — which is what the
   * first version of this did, and the harness said so on its first run.
   * Sitting in the lower half is what makes it a floor.
   */
  const navBox = nav.getBoundingClientRect();
  const floor = navBox.top > window.innerHeight / 2 ? navBox.top : window.innerHeight;
  const action = start
    ? (() => {
        const b = start.getBoundingClientRect();
        const over = Math.round(b.bottom - floor);
        return {
          name: (start.textContent ?? '').trim().slice(0, 24),
          below: over > 1 ? over : 0,
        };
      })()
    : { missing: true };

  return {
    action,
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
/** And the ones that could not be reached, with why. */
let unreachable = new Map();
/**
 * Passes that the database itself said were empty, not passes that were
 * declared so (PLAN.md M301).
 *
 * The flag on a size is both the intent and the mechanism, so a mutation
 * that turns it into a label — `const seeded = true` — leaves a harness
 * that runs every pass seeded and still prints a line about the ones with
 * nothing logged. Counting what was observed instead, and failing when the
 * list promises an empty pass and none happened, is the only thing that
 * can tell the two apart from inside the script.
 */
let provenEmpty = 0;
const note = (where, what) => { failures.push(`${where}: ${what}`); };

for (const size of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const page = await ctx.newPage();
  // Seeded before the app boots rather than tapped through Settings: the
  // store reads this key on hydrate and puts `--text-scale` on the root,
  // so the very first paint is already at the size being checked.
  if (size.textSize) {
    await page.addInitScript((wanted) => {
      const key = 'project-ascent:device';
      let device = {};
      try { device = JSON.parse(localStorage.getItem(key) ?? '{}'); } catch { device = {}; }
      localStorage.setItem(key, JSON.stringify({ ...device, textSize: wanted }));
    }, size.textSize);
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const skip = page.getByRole('button', { name: 'Skip' });
  if (await skip.count()) { await skip.click(); await page.waitForTimeout(700); }
  /*
   * The app's own sample climber, so no page is measured empty — except by
   * the pass that is about the empty one (PLAN.md M301).
   *
   * And every pass then says which it was, rather than being trusted. A
   * pass that quietly loaded the sample climber anyway would measure the
   * same lived-in app as the ones above it and report green for it — the
   * shape `privacy.test.ts` names about `dist`: a check that reads exactly
   * like a check that ran. Settings offers *Load a sample climber* only
   * while the log is empty, so whether it is on screen afterwards is the
   * database answering, and the two cases are opposite answers.
   *
   * Checked after the load rather than inside the branch that does it: a
   * first version asked only on the unseeded side, so the one mutation
   * worth catching — the branch itself going — took the assertion with it.
   */
  const seeded = size.seeded !== false;
  const settings = async () => {
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.waitForTimeout(800);
    return page.getByRole('button', { name: 'Load a sample climber' });
  };
  if (seeded) {
    const load = await settings();
    if (await load.count()) { await load.click(); await page.waitForTimeout(2500); }
  }
  const offering = (await (await settings()).count()) > 0;
  if (offering === seeded) {
    throw new Error(
      seeded
        ? `the ${size.name} pass has nothing logged: Settings is still offering the sample climber`
        : `the ${size.name} pass is not unseeded: Settings is not offering the sample climber`,
    );
  }
  if (!seeded) provenEmpty += 1;

  // The detail routes, found by opening the page that lists them and
  // reading a real link — the ids belong to the sample climber and are
  // nobody's business to invent.
  // Never from the unseeded pass: it has no records, so discovery there
  // would mark every detail route unreachable for every size after it.
  if (discovered === null && size.seeded !== false) {
    discovered = new Map();
    unreachable = new Map();
    /** The first link on the open page whose address matches the pattern. */
    const linkMatching = (pattern) =>
      page.evaluate((src) => {
        const re = new RegExp(src);
        return [...document.querySelectorAll('a[href]')]
          .map((a) => a.getAttribute('href'))
          .find((h) => h !== null && re.test(h)) ?? null;
      }, pattern);

    for (const path of [...NEEDS_RECORD].sort(BY_DEPTH)) {
      const pattern = patternOf(path);
      const listing = listingFor(path, discovered);
      let href = null;

      if (listing !== null) {
        await page.evaluate((h) => { location.hash = `#${h}`; }, listing);
        await page.waitForTimeout(700);
        href = await linkMatching(pattern);
      }

      /**
       * The search sheet, which is the app's own index of everything
       * (PLAN.md M280).
       *
       * Three of these routes are linked from nowhere else: a guide's
       * sections and a benchmark's history are reachable through search and
       * through one disclosure each. Rather than teach this script where
       * every fold is, it asks the screen whose whole job is to list what
       * the app contains — and still reads a real link off it, so the rule
       * that ids belong to the sample climber and are nobody's business to
       * invent is kept.
       */
      if (href === null) {
        await page.evaluate(() => { location.hash = '#/'; });
        await page.waitForTimeout(400);
        const open = page.getByRole('button', { name: 'Search' });
        if (await open.count()) {
          await open.first().click();
          await page.waitForTimeout(500);
          // A vowel matches almost every title, which is what a list of
          // everything needs to be asked for.
          await page.keyboard.type('e');
          await page.waitForTimeout(700);
          href = await linkMatching(pattern);
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
        }
      }

      if (href !== null) discovered.set(path, href.replace(/^#/, ''));
      else unreachable.set(path, listing === null ? 'no listing in the registry' : `nothing on ${listing}, nor in search`);
    }
  }

  // A pass with nothing logged has none of the records the detail routes
  // need, and the ids the seeded passes found belong to a database this one
  // does not have. The static routes are the whole app a new climber can
  // reach anyway.
  const checking = [
    ...STATIC.map((path) => [path, fill(path)]),
    ...(size.seeded === false ? [] : [...discovered].map(([path, href]) => [path, href])),
  ];

  for (const [path, href] of checking) {
    errors.length = 0;
    await page.evaluate((h) => { location.hash = `#${h}`; }, href);
    await page.waitForTimeout(500);
    const r = await page.evaluate(readPage, {
      tabNames: TABS,
      // A property of the size, not of its name (PLAN.md M301). This read
      // `size.name === 'desktop'`, so the first size added whose name was
      // not exactly that — an unseeded desktop pass — measured a mouse nav
      // against the 44px finger target and reported all five tabs too
      // small on all 36 routes. A rule keyed on a label is a rule that is
      // one rename from silently changing what it checks.
      target: size.pointer === 'mouse' ? 0 : TARGET,
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
    /**
     * At the default text size only (PLAN.md M300).
     *
     * The large-text pass found this failing on its first run and the
     * honest reading is a trade rather than a defect. Measured at 1.3× on
     * 360×640, the day's button lands 143px under the nav with the
     * sample-data banner showing and about 21px under it without — and
     * what sits above it is the date, the week strip, the block line and
     * the card's own sentence about what today is. Every one of those is
     * content a climber asked to see bigger.
     *
     * So a climber who has turned text up 30% scrolls once to start a
     * session, and that is the right loss: the alternative is cutting what
     * they enlarged the text to read. The pass still checks everything
     * else at that size — tabs on screen, target sizes, sideways spill,
     * the document not scrolling — which is where large text usually
     * breaks things.
     */
    if (path === '/' && r.action && !size.textSize) {
      if (r.action.missing) note(at, 'no way to start or log a session');
      else if (r.action.below) {
        note(at, `the day's button is ${r.action.below}px under the nav (${r.action.name})`);
      }
    }
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
  if (size.pointer !== 'mouse') {
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

  /**
   * And the screen changing size under a document that is already open
   * (PLAN.md M302).
   *
   * Reported from an installed app: the bottom bar gone after *Update
   * now*, the page otherwise normal and styled, back on a force-close.
   * The shell is one `overflow-hidden` box the height of the viewport, so
   * a height that no longer matches the screen puts its last row — the tab
   * bar — past the bottom edge, with nothing to scroll to reach it.
   * Reproduced by pinning the height above the viewport and changing
   * nothing else: all five tabs off screen.
   *
   * Every route above is measured at a size that never moves, which is the
   * one thing a phone's viewport never does — system bars, the keyboard,
   * rotation, and a WebView coming back from the task switcher. This
   * shrinks the window under a live document and asks the same question.
   */
  if (size.pointer !== 'mouse') {
    await page.evaluate(() => { location.hash = '#/'; });
    await page.waitForTimeout(400);
    for (const height of [size.height - 120, size.height - 260]) {
      await page.setViewportSize({ width: size.width, height });
      await page.waitForTimeout(400);
      const r = await page.evaluate(readPage, { tabNames: TABS, target: TARGET });
      const at = `${size.name} shrunk to ${height}px`;
      if (r.fatal) note(at, r.fatal);
      else if (r.tabsOff.length) note(at, `tabs off screen: ${r.tabsOff.join(', ')}`);
      else if (r.docScrolls) note(at, 'the document scrolls (M225: only `main` may)');
    }
    await page.setViewportSize({ width: size.width, height: size.height });
  }

  await ctx.close();
}
await browser.close();

const found = discovered ?? new Map();
const unseeded = SIZES.filter((z) => z.seeded === false).length;
if (unseeded > 0 && provenEmpty === 0) {
  failures.push(`${unseeded} passes are declared unseeded and none of them ran against an empty log`);
}
console.log(
  `${STATIC.length + found.size} routes × ${SIZES.length - unseeded} sizes` +
    (provenEmpty > 0 ? `, and ${STATIC.length} × ${provenEmpty} with nothing logged` : '') +
    ', plus the banner squeeze.',
);
if (found.size) console.log(`found a record for: ${[...found.keys()].join(' ')}`);
/**
 * Named with a reason, not just listed (PLAN.md M280).
 *
 * "No record to point at" is true of a route the sample climber has no
 * record for and of one this script simply cannot navigate to, and those
 * want opposite fixes. Six routes sat under that line for ten milestones
 * because the line did not say which.
 */
if (unreachable.size) {
  console.log('not checked:');
  for (const [path, why] of unreachable) console.log(`  ${path} — ${why}`);
}
if (failures.length === 0) {
  console.log('\nlayout OK');
} else {
  console.log(`\n${failures.length} problem${failures.length === 1 ? '' : 's'}:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exitCode = 1;
}
