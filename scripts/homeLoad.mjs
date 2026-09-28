/**
 * What a cold Home load fetches, and the line it is held under (PLAN.md M346).
 *
 * `firstLoad.mjs` measures the entry chunk and the stylesheet — what has to
 * be parsed before the first paint. It cannot see what Home fetches a moment
 * later: the coach card, the stats, the tips and everything they import.
 * M345 showed why that matters. The first load fell by 9KB and Home's
 * download by 0.6, because most of what left the entry was fetched straight
 * after it by Home's own cards. Nothing held that second number, and a card
 * that grew, or a catalogue that did, would have gone by unseen.
 *
 * ## How
 *
 * Chromium, a fresh profile, the service worker blocked and the cache off:
 * `#/` opened and left until the network is idle, and every file it asked
 * for under `assets/` gzipped the way `firstLoad.mjs` gzips — the same
 * files, byte for byte, read from `dist/`. Twice, once empty and once with
 * the sample climber, because a card that only draws with data could fetch
 * a chunk only one of them sees. Today they fetch the same files, and the
 * line is held against whichever is larger.
 *
 * It was measured to be deterministic before it was trusted: five runs of
 * each, the same 45 files every time, and nothing more requested in the
 * three seconds after the network went idle.
 *
 * ## The line
 *
 * The same ratchet as the first load's: over `HOME_BUDGET` fails, and so
 * does more than `HOME_SLACK` under it, so a saving has to lower the line
 * in the commit that makes it.
 *
 * Run:  npm run build && npm run preview &
 *       npm run homeload [-- --port 4173]
 *
 * Playwright is not a dependency of the app, for the reason `layout.mjs`
 * gives. Point PLAYWRIGHT at an installed copy and CHROMIUM at a browser if
 * they are not resolvable.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

/** Kilobytes, gzipped, for everything a cold Home load fetches. */
export const HOME_BUDGET = 225.4;

/** How far under the line a measurement may sit before the line has to come down. */
export const HOME_SLACK = 1.5;

/**
 * The files, sized as `firstLoad.mjs` sizes the entry: gzipped at the
 * default level, largest first.
 *
 * A name the browser asked for that is not in `dir` throws. It means the
 * server was serving some other build than the one being sized, and a total
 * over the wrong files is worse than none.
 */
export function total(names, dir = 'dist/assets') {
  const files = [...new Set(names)].map((name) => {
    const file = path.join(dir, name);
    if (!existsSync(file)) throw new Error(`${name} was fetched but is not in ${dir}: is the preview serving this build?`);
    return { name, gzip: gzipSync(readFileSync(file)).length };
  });
  files.sort((a, b) => b.gzip - a.gzip || (a.name < b.name ? -1 : 1));
  return { kb: files.reduce((sum, f) => sum + f.gzip, 0) / 1024, files };
}

/** What is wrong with a measurement against the line, in words; empty when nothing is. */
export function judge(kb, budget = HOME_BUDGET, slack = HOME_SLACK) {
  const problems = [];
  if (kb >= budget) {
    problems.push(`a cold Home load is ${kb.toFixed(2)}KB gzipped, over the ${budget}KB line`);
  }
  if (budget - kb >= slack) {
    problems.push(
      `a cold Home load is ${kb.toFixed(2)}KB, ${(budget - kb).toFixed(2)}KB under the ${budget}KB line — ` +
        `lower HOME_BUDGET so the saving is kept`,
    );
  }
  return problems;
}

/** Files one set has that the other does not, by name. */
export function differ(a, b) {
  const inB = new Set(b);
  const inA = new Set(a);
  return { onlyA: [...inA].filter((x) => !inB.has(x)).sort(), onlyB: [...inB].filter((x) => !inA.has(x)).sort() };
}

/**
 * One cold load of `#/`, the files under `assets/` it asked for.
 *
 * On a page of its own, opened after any setup has finished, so nothing
 * still in flight from loading the sample climber is counted.
 */
async function record(browser, base, seeded) {
  const context = await browser.newContext({ viewport: { width: 430, height: 900 }, serviceWorkers: 'block' });
  try {
    if (seeded) {
      const setup = await context.newPage();
      await setup.goto(`${base}#/settings`, { waitUntil: 'networkidle' });
      const skip = setup.getByRole('button', { name: 'Skip' });
      if (await skip.count()) await skip.click();
      await setup.evaluate(() => {
        location.hash = '#/settings';
      });
      await setup.getByRole('button', { name: 'Load a sample climber' }).click();
      await setup.getByText(/Sample data loaded/).first().waitFor();
      await setup.close();
    }
    const page = await context.newPage();
    const assets = new URL('assets/', base).pathname;
    const seen = [];
    page.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith(assets)) seen.push(pathname.slice(assets.length));
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await page.goto(`${base}#/`, { waitUntil: 'networkidle' });
    // Home, and not a page that happened to load instead of it.
    await page.getByRole('heading', { level: 1 }).first().waitFor();
    return seen;
  } finally {
    await context.close();
  }
}

async function main(argv) {
  const at = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const port = at('port', '4173');
  const servedAt =
    /^const BASE = '([^']+)';$/m.exec(readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8'))?.[1] ?? '/';
  const base = `http://localhost:${port}${servedAt}`;

  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright-core');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
  let empty;
  let sample;
  try {
    empty = await record(browser, base, false);
    sample = await record(browser, base, true);
  } finally {
    await browser.close();
  }

  const measured = [total(empty), total(sample)];
  const worst = measured[0].kb >= measured[1].kb ? 0 : 1;
  const { kb, files } = measured[worst];
  console.log(
    `A cold Home load fetches ${files.length} files, ${kb.toFixed(2)}KB gzipped ` +
      `(empty ${measured[0].kb.toFixed(2)}, with the sample climber ${measured[1].kb.toFixed(2)}); ` +
      `line ${HOME_BUDGET}KB, ${(HOME_BUDGET - kb).toFixed(2)}KB under it.`,
  );
  const { onlyA, onlyB } = differ(empty, sample);
  if (onlyA.length + onlyB.length > 0) {
    console.log(`The two loads fetch different files:`);
    for (const name of onlyA) console.log(`  only when empty:        ${name}`);
    for (const name of onlyB) console.log(`  only with the climber:  ${name}`);
  }
  console.log(`\nLargest first, gzipped:`);
  for (const f of files.slice(0, 12)) console.log(`  ${(f.gzip / 1024).toFixed(2).padStart(6)}KB  ${f.name}`);
  if (files.length > 12) console.log(`  … and ${files.length - 12} more`);

  const problems = judge(kb);
  for (const problem of problems) console.error(`\n${problem}`);
  if (problems.length > 0) process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
