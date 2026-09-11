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

/**
 * Every authored field of a prescription reaches a screen (PLAN.md M90).
 *
 * The unused-export check above cannot see this class of bug, because the
 * field is not an export — it is content. `PhasePrescription.selection` was
 * "used": one screen read `selection.pick`. Nothing read `selection.note`,
 * so eighteen authored lines of pick advice went nowhere, and nothing read
 * `circuit` or `selection` in the logger at all, so twenty-nine
 * prescriptions rendered a menu as a checklist — six cues on screen where
 * the program asks for one.
 *
 * So the check has to go a level deeper than the field: a leaf at a time,
 * by the name it is read by. The list is maintained by hand, which is the
 * cost of catching a field that type-checks, lints and ships while saying
 * nothing.
 */
/**
 * A screen, or something a screen imports. Scoping this to `src/features`
 * alone fails honestly-rendered fields the moment the formatting moves into
 * a helper, which is exactly what M90 did with `prescriptionLine`. One hop,
 * and no further: a field read only by a helper that nothing imports is
 * still a field that reaches nobody.
 */
const SCREENS = SOURCES.filter((f) => {
  if (f.path.startsWith('src/features')) return true;
  const specifier = f.path.replace(/^src\//, '@/').replace(/\.tsx?$/, '');
  return SOURCES.some(
    (other) => other.path.startsWith('src/features') && other.source.includes(specifier),
  );
});

/** Every screen-side file that reads a name. */
const readers = (name: string): string[] =>
  SCREENS.filter((f) => new RegExp(`\\b${name}\\b`).test(f.source)).map((f) => f.path);

/**
 * The assertion itself, named so the self-check below runs the same one.
 * A weakened assertion here fails there, which is the only way a check
 * nothing else checks can be held to anything.
 *
 * A leaf can be read through a destructure or a rename, so the last segment
 * is what to look for — `circuit.work` is read as `work` once `circuit` is
 * in hand.
 */
function expectRendered(leaf: string): void {
  const seen = readers(leaf.split('.').at(-1)!);
  expect(seen, `${leaf} is authored in the catalogue and rendered nowhere`).not.toEqual([]);
}

describe('every authored prescription field reaches a screen', () => {
  const LEAVES = [
    'rationale',
    'exercises',
    'mergedInto',
    'selection.pick',
    'selection.note',
    'circuit.rounds',
    'circuit.work',
    'circuit.restBetween',
    'circuit.restBetweenRounds',
    'constantDose',
  ];

  it.each(LEAVES)('%s is read somewhere a climber can see it', (leaf) => expectRendered(leaf));
});

describe('the check itself works', () => {
  it('would notice a name nothing mentions', () => {
    // A test that cannot fail is the thing it is meant to prevent.
    expect(callers('aNameNothingUses', 'src/ui/shareCard.ts')).toEqual([]);
  });

  it('does not count the declaring file as a caller', () => {
    expect(callers('recordCard', 'src/ui/shareCard.ts')).not.toContain('src/ui/shareCard.ts');
  });

  // The prescription scan is a test checking content, which means nothing
  // else checks it. Both of its halves have to be able to fail.
  it('would notice a prescription field nothing reads', () => {
    expect(() => expectRendered('aFieldNothingRenders')).toThrow();
  });

  it('does not treat every file in the tree as a screen', () => {
    expect(SCREENS.length).toBeLessThan(SOURCES.length);
    expect(SCREENS.map((f) => f.path)).not.toContain('src/main.tsx');
  });
});
