/**
 * The app that is actually being served (PLAN.md M300).
 *
 * Every other check in this repo runs against `dist` through `vite preview`
 * — the suite, the budget, the layout harness. That proves the artefact is
 * right and says nothing about whether it reached anybody. Between the two
 * sit the parts most likely to go wrong quietly: the Pages upload, the
 * custom domain, the base path, and a service worker that can serve a
 * previous version of the app for as long as it likes.
 *
 * So this loads the real URL after the deploy and asks three things:
 *
 * 1. **Is the thing being served the thing that was just built?** The entry
 *    chunk's name carries a content hash, so the built name matching the
 *    served name is the whole question in one string.
 * 2. **Does it boot?** The HTML is a shell; everything a climber sees is
 *    rendered. A 200 on an empty page is a deploy that "worked".
 * 3. **Does the service worker register?** It is what makes the app work on
 *    a phone in a gym basement, and nothing else in CI has ever exercised
 *    it.
 * 4. **Is `/.well-known/assetlinks.json` there, as JSON?** (PLAN.md M329.)
 *    The file Android reads before letting the Play Store app open without
 *    a URL bar. The Pages upload drops every dot-named path unless told
 *    not to, so this is the one file a green deploy can lose without
 *    anything else noticing.
 *
 * It gates nothing, by construction: it runs after the deploy, so a failure
 * is a report rather than a block. That is the right blast radius for a
 * check whose first failure mode is a CDN being slow.
 *
 * Run:  URL=https://… ENTRY=index-abc123.js node scripts/live.mjs
 */
import { createRequire } from 'node:module';

const URL_ = process.env.URL;
const ENTRY = process.env.ENTRY;
if (!URL_) {
  console.error('URL is not set — nothing to check.');
  process.exit(1);
}

/** Pages can take a minute to serve what was just uploaded. */
const WAIT_MS = Number(process.env.WAIT_MS ?? 180_000);
const EVERY_MS = 5_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function servedHtml() {
  // `cache: 'no-store'` is not enough against a CDN, so the query string is.
  const res = await fetch(`${URL_}?live=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

/**
 * Wait for the served HTML to name the chunk that was just built.
 *
 * Without `ENTRY` this only waits for the page to answer at all, which is
 * what a manual run wants.
 */
async function waitForBuild() {
  const until = Date.now() + WAIT_MS;
  let last = 'never answered';
  while (Date.now() < until) {
    try {
      const html = await servedHtml();
      if (!ENTRY) return html;
      if (html.includes(ENTRY)) return html;
      last = `serving a different build than ${ENTRY}`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
    await sleep(EVERY_MS);
  }
  throw new Error(`${URL_} is ${last} after ${Math.round(WAIT_MS / 1000)}s`);
}

try {
  await waitForBuild();
} catch (e) {
  // A message, not a stack: the one thing a reader of this job needs is
  // which of the two it was — the site never answered, or it answered with
  // a different build than the one that just shipped.
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
console.log(`serving: ${ENTRY ? `${ENTRY} ✓` : 'answered'}`);

const problems = [];

// A statement list — the file is `[]` until the app is signed, and an empty
// list is an honest one. What must not happen is a 404, or the app shell
// served in its place.
try {
  const links = await fetch(new URL(`.well-known/assetlinks.json?live=${Date.now()}`, URL_), { cache: 'no-store' });
  const body = await links.text();
  if (!links.ok) problems.push(`assetlinks.json is ${links.status} ${links.statusText}`);
  // What the file's absence looks like behind a fallback: a 200, and the page.
  else if (body.trimStart().startsWith('<')) problems.push('assetlinks.json is missing — the app shell was served in its place');
  else if (!Array.isArray(JSON.parse(body))) problems.push('assetlinks.json is not a statement list');
  else console.log('assetlinks.json: served');
} catch (e) {
  problems.push(`assetlinks.json did not parse: ${e instanceof Error ? e.message : String(e)}`);
}

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT ?? 'playwright-core');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? undefined });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(URL_, { waitUntil: 'networkidle' });

  // Rendered, not merely returned. A 200 on a shell that never boots is the
  // failure this is here for.
  const heading = await page
    .locator('h1, [role="heading"]')
    .first()
    .textContent({ timeout: 20_000 })
    .catch(() => null);
  if (!heading || heading.trim() === '') problems.push('the page returned but nothing rendered');
  else console.log(`rendered: ${heading.trim().slice(0, 40)}`);

  // The nav is the shell, and the thing M225 and M269 broke.
  const tabs = await page.locator('nav a').count();
  if (tabs < 5) problems.push(`the nav has ${tabs} tabs, not 5`);
  else console.log('nav: 5 tabs');

  // Offline is the whole premise; nothing else in CI registers one.
  const sw = await page
    .waitForFunction(async () => Boolean(await navigator.serviceWorker?.getRegistration()), null, {
      timeout: 30_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!sw) problems.push('no service worker registered');
  else console.log('service worker: registered');

  if (errors.length > 0) problems.push(`threw: ${errors[0]}`);
} finally {
  await browser.close();
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log('\nthe deployed app is the one that was built, and it boots');
