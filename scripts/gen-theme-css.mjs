/**
 * Write the default theme's variables into index.css from src/ui/themes.ts.
 *
 * index.css exists so the very first frame is painted before any script
 * runs, which makes it a duplicate of the theme data. Generating it — and
 * asserting the two agree in themes.test.ts — is the only honest way to
 * keep one.
 *
 * Run: node scripts/gen-theme-css.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ts = readFileSync('src/ui/themes.ts', 'utf8');

/** Pull an object literal's `key: '#hex'` pairs out of the source. */
function pairs(block) {
  return [...block.matchAll(/(\w+): '(#[0-9a-f]{6})'/g)].map((m) => [m[1], m[2]]);
}

function slice(from, to) {
  const start = ts.indexOf(from);
  if (start < 0) throw new Error(`missing ${from}`);
  const end = ts.indexOf(to, start + from.length);
  return ts.slice(start, end < 0 ? undefined : end);
}

const VAR = Object.fromEntries(
  [...slice('export const CSS_VAR', '};').matchAll(/(\w+): '(--[\w-]+)'/g)].map((m) => [m[1], m[2]]),
);
if (Object.keys(VAR).length === 0) throw new Error('no CSS_VAR entries parsed');
const STATUS_VAR = Object.fromEntries(
  [...slice('export const STATUS_VAR', '} as const;').matchAll(/(\w+): '(--[\w-]+)'/g)].map((m) => [m[1], m[2]]),
);

const alpine = slice('const ALPINE: Theme = {', 'const SLATE');
const light = Object.fromEntries(pairs(alpine.slice(alpine.indexOf('light: {'), alpine.indexOf('dark: {'))));
const dark = Object.fromEntries(pairs(alpine.slice(alpine.indexOf('dark: {'))));

const statusBlock = slice('export const STATUS:', '};');
const statusLight = Object.fromEntries(pairs(statusBlock.slice(statusBlock.indexOf('light:'), statusBlock.indexOf('dark:'))));
const statusDark = Object.fromEntries(pairs(statusBlock.slice(statusBlock.indexOf('dark:'))));

const render = (palette, status, indent) =>
  [
    ...Object.entries(VAR).map(([key, v]) => `${indent}${v}: ${palette[key]};`),
    ...Object.entries(STATUS_VAR).map(([key, v]) => `${indent}${v}: ${status[key]};`),
  ].join('\n');

let css = readFileSync('src/index.css', 'utf8');

const replaceBlock = (open, close, body) => {
  const start = css.indexOf(open);
  if (start < 0) throw new Error(`index.css has no ${open}`);
  const end = css.indexOf(close, start);
  css = css.slice(0, start + open.length) + '\n' + body + '\n' + css.slice(end);
};

replaceBlock(':root {', '\n}', render(light, statusLight, '  '));
replaceBlock("[data-theme='dark'] {", '\n}', render(dark, statusDark, '  '));
replaceBlock(':root:not([data-theme=\'light\']) {', '\n  }', render(dark, statusDark, '    '));

writeFileSync('src/index.css', css);
console.log('index.css regenerated from src/ui/themes.ts');
