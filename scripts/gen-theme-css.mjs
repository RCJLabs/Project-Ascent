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

/** The consistency ramp, mixed the same way `heatRamp` mixes it. */
const HEAT_STOPS = JSON.parse(
  slice('export const HEAT_STOPS', 'as const;').match(/\[([^\]]*)\]/)[0],
);

function mix(a, b, amount) {
  const channel = (hex, at) => parseInt(hex.slice(at, at + 2), 16);
  const out = [1, 3, 5].map((at) =>
    Math.max(0, Math.min(255, Math.round(channel(a, at) + (channel(b, at) - channel(a, at)) * amount)))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}

const render = (palette, status, indent) =>
  [
    ...Object.entries(VAR).map(([key, v]) => `${indent}${v}: ${palette[key]};`),
    ...Object.entries(STATUS_VAR).map(([key, v]) => `${indent}${v}: ${status[key]};`),
    // Written here as well as by applyPalette, because the first frame is
    // painted before any script runs and an unset var makes an SVG fill
    // invalid — which renders as black, not as nothing. Measured.
    ...HEAT_STOPS.map((amount, i) => `${indent}--heat-${i + 1}: ${mix(palette.sunken, palette.viz1, amount)};`),
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
