/**
 * The first load, and the line it is held under (PLAN.md M328).
 *
 * `src/perf.test.ts` has measured this since M78 and `npm run bundle`
 * reports it; one function and one number here, so the tool cannot tell a
 * climber-facing change it fits when the test is about to say it does not.
 * The history of the number — every milestone that moved it and why — is in
 * the test, beside the checks that hold it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

/** Kilobytes, gzipped. See `perf.test.ts` for why it is where it is. */
export const BUDGET = 129.1;

/**
 * A sourcemap build appends this, and the shipped build does not. Only the
 * comment and its own line end: the shipped chunk ends in a newline too, and
 * taking that as well made a map build read one byte light.
 */
const MAP_COMMENT = /\/\/# sourceMappingURL=[^\n]*\n?$/;

/** The entry chunk's file name, read from the page that loads it. */
export function entryName(dir = 'dist') {
  const html = readFileSync(`${dir}/index.html`, 'utf8');
  const entry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1];
  if (entry === undefined) throw new Error(`no entry chunk in ${dir}/index.html`);
  return entry;
}

/**
 * The first load, gzipped: the entry chunk plus every stylesheet.
 *
 * The sourcemap comment is taken off before measuring, so a build made with
 * maps — which is how `npm run bundle` reads one — measures what ships.
 */
export function firstLoad(dir = 'dist') {
  const assets = `${dir}/assets`;
  const entry = entryName(dir);
  const code = readFileSync(`${assets}/${entry}`, 'utf8').replace(MAP_COMMENT, '');
  const js = gzipSync(Buffer.from(code)).length;
  const css = readdirSync(assets)
    .filter((f) => f.endsWith('.css'))
    // Stylesheets are measured as written: a build's `--sourcemap` maps the
    // scripts, and Vite writes CSS maps only in development.
    .reduce((n, f) => n + gzipSync(readFileSync(`${assets}/${f}`)).length, 0);
  return { entry, js, css, kb: (js + css) / 1024 };
}
