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

/**
 * Every place a name is **called** outside the file that declares it.
 *
 * A word match was the first version and it passed for the wrong reason
 * (PLAN.md M155). `ui/Stat.tsx` was orphaned while four screens each
 * declared their own private `Stat`, and `\bStat\b` found all four — so the
 * check reported the primitive as used by the very files that had replaced
 * it. A call is `name(` or `<name`; a mention is not.
 */
export function calls(source: string, name: string): boolean {
  return new RegExp(`\\b${name}\\s*\\(|<${name}[\\s/>]`).test(source);
}

function callers(name: string, declaredIn: string): string[] {
  return SOURCES.filter((file) => file.path !== declaredIn && calls(file.source, name)).map(
    (f) => f.path,
  );
}

/** Every file that imports something from this module. */
function importers(path: string): string[] {
  const specifier = path.replace(/^src\//, '@/').replace(/\.tsx?$/, '');
  const relative = `./${path.split('/').pop()!.replace(/\.tsx?$/, '')}`;
  return SOURCES.filter(
    (f) => f.source.includes(`from '${specifier}'`) || f.source.includes(`from '${relative}'`),
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

  /**
   * And somebody has to import the file (PLAN.md M155).
   *
   * `Stat` was declared four more times, privately, in the screens that
   * should have used it — so every name-based check found it "used" while
   * the module itself was reachable from nothing. A primitive nobody
   * imports is a primitive nobody has.
   */
  /**
   * Named, so the self-check below runs the same one (PLAN.md M155).
   *
   * A guard passes until the day it does not, so the real list being empty
   * is also what a neutered version returns — the two tests share this
   * function for the same reason `expectRendered` above is a function: a
   * weakened check here fails there.
   */
  const unreachable = (list: readonly string[]): string[] =>
    list.filter((path) => importers(path).length === 0);

  it('has an importer for each file', () => {
    expect(unreachable(FILES)).toEqual([]);
  });

  it('would name a primitive nothing imports', () => {
    expect(unreachable([...FILES, 'src/ui/NobodyImportsThis.tsx'])).toEqual([
      'src/ui/NobodyImportsThis.tsx',
    ]);
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

/**
 * Every interface the content schema declares, read off the file (M169).
 *
 * The roots were three — `PhasePrescription`, `ExerciseBlock`, `Protocol` —
 * and this file's own header said why it stopped there: an array of objects
 * was *"a different question (M155's, and it is a much longer list)"*. True of
 * *values*, which the sweep below this one now covers. It was never true of
 * **fields**: `Program`, `SessionType`, `Drill`, `Metric`, `Phase`,
 * `Exercise`, `Track`, `WeeklyLayout` and `ProgramIntro` are declared in the
 * same file with the same shape, and nothing about them made them harder to
 * check. They simply were not.
 *
 * So the roots are derived too, by the same argument the leaves already win:
 * a list you maintain by hand fails exactly when something new appears. All
 * sixteen interfaces, 107 fields, checked by default and argued out in
 * `EXEMPT` with the reason written down.
 */
const ROOTS = [...TYPES.matchAll(/^export interface (\w+) \{/gm)].map((m) => m[1]!);

describe('every authored content field reaches a screen', () => {
  const LEAVES = [...new Set(ROOTS.flatMap(leavesOf))];

  it('reads the roots off the type file', () => {
    // A parse that quietly found nothing would pass every case below.
    expect(ROOTS).toContain('PhasePrescription');
    expect(ROOTS).toContain('Program');
    expect(ROOTS).toContain('Metric');
    expect(ROOTS.length).toBeGreaterThanOrEqual(16);
    expect(LEAVES).toContain('selection.note');
    expect(LEAVES).toContain('safety');
    expect(LEAVES.length).toBeGreaterThanOrEqual(60);
  });

  it.each(LEAVES)('%s is read somewhere a climber can see it', (leaf) => expectRendered(leaf));
});

/**
 * The two sweeps that only existed as throwaway scripts (PLAN.md M179).
 *
 * This file's header names three things built and left unreachable, and the
 * milestones since have each found another by hand: M155 and M156 deleted ten
 * dead exports, M169 swept every authored content field and value, and M174
 * found `CoachInput.programMetrics` — a field declared with a docblock saying
 * what it was for, read by nothing and filled by nothing.
 *
 * **Both sweeps were run against real history rather than argued for.**
 *
 * The field sweep, pointed at the tree as it stood before M174, reports
 * `CoachInput.programMetrics` — the thing it took a milestone to notice.
 * Pointed at the tree before **M155**, the milestone explicitly titled
 * *"wired up or gone"*, it reports the same field: it was already dead there,
 * and that pass did not cover interface fields. It was introduced in the
 * commit that added Coach's Corner, **229 commits** before anything read it.
 *
 * The module sweep, pointed at the tree before M155, reports `engine/
 * priority.ts`, `ui/Stat.tsx` and a stray `__m39.ts` — which is most of what
 * that milestone found by hand.
 *
 * Neither finds those today, and both find something: see the allowlist below
 * and, for the field sweep, the two fields M179 deleted from
 * `AltimeterState`.
 */

/**
 * Every module something imports, resolved rather than guessed.
 *
 * The first version of this built a module's likely specifiers — `@/lib/x`,
 * `./x`, `../x` — and asked whether any file contained one. It reported
 * `lib/swUpdate.ts` as an orphan, because `main.tsx` imports it as
 * `'./lib/swUpdate'`: a relative path with a directory in it, which is a
 * spelling the guess did not produce. Resolving the specifier the way the
 * bundler does has no such list to be short of, and is a single pass rather
 * than one scan per module.
 *
 * **Dynamic imports count**, and that is not a detail either: a draft
 * matching only `from '…'` called **every lazy route page** an orphan —
 * forty files — because `App.tsx` reaches them through `lazy(() =>
 * import('…'))`.
 */
export function importedPaths(
  sources: readonly { path: string; source: string }[],
): Set<string> {
  const known = new Set(sources.map((f) => f.path));
  const out = new Set<string>();
  const resolve = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith('.')) {
      const parts = from.split('/').slice(0, -1);
      for (const step of spec.split('/')) {
        if (step === '.') continue;
        else if (step === '..') parts.pop();
        else parts.push(step);
      }
      base = parts.join('/');
    } else return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
      if (known.has(candidate)) return candidate;
    }
    return null;
  };
  for (const file of sources) {
    for (const m of file.source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
      const target = resolve(file.path, m[1]!);
      if (target !== null && target !== file.path) out.add(target);
    }
  }
  return out;
}

/**
 * Modules nothing imports, and why each is allowed to be one.
 *
 * Exact rather than a floor: a list that only says "at most two" lets the
 * third through.
 */
const TEST_ONLY: Record<string, string> = {
  'src/content/validate.ts': 'its own header: runs over the whole catalog in tests',
  'src/test/render.tsx': 'the harness the screen tests render through, imported only by tests',
  'src/test/setup.ts': 'named by vite.config.ts as setupFiles, so the runner loads it, not the app',
  'src/ui/paletteRules.ts': 'moved out of a script at M61 so the tool could itself be tested',
};

/** The app's two entry points, which nothing imports by design. */
const ENTRY = ['src/main.tsx', 'src/App.tsx'];

/**
 * Modules nothing imports and nothing explains — the assertion itself, named
 * so the self-check below runs the same one.
 *
 * `ui/wired.test.ts` states the rule this follows a hundred lines up, and
 * M169's battery proved it: with a sweep and its self-check holding separate
 * copies of one filter, weakening the sweep's copy survives everything.
 */
export function unexplainedOrphans(
  sources: readonly { path: string; source: string }[],
  allowed: readonly string[],
): string[] {
  const imported = importedPaths(sources);
  return sources
    .filter((f) => !ENTRY.includes(f.path) && !imported.has(f.path) && !allowed.includes(f.path))
    .map((f) => f.path)
    .sort();
}

describe('every module is reachable from the app', () => {
  const modules = SOURCES.filter((f) => !ENTRY.includes(f.path));

  it('finds enough modules to be checking anything', () => {
    expect(modules.length).toBeGreaterThan(200);
  });

  it('has an importer for every one, or a reason', () => {
    expect(unexplainedOrphans(SOURCES, Object.keys(TEST_ONLY))).toEqual([]);
  });

  it('gives each exception a reason rather than a line', () => {
    for (const [path, why] of Object.entries(TEST_ONLY)) {
      expect(why.length, path).toBeGreaterThan(20);
    }
    // And the one reason that can be checked rather than read: the runner
    // loads this file because the config says so.
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('./src/test/setup.ts');
  });
});

/** Every `name:` declared directly inside an `export interface`. */
const DECLARATION = /export interface (\w+)\s*\{([\s\S]*?)\n\}/g;

export function declaredFields(
  sources: readonly { path: string; source: string }[],
): { path: string; type: string; field: string }[] {
  const out: { path: string; type: string; field: string }[] = [];
  for (const { path, source } of sources) {
    for (const type of stripComments(source).matchAll(DECLARATION)) {
      for (const field of type[2]!.matchAll(/^ {2}(\w+)\??\s*:/gm)) {
        out.push({ path, type: type[1]!, field: field[1]! });
      }
    }
  }
  return out;
}

/**
 * Every name the app uses as a property, a key or a destructure, with the
 * interface bodies taken out first — so a field's own declaration is not
 * what proves it is read.
 *
 * Deliberately permissive in the one direction that matters. A shorthand
 * property in an object literal counts (`return { claimable }`), because the
 * first draft without it called four live fields dead. A guard whose failure
 * mode is *missing something* is worth having; one that cries wolf gets
 * deleted.
 */
export function namesInUse(sources: readonly { path: string; source: string }[]): Set<string> {
  const corpus = sources.map((f) => stripComments(f.source).replace(DECLARATION, '')).join('\n');
  const used = new Set<string>();
  for (const m of corpus.matchAll(/\.(\w+)/g)) used.add(m[1]!);
  for (const m of corpus.matchAll(/(\w+)\s*:/g)) used.add(m[1]!);
  for (const m of corpus.matchAll(/\{([^{}]*)\}/g)) {
    for (const part of m[1]!.split(',')) {
      const name = part.split(':')[0]!.replace('...', '').trim();
      if (/^\w+$/.test(name)) used.add(name);
    }
  }
  return used;
}

/** Fields declared and read by nothing — named for the same reason. */
export function unreadFields(sources: readonly { path: string; source: string }[]): string[] {
  const used = namesInUse(sources);
  return declaredFields(sources)
    .filter((f) => !used.has(f.field))
    .map((f) => `${f.type}.${f.field}`)
    .sort();
}

describe('every declared field is read somewhere', () => {
  const fields = declaredFields(SOURCES);

  it('finds enough fields to be checking anything', () => {
    expect(fields.length).toBeGreaterThan(1500);
    expect(fields.some((f) => f.type === 'CoachInput' && f.field === 'programMetrics')).toBe(true);
  });

  /**
   * Nothing on the list, and the two that were on it are gone. `AltimeterState`
   * published `intoSegment` and `etaWeeks` — the raw numbers behind `fraction`
   * and `etaLabel` — and the only things that ever read them were two lines of
   * their own test. `everest`, two fields down the same object, had already
   * settled it the other way.
   */
  it('has no field declared and read by nothing', () => {
    expect(unreadFields(SOURCES)).toEqual([]);
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

  it('does not count a bare mention as a call', () => {
    expect(calls('// Stat is nice', 'Stat')).toBe(false);
    expect(calls('const label = "Stat";', 'Stat')).toBe(false);
    expect(calls('type X = { Stat: number };', 'Stat')).toBe(false);
  });

  it('counts a call and a JSX element', () => {
    expect(calls('return Stat(props);', 'Stat')).toBe(true);
    expect(calls('<Stat label="x" />', 'Stat')).toBe(true);
    expect(calls('<Stat>\n</Stat>', 'Stat')).toBe(true);
  });

  /**
   * And what a name check still cannot do (PLAN.md M155).
   *
   * Four screens declared their own private `Stat` and rendered it, so
   * every name-based check — word or call — found the orphaned
   * `ui/Stat.tsx` "used" by the very files that had replaced it. Only the
   * import tells them apart, which is why the primitives check asks for one.
   */
  it('would notice a module nothing imports', () => {
    expect(importers('src/ui/NothingImportsThis.tsx')).toEqual([]);
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

  /**
   * And the two sweeps M179 added, run against a tree made to fail them.
   *
   * Both were clean on the day they shipped, which is the state a guard is
   * least checkable in — the same argument `content/authored.test.ts` makes
   * for its own self-checks, and the same shared-function rule: the sweeps
   * above and the checks below call the *same* `importedPaths`,
   * `declaredFields` and `namesInUse`, because M169's battery showed that
   * two copies of one predicate let the used copy be weakened alone.
   */
  const file = (path: string, source: string) => ({ path, source });

  it('resolves every spelling an import can have', () => {
    const tree = [
      file('src/a/one.ts', "import { x } from '@/b/two';"),
      file('src/a/three.ts', "import { y } from './one';"),
      file('src/b/four.ts', "import { z } from '../a/three';"),
      file('src/b/two.ts', 'export const x = 1;'),
      file('src/App.tsx', "const P = lazy(() => import('@/b/four'));"),
    ];
    expect([...importedPaths(tree)].sort()).toEqual([
      'src/a/one.ts',
      'src/a/three.ts',
      'src/b/four.ts',
      'src/b/two.ts',
    ]);
  });

  /**
   * The spelling that caught the first draft out: a relative path with a
   * directory in it. `main.tsx` imports `'./lib/swUpdate'`, and a check that
   * guessed `./swUpdate` called the module an orphan.
   */
  it('resolves a relative path with a directory in it', () => {
    const tree = [
      file('src/main.tsx', "import { watchForUpdates } from './lib/swUpdate';"),
      file('src/lib/swUpdate.ts', 'export const watchForUpdates = () => {};'),
    ];
    expect(importedPaths(tree).has('src/lib/swUpdate.ts')).toBe(true);
  });

  it('would notice a module nothing imports at all', () => {
    // `main.tsx` is an entry point, so nothing importing it is the normal
    // case rather than a finding — which the first draft of this fixture got
    // wrong, and the shared filter said so.
    const tree = [file('src/main.tsx', "import './b';"), file('src/b.ts', ''), file('src/c.ts', '')];
    expect(importedPaths(tree).has('src/c.ts')).toBe(false);
    expect(unexplainedOrphans(tree, [])).toEqual(['src/c.ts']);
    expect(unexplainedOrphans(tree, ['src/c.ts']), 'a reason stops being one').toEqual([]);
  });

  it('would notice a field declared and read by nothing', () => {
    const tree = [
      file('src/x.ts', 'export interface Thing {\n  used: number;\n  forgotten: number;\n}\n'),
      file('src/y.ts', 'export const f = (t: Thing) => t.used;'),
    ];
    expect(unreadFields(tree)).toEqual(['Thing.forgotten']);
  });

  it('counts a key, a shorthand and a destructure as reaching a field', () => {
    const tree = [file('src/x.ts', 'const a = { keyed: 1 };\nconst b = { shorthand };\nconst { pulled } = c;\nd.accessed;')];
    const used = namesInUse(tree);
    for (const name of ['keyed', 'shorthand', 'pulled', 'accessed']) {
      expect(used.has(name), name).toBe(true);
    }
  });

  it('does not count a field named only in a comment or a string', () => {
    const tree = [file('src/x.ts', '/** `Thing.forgotten` is unread. */\nconst label = "forgotten";')];
    expect(namesInUse(tree).has('forgotten')).toBe(false);
  });

  /** And a field's own declaration never counts as reading it. */
  it('does not count the interface body it came from', () => {
    const tree = [file('src/x.ts', 'export interface Thing {\n  lonely: number;\n}\n')];
    expect(namesInUse(tree).has('lonely')).toBe(false);
    expect(declaredFields(tree)).toEqual([{ path: 'src/x.ts', type: 'Thing', field: 'lonely' }]);
  });
});
