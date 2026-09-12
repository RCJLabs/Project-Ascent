/**
 * The store screenshot set, taken from the sample climber (PLAN.md M110).
 *
 * M12 needs pictures of an app that looks lived in, and every browser
 * verification in this repo has so far hand-rolled a fixture into IndexedDB
 * through a throwaway script. This is the kept version of that: it loads
 * the same seeded climber the app ships, at the sizes Play asks for, in
 * both themes.
 *
 * Run:  npm run build && npm run preview &
 *       node scripts/shots.mjs [--out shots] [--port 4173]
 *
 * Playwright is not a dependency of the app and is not installed by it —
 * this is a tool for the person publishing, not part of the build. Point
 * PLAYWRIGHT at an installed copy if it is not resolvable.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const OUT = flag('out', 'shots');
const PORT = flag('port', '4173');
/** Read from the config, not repeated: M12 moved the app to a domain root
 *  and a second copy of the old path here would have served 404s silently. */
const SERVED_AT =
  /^const BASE = '([^']+)';$/m.exec(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'))?.[1] ?? '/';
const BASE = `http://localhost:${PORT}${SERVED_AT}`;

/** Play wants a phone and a tablet; the third is for the web listing. */
const SIZES = [
  { name: 'phone', width: 412, height: 915 },
  { name: 'tablet', width: 800, height: 1280 },
];

/** The pages worth showing, and what each one is for. */
const PAGES = [
  ['home', '#/'],
  ['train', '#/train'],
  ['progress', '#/progress'],
  ['calendar', '#/calendar'],
  ['projects', '#/projects'],
  ['climber', '#/climber'],
  ['coach', '#/coach'],
  ['career', '#/career'],
];

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright-core');

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });

for (const size of SIZES) {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.error(`  ! ${e.message}`));

    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.evaluate((t) => localStorage.setItem('project-ascent:device', JSON.stringify({ theme: t })), theme);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    // A fresh install opens on the baseline flow and holds every other
    // route until it is dealt with, so the first thing to do is what a
    // person does: skip it. Without this the whole run photographs the
    // welcome screen.
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.count()) {
      await skip.click();
      await page.waitForTimeout(900);
    }

    // Through the app's own button, so the screenshots show exactly what a
    // climber tapping it gets — not a fixture that drifts from it.
    await page.evaluate(() => { location.hash = '#/settings'; });
    await page.waitForTimeout(900);
    const load = page.getByRole('button', { name: 'Load a sample climber' });
    if (await load.count()) {
      await load.click();
      await page.waitForTimeout(2500);
    } else if (!(await page.getByText('Clear the sample data').count())) {
      throw new Error('Could not reach the sample-data button — is the log empty?');
    }

    for (const [name, hash] of PAGES) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(1200);
      // A hash change keeps the scroll position, so without this every
      // shot after the first starts wherever the last one ended — and the
      // sample-data banner at the top of the page is never in frame.
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      const file = `${OUT}/${size.name}-${theme}-${name}.png`;
      await page.screenshot({ path: file });
      console.log(file);
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\n${SIZES.length * 2 * PAGES.length} screenshots in ${OUT}/`);
