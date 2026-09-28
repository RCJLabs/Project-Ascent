import { describe, expect, it } from 'vitest';
import { firstLoadModules, KEPT, lazyOnly, readSources, type Source } from './lazyOnly';

/**
 * Code in the first load that only lazy pages use (PLAN.md M344).
 *
 * The rule and its reasons are in `lazyOnly.ts`. This is the rule held both
 * ways over small fixtures, and then the sweep over the app, which fails on
 * anything new — and on anything listed that has since been fixed, so the
 * lists below only shrink.
 */

const files = (spec: Record<string, string>): Source[] =>
  Object.entries(spec).map(([path, source]) => ({ path, source }));
const keys = (found: { module: string; name: string }[]) => found.map((f) => `${f.module}#${f.name}`);

describe('what is in the first load', () => {
  it('is what the entry reaches by import, and not by import()', () => {
    const first = firstLoadModules(
      files({
        'src/main.tsx': "import { a } from './a';\nimport '@/side';\nvoid import('./lazy');\nexport const x = a;",
        'src/a.ts': "import { b } from './b';\nexport const a = b;",
        'src/b.ts': 'export const b = 1;',
        'src/side.ts': 'console.log(1);',
        'src/lazy.tsx': "import { a } from './a';\nexport const y = a;",
      }),
    );
    expect([...first].sort()).toEqual(['src/a.ts', 'src/b.ts', 'src/main.tsx', 'src/side.ts']);
  });

  it('leaves out a module only `import type` names, and keeps one `import { type }` names', () => {
    // Under `verbatimModuleSyntax` the second is emitted as `import {} from`,
    // which still loads the module.
    const first = firstLoadModules(
      files({
        'src/main.tsx': "import type { A } from './erased';\nimport { type B } from './kept';\nexport type C = A | B;",
        'src/erased.ts': 'export type A = 1;',
        'src/kept.ts': 'export type B = 2;',
      }),
    );
    expect(first.has('src/erased.ts')).toBe(false);
    expect(first.has('src/kept.ts')).toBe(true);
  });
});

describe('what counts as lazy-only', () => {
  const app = (a: string, lazy: string, extra: Record<string, string> = {}) =>
    lazyOnly(
      files({
        'src/main.tsx': "import { used } from './a';\nvoid import('./page');\nexport const x = used;",
        'src/a.ts': a,
        'src/page.tsx': lazy,
        ...extra,
      }),
    );

  it('finds an export only a lazy page imports, and not one the first load imports', () => {
    const found = app('export const used = 1;\nexport function lazy() { return 2; }', "import { lazy, used } from './a';\nexport const p = lazy() + used;");
    expect(keys(found)).toEqual(['src/a.ts#lazy']);
    expect(found[0]!.importers).toEqual(['src/page.tsx']);
  });

  it('does not report an export nobody imports, which the bundler drops anyway', () => {
    expect(app('export const used = 1;\nexport const unused = 2;', 'export const p = 1;')).toEqual([]);
  });

  it('follows what the first load needs through the module', () => {
    // `used` calls `helper`, so `helper` is in the first load for a reason
    // even though the only file that imports it is lazy.
    const found = app(
      'export function helper() { return 1; }\nexport function used() { return helper(); }',
      "import { helper } from './a';\nexport const p = helper();",
    );
    expect(found).toEqual([]);
  });

  it('and does not stop at the first lazy-only export — what only it uses is lazy-only too', () => {
    const found = app(
      'export const used = 1;\nexport function inner() { return 1; }\nexport function outer() { return inner(); }',
      "import { inner, outer } from './a';\nexport const p = outer() + inner();",
    );
    expect(keys(found)).toEqual(['src/a.ts#inner', 'src/a.ts#outer']);
  });

  it('keeps what a statement that runs at load names', () => {
    const found = app(
      "export const used = 1;\nexport const TABLE = [1, 2];\nregister(TABLE);\ndeclare function register(t: number[]): void;",
      "import { TABLE } from './a';\nexport const p = TABLE;",
    );
    expect(found).toEqual([]);
  });

  it('does not take a property of the same name for a reference', () => {
    // `table` is needed through `used`, and names `lazy` twice — as a key
    // and as a property read. Neither is the function.
    const found = app(
      'export const table = { lazy: 1 };\nexport const used = () => table.lazy;\nexport function lazy() { return 2; }',
      "import { lazy } from './a';\nexport const p = lazy();",
    );
    expect(keys(found)).toEqual(['src/a.ts#lazy']);
  });

  it('counts an import through a barrel against the module that declares it', () => {
    // The entry reaches `used` through the barrel and the page reaches it
    // directly: one name, so it is needed. `renamed` and `viaStar` reach the
    // page only through the barrel, each by one of its two forms.
    const found = lazyOnly(
      files({
        'src/main.tsx': "import { used } from './barrel';\nvoid import('./page');\nexport const x = used;",
        'src/barrel.ts': "export { used, lazy as renamed } from './a';\nexport * from './b';",
        'src/a.ts': 'export const used = 1;\nexport const lazy = 2;',
        'src/b.ts': 'export function viaStar() { return 2; }',
        'src/page.tsx':
          "import { renamed, viaStar } from './barrel';\nimport { used } from './a';\nexport const p = renamed + viaStar() + used;",
      }),
    );
    expect(keys(found)).toEqual(['src/a.ts#lazy', 'src/b.ts#viaStar']);
  });

  it('reads `import * as` in the first load as using all of it', () => {
    const found = lazyOnly(
      files({
        'src/main.tsx': "import * as A from './a';\nvoid import('./page');\nexport const x = A;",
        'src/a.ts': 'export function lazy() { return 1; }',
        'src/page.tsx': "import { lazy } from './a';\nexport const p = lazy();",
      }),
    );
    expect(found).toEqual([]);
  });

  it('resolves the `@/` alias and a directory index', () => {
    const found = lazyOnly(
      files({
        'src/main.tsx': "import { used } from '@/lib';\nvoid import('./page');\nexport const x = used;",
        'src/lib/index.ts': 'export const used = 1;\nexport const lazy = 2;',
        'src/page.tsx': "import { lazy } from '@/lib';\nexport const p = lazy;",
      }),
    );
    expect(keys(found)).toEqual(['src/lib/index.ts#lazy']);
  });
});

