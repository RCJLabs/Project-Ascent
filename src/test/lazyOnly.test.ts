import { describe, expect, it } from 'vitest';
import { firstLoadModules, KEPT, lazyOnly, readSources, type Source } from './lazyOnly';

/**
 * Code in the first load that only lazy pages use (PLAN.md M344, M345).
 *
 * The rule and its reasons are in `lazyOnly.ts`. This is the rule held both
 * ways over small fixtures, and then the sweep over the app. Since M345 the
 * app has nothing lazy-only in its first load except what `KEPT` names with
 * a reason, so the sweep fails on anything new, and on anything kept that
 * has since moved.
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

  it('does not count an importer the app never loads, such as a script or a test helper', () => {
    // `tool.ts` is reached by nothing, not even `import()`, so no chunk
    // holds what it uses and Rollup drops `forTools` either way.
    const found = app('export const used = 1;\nexport const forTools = 2;', 'export const p = 1;', {
      'src/tool.ts': "import { forTools } from './a';\nexport const t = forTools;",
    });
    expect(found).toEqual([]);
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

  it('follows what is needed into the modules it imports, and no further than is used', () => {
    // `t.ts` is in the first load because `a.ts` imports it, and only for
    // `lazy`, which nothing the entry runs calls. So `TABLE` is lazy-only
    // too, though every file that imports it is in the first load.
    const found = lazyOnly(
      files({
        'src/main.tsx': "import { used } from './a';\nvoid import('./page');\nexport const x = used;",
        'src/a.ts': "import { TABLE, other } from './t';\nexport const used = other;\nexport function lazy() { return TABLE; }",
        'src/t.ts': 'export const TABLE = [1, 2];\nexport const other = 3;',
        'src/page.tsx': "import { lazy } from './a';\nexport const p = lazy();",
      }),
    );
    expect(keys(found)).toEqual(['src/a.ts#lazy', 'src/t.ts#TABLE']);
    expect(found[1]!.importers).toEqual(['src/a.ts']);
  });

  it('runs what a module does on load when any loaded module imports it', () => {
    // Nothing needed names `TABLE`, but `t.ts` hands it to `register` when
    // it loads, and it loads because `a.ts` imports it.
    const found = lazyOnly(
      files({
        'src/main.tsx': "import { used } from './a';\nvoid import('./page');\nexport const x = used;",
        'src/a.ts': "import { TABLE } from './t';\nexport const used = 1;\nexport function lazy() { return TABLE; }",
        'src/t.ts': 'export const TABLE = [1, 2];\nregister(TABLE);\ndeclare function register(t: number[]): void;',
        'src/page.tsx': "import { lazy } from './a';\nexport const p = lazy();",
      }),
    );
    expect(keys(found)).toEqual(['src/a.ts#lazy']);
  });

  it('reads `export * as` through a barrel as all of the module', () => {
    const found = lazyOnly(
      files({
        'src/main.tsx': "import { A } from './barrel';\nvoid import('./page');\nexport const x = A;",
        'src/barrel.ts': "export * as A from './a';",
        'src/a.ts': 'export function lazy() { return 1; }',
        'src/page.tsx': "import { lazy } from './a';\nexport const p = lazy();",
      }),
    );
    expect(found).toEqual([]);
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
    const known = new Set(Object.keys(KEPT));
    const fresh = found.filter((f) => !known.has(`${f.module}#${f.name}`));
    expect(
      fresh.map((f) => `${f.module}#${f.name} — used only by ${f.importers.join(', ')}`),
      'in the first load, and nothing there uses it: move it to a module those pages import, or add it to KEPT with the reason',
    ).toEqual([]);
  });

  it('writes an import that names only types as `import type`', () => {
    // `import { type A }` is emitted as `import {} from`, which loads the
    // module for nothing. One in `reschedule.ts` held the scheduler's week
    // validation in the first load after everything that called it had
    // gone (PLAN.md M345).
    const loose = sources.flatMap(({ path, source }) =>
      [...source.matchAll(/^import \{([^}]*)\} from '([^']+)';/gm)]
        .filter((m) => m[1]!.split(',').filter((s) => s.trim()).every((s) => /^\s*type\s/.test(s)))
        .map((m) => `${path}: ${m[0].replace(/\s+/g, ' ')}`),
    );
    expect(loose, 'write these as `import type { … }`').toEqual([]);
  });

  it('lists nothing that has since been moved', () => {
    const now = new Set(keys(found));
    expect(
      Object.keys(KEPT).filter((k) => !now.has(k)),
      'no longer lazy-only: take it off the list',
    ).toEqual([]);
  });

  it('gives every kept one its reason', () => {
    for (const [key, reason] of Object.entries(KEPT)) expect(reason.length, key).toBeGreaterThan(20);
  });
});
