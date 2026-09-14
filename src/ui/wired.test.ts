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
 * by the name it is read by. The leaves were maintained by hand until M153,
 * which is exactly how `Protocol.safety` got past it — see `leavesOf`.
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

/**
 * Every screen-side file that **reads** a leaf — not one that mentions it.
 *
 * The word-match this used to do is the same defect M155 found in
 * `callers()` above: a test that passes for the wrong reason. `safety`
 * appears in `HomePage.tsx`, in the Ascent game and in a program's prose,
 * none of which has ever read `Protocol.safety` — so the check was green on
 * the field it was written to catch, and would have stayed green if the
 * derived list below had named it.
 *
 * A read is a property access or a destructure, and nothing else counts.
 * Both forms, because M90's own point was that a leaf arrives renamed:
 * `circuit.work` is read as `work` once `circuit` is in hand.
 *
 * And the comments come off first, or the check passes on its own
 * documentation: this file's *"`Protocol.safety` got past it"* is a
 * property access as far as a regex is concerned, and so is every doc
 * comment that names the field it is about. Stripping is deliberately
 * crude — a URL inside a string loses its tail — because the error it can
 * make is a **missing** read, which fails loudly, rather than an invented
 * one, which is the failure this whole block exists to stop.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

/** Whether a file's source actually reads `name` off something. */
export function reads(source: string, name: string): boolean {
  const code = stripComments(source);
  const access = new RegExp(`\\.${name}\\b`);
  const destructure = new RegExp(`\\{[^{}\\n]*\\b${name}\\b[^{}\\n]*\\}\\s*(=|:|\\)|,)`);
  return access.test(code) || destructure.test(code);
}

const readers = (name: string): string[] =>
  SCREENS.filter((f) => reads(f.source, name)).map((f) => f.path);

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

/**
 * The leaves, read off the type rather than listed by hand (PLAN.md M153).
 *
 * **The hand-maintained list is what let `Protocol.safety` through.** The
 * comment above used to end "the list is maintained by hand, which is the
 * cost of catching a field that type-checks, lints and ships while saying
 * nothing" — and seven authored safety rules, including *"Never campus with
 * any existing finger or elbow symptom"*, sat unread for the life of the
 * project because nobody added the word `safety` to an array. A list you
 * have to remember to extend fails exactly when a new field appears, which
 * is the only time it is needed.
 *
 * So the roots are named and their fields are derived. A field is checked
 * **by default** and has to be argued out in `EXEMPT`, with the reason
 * written down. That is the inversion: the next authored field is covered
 * the moment it is declared.
 *
 * **One level of nesting, and only into a single object.** `selection?:
 * SelectionRule` is followed because `selection.note` is a leaf a screen has
 * to read; `exercises: Exercise[]` is not, because an array of prescriptions
 * is rendered as a list and its own fields are a different question (M155's,
 * and it is a much longer list). A regex over one file we own, and a test
 * below that fails loudly if the parse stops finding anything.
 *
 * **What it still cannot see, stated rather than papered over.** A leaf is
 * matched by its last segment, so a generically-named one — `name`,
 * `description` — is satisfied by *any* type's field of that name, and
 * several are read on every screen. Those two are checked and the check
 * means nothing for them. A `Protocol.description` exemption was written
 * here and removed again: it survived its own mutation, because dropping
 * the exemption changed nothing, which is the tell that it was buying
 * comfort rather than coverage. Telling them apart needs the type of the
 * thing being read, which is a type-checker's job and not a regex's. The
 * fields this catches are the distinctively-named ones, which is where the
 * bug keeps happening: `selection.note`, `constantDose`, `safety`.
 */
const TYPES = readFileSync('src/content/types.ts', 'utf8');

/** The `name: Type;` pairs declared directly inside one interface. */
function fieldsOf(name: string): { field: string; type: string }[] {
  const block = new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(TYPES);
  if (!block) return [];
  return [...block[1]!.matchAll(/^ {2}(\w+)\??:\s*([^;]+);/gm)].map((m) => ({
    field: m[1]!,
    type: m[2]!.trim(),
  }));
}

/** Fields that reach a screen only through something else, and why. */
const EXEMPT: Record<string, string> = {
  'ExerciseBlock.id': 'the key a prescription is looked up by, never rendered',
  'ExerciseBlock.perPhase': 'the map the phase is chosen from; its entries are the leaves below',
  'PhasePrescription.perWeek': 'a list of WeekStep, rendered by its own leaves rather than as a field',
  'Protocol.id': 'the key an exercise references as protocolId',
  'Protocol.timer': 'read as intervals by buildTimer, and as workSec/restSec on the program page',
};

function leavesOf(root: string): string[] {
  const out: string[] = [];
  for (const { field, type } of fieldsOf(root)) {
    if (EXEMPT[`${root}.${field}`]) continue;
    const nested = /^[A-Z]\w+$/.test(type) ? fieldsOf(type) : [];
    if (nested.length === 0) out.push(field);
    else for (const leaf of nested) out.push(`${field}.${leaf.field}`);
  }
  return out;
}

describe('every authored prescription field reaches a screen', () => {
  const ROOTS = ['PhasePrescription', 'ExerciseBlock', 'Protocol'];
  const LEAVES = [...new Set(ROOTS.flatMap(leavesOf))];

  it('reads the roots off the type file', () => {
    // A parse that quietly found nothing would pass every case below.
    expect(LEAVES).toContain('selection.note');
    expect(LEAVES).toContain('safety');
    expect(LEAVES.length).toBeGreaterThanOrEqual(12);
  });

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

  // The two halves of `reads`, which is the part that made the prescription
  // scan green on the very field it was written to catch.
  it('does not count a field named only in a comment', () => {
    expect(reads('// renders protocol.safety one day\nconst x = 1;', 'safety')).toBe(false);
    expect(reads('/** `Protocol.safety` is unread. */\nconst x = 1;', 'safety')).toBe(false);
  });

  it('does not count a word that merely appears', () => {
    expect(reads('const label = "safety first";', 'safety')).toBe(false);
    expect(reads('if (safety) return null;', 'safety')).toBe(false);
  });

  it('counts an access and a destructure, which is how a leaf arrives', () => {
    expect(reads('return protocol.safety.length;', 'safety')).toBe(true);
    expect(reads('const { safety } = protocol;', 'safety')).toBe(true);
    expect(reads('function f({ safety }: Protocol) {}', 'safety')).toBe(true);
  });

  it('does not treat every file in the tree as a screen', () => {
    expect(SCREENS.length).toBeLessThan(SOURCES.length);
    expect(SCREENS.map((f) => f.path)).not.toContain('src/main.tsx');
  });
});