/**
 * Still to move (PLAN.md M343a): what was left after M344 took the ten
 * largest modules' lazy code out, and what taking it out uncovered.
 * **This list only shrinks.** Something new arriving in the first load for
 * lazy pages alone fails below, with its name.
 */
const PENDING: readonly string[] = [
  'src/content/drills/index.ts#DRILL_CATEGORIES',
  'src/content/drills/index.ts#drillsByCategory',
  'src/content/metrics.ts#getMetric',
  'src/content/types.ts#parseCount',
  'src/db/projects.ts#ACTIVE_CAP',
  'src/db/schema.ts#EXPORTABLE_STORES',
  'src/db/schema.ts#SNAPSHOT_KEY',
  'src/db/sound.ts#readingProblems',
  'src/engine/adapt.ts#MIN_ADAPTED_WEEKS',
  'src/engine/adapt.ts#lengthsFor',
  'src/engine/assessments.ts#STALE_DAYS',
  'src/engine/assessments.ts#allMetrics',
  'src/engine/assessments.ts#formatEntry',
  'src/engine/assessments.ts#isChartable',
  'src/engine/assessments.ts#parseMetricInput',
  'src/engine/assessments.ts#seriesFor',
  'src/engine/avatar.ts#SKIN_TONES',
  'src/engine/avatar.ts#deriveAvatar',
  'src/engine/away.ts#AWAY_LABELS',
  'src/engine/away.ts#NOTE_LIMIT',
  'src/engine/away.ts#awayLength',
  'src/engine/away.ts#awayName',
  'src/engine/away.ts#awayOn',
  'src/engine/away.ts#awayOverlapping',
  'src/engine/away.ts#cleanNote',
  'src/engine/away.ts#explainsGap',
  'src/engine/away.ts#newAwayId',
  'src/engine/away.ts#wasClimbing',
  'src/engine/bodyLoad.ts#drillLoads',
  'src/engine/bodyLoad.ts#exerciseLoads',
  'src/engine/bodyLoad.ts#metricConflict',
  'src/engine/bodyLoad.ts#partsInText',
  'src/engine/bodyLoad.ts#protocolSafety',
  'src/engine/bodyLoad.ts#unspokenFor',
  'src/engine/dates.ts#isThisMonth',
  'src/engine/dates.ts#isThisWeek',
  'src/engine/dates.ts#isYearKey',
  'src/engine/dates.ts#monthGrid',
  'src/engine/dates.ts#monthLabel',
  'src/engine/fingerGap.ts#FINGER_GAP_HOURS',
  'src/engine/fingerGap.ts#fingerGaps',
  'src/engine/grades.ts#displayRange',
  'src/engine/grades.ts#maxGrade',
  'src/engine/grades.ts#parseGrade',
  'src/engine/gym.ts#REST_PRESETS',
  'src/engine/gym.ts#climbOutcome',
  'src/engine/gym.ts#restLabel',
  'src/engine/gym.ts#restRemaining',
  'src/engine/injury.ts#describeInjury',
  'src/engine/injury.ts#summarise',
  'src/engine/injury.ts#vitalityCost',
  'src/engine/live.ts#durationFromSpan',
  'src/engine/live.ts#formatCountdown',
  'src/engine/offline.ts#formatBytes',
  'src/engine/plan.ts#blockStatus',
  'src/engine/plan.ts#deloadLightens',
  'src/engine/plan.ts#easesAnything',
  'src/engine/reschedule.ts#previewMove',
  'src/engine/rest.ts#startedAsRest',
  'src/engine/sessionEdit.ts#canMerge',
  'src/engine/sessionEdit.ts#describeSession',
  'src/engine/sessionLength.ts#programSessionLengths',
  'src/engine/templates.ts#alreadySaved',
  'src/engine/templates.ts#applyTemplate',
  'src/engine/units.ts#feetFromMetres',
  'src/engine/units.ts#formatHeight',
  'src/engine/units.ts#heightValue',
  'src/engine/units.ts#isAddedWeight',
  'src/engine/weekTally.ts#tallied',
  'src/engine/weekTally.ts#weekTense',
  'src/lib/openedView.ts#openedViewFor',
  'src/store/profile.ts#SEVERITY_LABEL',
  'src/store/profile.ts#STATUS_LABEL',
  'src/store/undo.ts#offerUndo',
  'src/ui/PageGrid.tsx#Wide',
  'src/ui/Skeleton.tsx#PageSkeleton',
  'src/ui/routes.ts#browsable',
  'src/ui/routes.ts#parentOf',
  'src/ui/routes.ts#venueHref',
  'src/ui/routes.ts#weekHref',
  'src/ui/themes.ts#FOREGROUNDS',
  'src/ui/themes.ts#SURFACES',
];

