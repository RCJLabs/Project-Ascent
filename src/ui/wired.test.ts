import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Nothing is built and left unreachable (PLAN.md M26).
 *
 * This has now happened three times. `validate_palette.js` was cited in
 * `index.css` and did not exist, so three colours failed WCAG AA for the
 * whole life of the project. `EmptyState` was written in M13 and used in
 * **zero** places while eight pages kept hand-rolled copies. And
 * `recordCard` — a share card for a personal record, the single biggest
 * award in the economy — sat fully written in `shareCard.ts`, reachable from
 * nothing, until M26 wired it up.
 *
 * Nothing in a build notices any of that: an unused export type-checks,
 * lints and ships. Ten lines is cheaper than a fourth time.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const SOURCES = walk('src')
  .filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

/** Every place a name is mentioned outside the file that declares it. */
function callers(name: string, declaredIn: string): string[] {
  return SOURCES.filter(
    (file) => file.path !== declaredIn && new RegExp(`\\b${name}\\b`).test(file.source),
  ).map((f) => f.path);
}

function exportedFunctions(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/^export function (\w+)/gm)].map((m) => m[1]!);
}

describe('every share card is reachable', () => {
  const PATH = 'src/ui/shareCard.ts';
  // Builders only: the helpers around them are used by the builders.
  const cards = exportedFunctions(PATH).filter((name) => name.endsWith('Card'));

  it('finds the builders to check', () => {
    expect(cards.length).toBeGreaterThanOrEqual(6);
  });

  it('has a caller for each', () => {
    const orphans = cards.filter((name) => callers(name, PATH).length === 0);
    expect(orphans).toEqual([]);
  });
});

describe('every UI primitive is used', () => {
  // `ui/` is where things get built ahead of being needed, which is exactly
  // where this keeps happening.
  const FILES = [
    'src/ui/EmptyState.tsx',
    'src/ui/Skeleton.tsx',
    'src/ui/Chip.tsx',
    'src/ui/Meter.tsx',
    'src/ui/Stat.tsx',
    'src/ui/Disclosure.tsx',
    'src/ui/IconButton.tsx',
    'src/ui/PageGrid.tsx',
  ];

  it('has a caller for each exported component', () => {
    const orphans: string[] = [];
    for (const path of FILES) {
      expect(statSync(path).isFile(), `${path} is gone — drop it from the list`).toBe(true);
      for (const name of exportedFunctions(path)) {
        if (callers(name, path).length === 0) orphans.push(`${name} (${path})`);
      }
    }
    expect(orphans).toEqual([]);
  });
});

describe('the check itself works', () => {
  it('would notice a name nothing mentions', () => {
    // A test that cannot fail is the thing it is meant to prevent.
    expect(callers('aNameNothingUses', 'src/ui/shareCard.ts')).toEqual([]);
  });

  it('does not count the declaring file as a caller', () => {
    expect(callers('recordCard', 'src/ui/shareCard.ts')).not.toContain('src/ui/shareCard.ts');
  });
});
