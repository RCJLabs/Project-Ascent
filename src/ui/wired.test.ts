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

/**
 * And every exported value has somebody who wants it (PLAN.md M196).
 *
 * `every UI primitive is used` above is this rule with a hand-written scope:
 * seven files in `ui/`. The app is six hundred and sixty-six, and the five
 * this found were all outside that list — `CareerLinkCard`, a finished card
 * with a Career link, a milestone count and the latest milestone by name,
 * rendered by nothing while `ProgressPage` shipped an equivalent; two
 * by-id lookups in `content/`; a label map for warmup categories no screen
 * shows; and a second answer to *is this a custom program* that nothing
 * asked.
 *
 * **Referenced nowhere at all**, which is narrower than unused and is the
 * point. An export used only inside its own file is merely over-exported,
 * and one used only by its own test is a different question with 232
 * answers in this repo — neither is flagged here. This fires when a name
 * appears in one file and once in that file: its own declaration.
 */
/** Identifier sets per corpus, built once. See `unreferenced` for why. */
const INDEX = new WeakMap<object, Map<string, Set<string>>>();
function identifiers(
  corpus: readonly { path: string; source: string }[],
): Map<string, Set<string>> {
  const held = INDEX.get(corpus);
  if (held !== undefined) return held;
  const built = new Map(
    corpus.map(({ path, source }) => [path, new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? [])]),
  );
  INDEX.set(corpus, built);
  return built;
}