describe('the app', () => {
  const sources = readSources();
  const found = lazyOnly(sources);

  it('reads the real first load', () => {
    const first = firstLoadModules(sources);
    expect(first.has('src/main.tsx')).toBe(true);
    expect(first.has('src/App.tsx')).toBe(true);
    // A page the router loads with import(), and the coach behind it.
    expect(first.has('src/features/coach/CoachPage.tsx')).toBe(false);
    expect(first.has('src/engine/coach.ts')).toBe(false);
    expect(first.size).toBeGreaterThan(50);
  });

  it('puts nothing new in the first load that only lazy pages use', () => {
    const known = new Set([...Object.keys(KEPT), ...PENDING]);
    const fresh = found.filter((f) => !known.has(`${f.module}#${f.name}`));
    expect(
      fresh.map((f) => `${f.module}#${f.name} — used only by ${f.importers.join(', ')}`),
      'in the first load, and nothing there uses it: move it to a module those pages import, or add it to KEPT with the reason',
    ).toEqual([]);
  });

  it('lists nothing that has since been moved', () => {
    const now = new Set(keys(found));
    expect(
      [...Object.keys(KEPT), ...PENDING].filter((k) => !now.has(k)),
      'no longer lazy-only: take it off the list',
    ).toEqual([]);
  });

  it('gives every kept one its reason', () => {
    for (const [key, reason] of Object.entries(KEPT)) expect(reason.length, key).toBeGreaterThan(20);
    expect(PENDING.filter((k) => k in KEPT)).toEqual([]);
  });
});