describe('every exported value has a caller', () => {
  const ALL = walk('src')
    .filter((p) => /\.tsx?$/.test(p))
    .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

  const DECLARED = SOURCES.flatMap(({ path, source }) =>
    [...source.matchAll(/^export\s+(?:async\s+)?(?:const|function|class|enum)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (m) => ({ name: m[1]!, path }),
    ),
  );

  /**
   * Named, so the control below runs the same one (PLAN.md M155, M195).
   *
   * M195 is why the control is not optional: a sweep of this shape reported
   * a link as missing that had been on screen for milestones, because its
   * pattern could not match a template literal. An absence is worth nothing
   * until the identical code path has been shown to find a presence.
   */
  const unreferenced = (
    declared: readonly { name: string; path: string }[],
    corpus: readonly { path: string; source: string }[],
  ): string[] =>
    declared
      .filter(({ name, path }) => {
        // Identifier sets first, built once per corpus. Regexing every file
        // for every name is quadratic and this rule took 4.2 seconds before
        // M206 added one more export and tipped it past the five-second
        // timeout. `every engine interface field is read` was written with
        // the prefilter already; this is the same fix, one rule later.
        const words = identifiers(corpus);
        const holding = corpus.filter(
          ({ path: p, source }) => words.get(p)?.has(name) === true && new RegExp(`\\b${name}\\b`).test(source),
        );
        if (holding.length !== 1) return false;
        const own = corpus.find((f) => f.path === path);
        if (own === undefined) return false;
        return (own.source.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length <= 1;
      })
      .map(({ name, path }) => `${name} (${path})`);

  /**
   * The corpus is a parameter so the controls can hand it one they built
   * (PLAN.md M196). A control that runs the predicate over the real tree can
   * only prove the half of it the tree happens to exercise — the first
   * version of this passed a synthetic path, which returned before the
   * occurrence count ran, so the threshold went unchecked and a mutation of
   * it survived.
   */
  const CORPUS = [
    { path: 'a.ts', source: 'export function used() {}\nexport const dead = 1;\n' },
    { path: 'b.ts', source: "import { used } from './a';\nused();\n" },
    { path: 'c.ts', source: 'export function twiceInOwnFile() {}\nconst x = twiceInOwnFile;\n' },
  ];
  const CORPUS_DECLARED = [
    { name: 'used', path: 'a.ts' },
    { name: 'dead', path: 'a.ts' },
    { name: 'twiceInOwnFile', path: 'c.ts' },
  ];

  it('finds enough exports to be checking anything', () => {
    expect(DECLARED.length).toBeGreaterThan(250);
    expect(DECLARED.some(({ name }) => name === 'deriveClimberState')).toBe(true);
  });

  it('names the one nothing references, and only that one', () => {
    // Three exports, one of each kind: imported elsewhere, referenced
    // nowhere, and used privately inside its own file. Only the middle one
    // is this rule's business.
    expect(unreferenced(CORPUS_DECLARED, CORPUS)).toEqual(['dead (a.ts)']);
  });

  it('counts references rather than files', () => {
    // `twiceInOwnFile` lives in one file, like `dead` does. What separates
    // them is the second mention, so the threshold gets its own case.
    expect(unreferenced([{ name: 'twiceInOwnFile', path: 'c.ts' }], CORPUS)).toEqual([]);
    expect(unreferenced([{ name: 'dead', path: 'a.ts' }], CORPUS)).toEqual(['dead (a.ts)']);
  });

  it('has a caller for each', () => {
    // The corpus is named once and both asserted on, because a sweep handed
    // an empty one flags nothing and passes — which is how this rule's own
    // first draft read the whole tree and checked none of it.
    const corpus = ALL;
    expect(corpus.length).toBeGreaterThan(600);
    expect(corpus.some(({ path }) => path === 'src/main.tsx')).toBe(true);
    expect(unreferenced(DECLARED, corpus)).toEqual([]);
  });
});

/**
 * And every field an engine interface publishes is read by somebody
 * (PLAN.md M205).
 *
 * M174 recorded the gap in writing: M169's sweep covers **content** fields
 * and not the engine's own interfaces. M192 then found two by hand —
 * `Venue.projects` and `Venue.objectives`, counted, asserted in a test, and
 * rendered to nobody — and M196 built the rule for exported *values*. A
 * field on an interface is the one shape still uncovered, and it is the
 * shape M192 actually tripped over.
 *
 * **Three were found and removed.** `ClimberState.totalSessions` sat beside
 * `completedSessions`, which is what all 24 of its callers use, so the app
 * carried two session counters and consulted one. `Interruption.away`
 * counted the days since the last session inside a block and was published
 * next to `missedWeeks`, which is the fact the screen shows.
 * `NextChoice.repeats` was published beside `because`, the sentence built
 * out of it.
 *
 * **A read, not a mention.** The distinction is the whole rule: `acute` is
 * set on `LoadState`, and `derive.ts` also takes a function parameter of
 * that name — so the identifier is everywhere and the field is read
 * nowhere. Only `.field` and a destructure count.
 */
describe('every engine interface field is read', () => {
  /**
   * Comments and string literals stripped, which this rule learned the hard
   * way: its own doc comment above says `NextChoice.repeats`, and a search
   * for `.repeats` matched **that** — so the guard's account of the field it
   * had just removed counted as a reader of it, and restoring the field did
   * not fail this test. Prose about a field is not a use of it.
   *
   * **Comments only, and string literals left alone**, which is where
   * `privacy.test.ts`'s stripper and this one part company. That file blanks
   * template literals because it hunts `fetch(` in code; blanking them here
   * deletes real reads, because a template carries expressions — 
   * `injuryLog.ts` reads `history.elapsed` inside one, and the first draft
   * of this rule called that field dead.
   */
  const code = (source: string): string =>
    source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

  const CORPUS = walk('src')
    .filter((p) => /\.tsx?$/.test(p))
    .map((path) => ({ path, source: code(readFileSync(path, 'utf8')) }));

  /** Identifiers per file, so a field is only regexed against files that
   *  could possibly mention it. The naive form takes minutes. */
  const NAMES = new Map(
    CORPUS.map(({ path, source }) => [path, new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? [])]),
  );

  const DECLARED: { iface: string; field: string; path: string }[] = [];
  for (const { path } of CORPUS) {
    if (!path.startsWith('src/engine/') || /\.test\.tsx?$/.test(path)) continue;
    const source = readFileSync(path, 'utf8');
    for (const m of source.matchAll(/export interface (\w+)\s*\{([\s\S]*?)\n\}/g)) {
      for (const f of (m[2] ?? '').matchAll(/^ {2}(?:readonly )?(\w+)\??\s*:/gm)) {
        DECLARED.push({ iface: m[1]!, field: f[1]!, path });
      }
    }
  }

  /**
   * Named, so the controls run the same one (PLAN.md M155, M195, M196).
   * The corpus is a parameter for the reason M196 records: a control that
   * can only run against the real tree proves the half of the rule the tree
   * happens to exercise.
   */
  const unread = (
    declared: readonly { iface: string; field: string; path: string }[],
    corpus: readonly { path: string; source: string }[],
  ): string[] =>
    declared
      .filter(({ field }) => {
        const dot = new RegExp(`\\.${field}\\b`);
        const destructured = new RegExp(`\\{[^{}\n]*\\b${field}\\b[^{}\n]*\\}\\s*(?::|=)`);
        return !corpus.some(({ path, source }) => {
          const names = NAMES.get(path);
          if (names !== undefined && !names.has(field)) return false;
          return dot.test(source) || destructured.test(source);
        });
      })
      .map(({ iface, field, path }) => `${iface}.${field} (${path})`);

  const SAMPLE = [
    { path: 'a.ts', source: 'export interface S {\n  read: number;\n  never: number;\n}\n' },
    { path: 'b.ts', source: 'const f = (s: S) => s.read;\n' },
    { path: 'c.ts', source: 'const { alsoRead } = thing;\n' },
  ];
  const SAMPLE_FIELDS = [
    { iface: 'S', field: 'read', path: 'a.ts' },
    { iface: 'S', field: 'never', path: 'a.ts' },
    { iface: 'S', field: 'alsoRead', path: 'a.ts' },
  ];

  it('names the field nobody reads, and only that one', () => {
    expect(unread(SAMPLE_FIELDS, SAMPLE)).toEqual(['S.never (a.ts)']);
  });

  it('counts a destructure as a read', () => {
    // `const { x } = thing` is how half this codebase reads a result, so a
    // rule that only saw `thing.x` would call most of the engine dead.
    expect(unread([{ iface: 'S', field: 'alsoRead', path: 'a.ts' }], SAMPLE)).toEqual([]);
  });

  it('does not count a mention as a read', () => {
    // The `acute` case: the name appears as a parameter and the field is
    // still read by nobody.
    const mentions = [{ path: 'd.ts', source: 'function g(never: number) { return never + 1; }\n' }];
    expect(unread([{ iface: 'S', field: 'never', path: 'a.ts' }], mentions)).toEqual([
      'S.never (a.ts)',
    ]);
  });

  it('finds enough fields to be checking anything', () => {
    expect(DECLARED.length).toBeGreaterThan(1_000);
    expect(DECLARED.some((d) => d.iface === 'ClimberState' && d.field === 'completedSessions')).toBe(true);
  });

  it('has a reader for each', () => {
    // Corpus named once and asserted on, for the reason M196 records: a
    // sweep handed an empty one finds nothing and passes.
    const corpus = CORPUS;
    expect(corpus.length).toBeGreaterThan(600);
    const found = unread(DECLARED, corpus);
    expect(found, `published and read by nobody: ${found.join('; ')}`).toEqual([]);
  });
});

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
/**
 * A specifier resolved the way the bundler resolves it (PLAN.md M184).
 *
 * One copy. `importedPaths` wrote this first, `firstLoadClosure` copied it at
 * M183, and the sweep below wanted a third — which is the shape M169 named
 * and this file's own rule against: a sweep and its self-check holding
 * separate copies of one predicate means weakening one survives everything.
 */
function resolveSpec(known: ReadonlySet<string>, from: string, spec: string): string | null {
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
}

export function importedPaths(
  sources: readonly { path: string; source: string }[],
): Set<string> {
  const known = new Set(sources.map((f) => f.path));
  const out = new Set<string>();
  for (const file of sources) {
    for (const m of file.source.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
      const target = resolveSpec(known, file.path, m[1]!);
      if (target !== null && target !== file.path) out.add(target);
    }
  }
  return out;
}

/**
 * What the browser must parse before the app can do anything (PLAN.md M183).
 *
 * `resolveSpec` again, walked from `main.tsx` and reading
 * **only static edges**, because that is exactly the set the bundler puts in
 * the entry chunk: a `lazy(() => import('…'))` is a separate file the app
 * fetches when it needs it, and `import type` vanishes at build.
 *
 * It exists because the eager import is the easy mistake and it has already
 * been made once here. M104 moved `useTips` out of `CoachPage.tsx` so the
 * page's lazy boundary would be real — and then `HomePage.tsx` imported the
 * hook directly and put the whole coach engine back in the entry chunk by
 * the other door, where it sat for eighty milestones. A budget notices the
 * kilobytes a milestone later; this notices the import.
 */
export function firstLoadClosure(
  sources: readonly { path: string; source: string }[],
  roots: readonly string[],
): Set<string> {
  const known = new Set(sources.map((f) => f.path));
  const by = new Map(sources.map((f) => [f.path, f.source]));
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const path = stack.pop();
    if (path === undefined || seen.has(path)) continue;
    seen.add(path);
    const source = by.get(path);
    if (source === undefined) continue;
    // Only `import type` has to be filtered. A dynamic import is already
    // out: `import('…')` carries no `from`, so the scan below never reaches
    // one — a first draft also kept a set of them and skipped it, and the
    // battery found that the set changed nothing.
    const typeOnly = new Set(
      [...source.matchAll(/import\s+type\s[^'"]*'([^']+)'/g)].map((m) => m[1]!),
    );
    for (const m of source.matchAll(/from\s*'([^']+)'/g)) {
      const spec = m[1]!;
      if (typeOnly.has(spec)) continue;
      const target = resolveSpec(known, path, spec);
      if (target !== null && target !== path) stack.push(target);
    }
  }
  return seen;
}

/**
 * Every page the router defers, read from the router (PLAN.md M184).
 *
 * The list is `App.tsx`'s own `lazyRoute(() => import('…'))` calls rather than a
 * roll of forty-one filenames, because a hand list of routes is a list that
 * goes stale on the next page and says nothing about the one that was added.
 */
export function lazyRoutePages(
  sources: readonly { path: string; source: string }[],
  app = 'src/App.tsx',
): string[] {
  const known = new Set(sources.map((f) => f.path));
  const source = sources.find((f) => f.path === app)?.source ?? '';
  const out = new Set<string>();
  for (const m of source.matchAll(/lazyRoute\(\s*\(\) =>\s*import\('([^']+)'\)/g)) {
    const target = resolveSpec(known, app, m[1]!);
    if (target !== null) out.add(target);
  }
  return [...out].sort();
}

/**
 * The engine behind Home's one coach card, which is not worth the first
 * paint. Nine modules and 121KB of source; 14.28KB gzipped off the entry
 * chunk when `HomeCoachCard` went behind a boundary.
 */
const DEFERRED_ENGINE = [
  'src/engine/coach.ts',
  'src/engine/plateau.ts',
  'src/engine/planVsLog.ts',
  'src/engine/adherence.ts',
  'src/engine/trip.ts',
  'src/engine/progress.ts',
  'src/engine/effort.ts',
  'src/engine/phrase.ts',
  'src/features/coach/useTips.ts',
];

describe('nothing is on the first-paint path that does not have to be', () => {
  const firstLoad = firstLoadClosure(SOURCES, ['src/main.tsx']);

  /**
   * Exact rather than a floor, for the reason `TEST_ONLY` above gives: a
   * list checked only for what is in it passes when an entry is taken out.
   * Dropping `engine/coach.ts` — the heaviest of the nine — survived the
   * battery until this line existed.
   */
  it('names every module the boundary defers', () => {
    expect(DEFERRED_ENGINE).toHaveLength(9);
    expect(new Set(DEFERRED_ENGINE).size, 'a duplicate pads the count').toBe(9);
    expect(DEFERRED_ENGINE, 'the hook itself is the door to the other eight').toContain(
      'src/features/coach/useTips.ts',
    );
    expect(DEFERRED_ENGINE, 'the heaviest of them').toContain('src/engine/coach.ts');
  });

  it('finds enough of the app to be checking anything', () => {
    expect(firstLoad.size).toBeGreaterThan(80);
    expect(firstLoad.size, 'the whole tree, so the sweep proves nothing').toBeLessThan(
      SOURCES.length - 30,
    );
    expect(firstLoad, 'Home itself is meant to be eager').toContain('src/features/home/HomePage.tsx');
  });

  /**
   * The general form of the rule, and the reason it is here rather than in a
   * list (PLAN.md M184).
   *
   * A page declared `lazy()` and also reachable statically is a boundary that
   * does nothing: the router asks for it in a separate chunk and the entry
   * chunk already holds it. M183 fixed one instance by hand and named nine
   * modules; this asks the question of all forty-one routes at once, and it
   * found the second instance immediately — `HomePage.tsx` imported
   * `ReviewCard` from `@/features/review/ReviewPage`, and one card cost the
   * page, its share sheet and the SVG builder behind it, 13.32KB gzipped.
   *
   * Clean now, which is the argument for having it. This file makes that
   * argument about itself a hundred lines up.
   */
  it('lets no page the router defers back onto it', () => {
    const pages = lazyRoutePages(SOURCES);
    expect(pages.length, 'the router scan found nothing, so this proves nothing').toBeGreaterThan(
      35,
    );
    expect(pages, 'a route resolved to something outside src/').toSatisfy((ps: string[]) =>
      ps.every((path) => path.startsWith('src/features/')),
    );

    // The predicate, named once and self-checked — M169's rule, and the
    // battery needed it: an assertion that a filtered list is empty passes
    // just as well when the filter can never match anything.
    const onFirstPaint = (path: string) => firstLoad.has(path);
    expect(onFirstPaint('src/features/home/HomePage.tsx'), 'the filter matches nothing').toBe(true);
    expect(onFirstPaint('src/features/coach/CoachPage.tsx'), 'the filter matches everything').toBe(
      false,
    );
    expect(pages.filter(onFirstPaint)).toEqual([]);
  });

  /**
   * And the three pages that are deliberately eager stay eager, so the sweep
   * above cannot be satisfied by deferring everything. `App.tsx` names them
   * and says why: Home is where the app opens, `/today` is a launcher
   * shortcut, and the placeholder is a few lines.
   */
  it('keeps the three pages that are meant to be eager', () => {
    for (const path of [
      'src/features/home/HomePage.tsx',
      'src/features/log/TodayRedirect.tsx',
      'src/features/placeholder/PlaceholderPage.tsx',
    ]) {
      expect(firstLoad, `${path} stopped being first-load`).toContain(path);
      expect(lazyRoutePages(SOURCES), `${path} is lazy now`).not.toContain(path);
    }
  });

  /**
   * A barrel is a module that re-exports its neighbours, and importing one
   * name from it costs all of them (PLAN.md M186).
   *
   * `@/db` re-exports `exportImport.ts`, which pulls `engine/exportCsv.ts`:
   * the whole backup and CSV path. Five stores imported `getDb` from the
   * barrel rather than from `@/db/db`, and that one convenience put the
   * backup machinery in front of the first paint, worth 1.18KB gzipped.
   *
   * The rule is the general one rather than the two filenames, because the
   * barrel will grow and the next thing re-exported from it arrives with no
   * milestone attached. Off the first-paint path a barrel import is fine and
   * several lazy pages use it — this asks only of the modules that are.
   */
  it('has no first-paint module importing the @/db barrel', () => {
    // Both halves named once and self-checked before they are combined. An
    // assertion that a filtered list is empty passes just as well when
    // either half can never match, and the battery proved it: scoping the
    // filter to nothing survived until these two lines existed.
    const importsBarrel = (f: { source: string }) => /from '@\/db'/.test(f.source);
    const onFirstPaint = (f: { path: string }) => firstLoad.has(f.path);
    expect(
      SOURCES.filter(importsBarrel).length,
      'nothing imports the barrel at all, so this proves nothing',
    ).toBeGreaterThan(0);
    expect(
      SOURCES.filter(onFirstPaint).length,
      'the first-paint scope is empty, so this proves nothing',
    ).toBeGreaterThan(50);

    expect(
      SOURCES.filter((f) => onFirstPaint(f) && importsBarrel(f)).map((f) => f.path),
    ).toEqual([]);
  });

  /** Which is the consequence, named, so a failure says what it cost. */
  it.each([
    ['src/db/exportImport.ts', 'the backup path — only Settings and the importer need it'],
    ['src/engine/exportCsv.ts', 'the CSV writer, reached only through the backup path'],
  ])('leaves %s out of the entry chunk (%s)', (path, _why) => {
    expect(SOURCES.map((f) => f.path), 'the module was renamed, not deferred').toContain(path);
    expect([...firstLoad]).not.toContain(path);
  });

  /**
   * A bodies module is content reached through one `import()` and nothing
   * else (PLAN.md M185).
   *
   * `content/programs/catalogue.ts` has been one since M78 and says so in
   * its own header; `content/drills/library.ts` became one here. The rule
   * that keeps them working is the same and had never been written down: a
   * single static import from anywhere puts the whole body back in the
   * entry chunk, and nothing would say so until the budget moved.
   *
   * Six modules on the first-paint path call `getDrill` — `derive`,
   * `fingerGap`, `restDrill`, `challenges`, `sessionLength`, `plan` — so the
   * drills were in front of the first paint through six doors at once.
   * Cutting any one was worth 0.06KB; the registry filling itself is worth
   * 5.58KB.
   */
  const BODIES = ['src/content/programs/catalogue.ts', 'src/content/drills/library.ts'];

  it.each(BODIES)('reaches %s through import() and nothing else', (path) => {
    expect(SOURCES.map((f) => f.path), 'the bodies module was renamed').toContain(path);
    expect([...firstLoad], 'a static import put it back in the entry chunk').not.toContain(path);

    // The scan, named once and asked twice — the assertion and its own
    // control run through the same expression. An empty list is an assertion
    // that passes when the search is broken, and a control built from a
    // second copy of the scan does not fix that: the battery stubbed this
    // one to `[]` and survived until the control went through it too.
    const staticImportersOf = (module: string) =>
      SOURCES.filter(
        (f) => f.path !== path && new RegExp(`from '[^']*${module}'`).test(f.source),
      ).map((f) => f.path);

    const name = path.replace(/^.*\//, '').replace(/\.ts$/, '');
    expect(staticImportersOf(name), `${name} is imported statically, which undoes the split`)
      .toEqual([]);
    // `content/types.ts` is imported statically all over the tree; a scan
    // that cannot see that cannot see a static import of the bodies either.
    expect(
      staticImportersOf('types').length,
      'the static-import scan finds nothing at all',
    ).toBeGreaterThan(10);

    // And something does reach it, or the module is dead rather than lazy.
    const dynamic = SOURCES.filter((f) =>
      new RegExp(`import\\('[^']*${name}'\\)`).test(f.source),
    ).map((f) => f.path);
    expect(dynamic.length, `nothing loads ${name} at all`).toBeGreaterThan(0);
  });

  it.each(DEFERRED_ENGINE)('leaves %s out of the entry chunk', (path) => {
    expect(SOURCES.map((f) => f.path), 'the module was renamed, not deferred').toContain(path);
    expect([...firstLoad]).not.toContain(path);
  });

  /**
   * And the boundary is the one that keeps them out. Named rather than
   * implied, because deleting the `lazy()` and importing the card directly
   * is the exact regression this describe block exists for and it would
   * otherwise only show up as nine separate failures with no cause in them.
   */
  it('keeps them out through a lazy boundary on Home', () => {
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    /**
     * Every card on Home that reaches an engine, not just the first one.
     *
     * This named only the coach card, and a battery caught what that costs:
     * M239's numbers card reaches `altimeter.ts`, `loadTrend.ts` and
     * `derive.ts`, and importing it eagerly survived the whole suite. The
     * built-bundle probe in `perf.test.ts` would have caught it, but only
     * after a build — this is the one that fires on the file.
     */
    for (const card of [
      '@/features/coach/HomeCoachCard',
      '@/features/challenges/DailyTaskCard',
      '@/features/home/HomeStatsCard',
    ]) {
      const name = card.split('/').at(-1)!;
      expect(home, `${name} is imported eagerly again`).not.toMatch(
        new RegExp(`^import .*\\b${name}\\b`, 'm'),
      );
      expect(home, `${name} is not behind a lazy boundary`).toMatch(
        new RegExp(`lazyRoute\\(\\s*\\(\\) => import\\('${card.replace(/[/@]/g, (c) => '\\' + c)}'\\)`),
      );
    }
    /**
     * Every boundary on the page, not the first one that matches.
     *
     * This was a single `toMatch`, which was the same thing while Home had
     * one lazy card. M231 gave it a second, and a regex that stops at the
     * first hit would have read the coach card's fallback and called the
     * daily's checked — a `null` behind the new boundary would have shipped
     * green.
     */
    const boundaries = home.split('<Suspense').slice(1);
    expect(boundaries.length, 'no lazy boundary on Home at all').toBeGreaterThan(0);

    /**
     * `SkeletonCard`, or a skeleton this file defines itself (PLAN.md M239).
     *
     * The rule was `<SkeletonCard` exactly, which was the same thing while
     * every boundary held a card. M239's numbers are a figure, a bar and a
     * row of three tiles, and a three-line card placeholder in that slot
     * reserves the wrong height — which is the shift this rule exists to
     * prevent, with extra steps.
     *
     * So the shape is the caller's and the *reserving* is the rule: the
     * fallback names a skeleton, and a bespoke one has to be defined here
     * and has to draw something, or the name is a placeholder for a
     * placeholder.
     */
    const bespoke = new Set<string>();
    for (const boundary of boundaries) {
      const head = boundary.slice(0, 500);
      const named = /fallback=\{[\s\S]{0,400}?<(\w*Skeleton\w*)/.exec(head);
      expect(named?.[1], 'a boundary with nothing skeleton-shaped behind it — PLAN.md M183').toBeTruthy();
      if (named![1] !== 'SkeletonCard') bespoke.add(named![1]!);
    }
    for (const name of bespoke) {
      expect(home, `${name} is named as a fallback but not defined on Home`).toMatch(
        new RegExp(`function ${name}\\(`),
      );
      const body = home.slice(home.indexOf(`function ${name}(`));
      expect(body.slice(0, 1400), `${name} reserves no height — PLAN.md M183`).toMatch(/bg-sunken/);
    }
    expect(home, 'a null fallback collapses the slot — PLAN.md M183').not.toMatch(
      /fallback=\{null\}/,
    );
  });
});

/**
 * Modules nothing imports, and why each is allowed to be one.
 *
 * Exact rather than a floor: a list that only says "at most two" lets the
 * third through.
 */
const TEST_ONLY: Record<string, string> = {
  'src/content/validate.ts': 'its own header: runs over the whole catalog in tests',
  'src/test/canvas.ts': 'the jsdom canvas M219 built and M226 shared, imported only by tests',
  'src/test/wall.ts':
    'the wall M232 built to order and M287 shared, reached by a vi.mock factory this sweep cannot see',
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
