/**
 * Code in the first load that only lazy pages use (PLAN.md M344).
 *
 * M341 found `changeOf`, `assessmentStatus` and `assessmentBattery` in the
 * entry chunk. Nothing in the entry called them: their module was there for
 * its parser, and a module is placed whole. M343a looked for the same thing
 * across the build and found 173 exports like them; the 107 that only pages
 * Home never opens use came to 7.3KB of the first load. Nothing could have
 * stopped any one of them arriving. This is the rule.
 *
 * ## What is in the first load
 *
 * With one entry and no manual chunks, Rollup puts a module in the entry
 * chunk exactly when the entry reaches it through static imports. So that is
 * computed from the source, not from a build: everything `src/main.tsx`
 * reaches by `import`, `export … from` and bare `import './x'`, but not by
 * `import()`. `import type` is erased and leads nowhere. `import { type A }`
 * is not — under `verbatimModuleSyntax` it is emitted as `import {} from`,
 * which still loads the module.
 *
 * ## What counts as lazy-only
 *
 * An exported value of a first-load module that some module the app loads
 * imports — at boot or later, through `import()` — and that nothing the entry
 * runs ever reaches. *Reaches* is followed from
 * `src/main.tsx`, statement by statement and across modules: a top-level
 * statement that is not a declaration runs when its module loads; a name a
 * needed statement mentions makes the statement that declares it needed, in
 * its own module or, through the import, in the module that exports it. An
 * import through a barrel is counted against the module that declares the
 * name, and `import * as` against all of them.
 *
 * Across modules, not only within one, because that is how the code hides
 * (PLAN.md M345). M344's version stopped at the import: a first-load module
 * importing a name made it needed, whether or not the code that used it
 * ran. So the 7KB metric registry was *needed* — `assessments.ts` imported it
 * for a function only lazy pages call — and the check never named it.
 *
 * A module that runs something when it loads is loaded with any module that
 * imports it, used or not, which is what Rollup does with side effects. A
 * declaration's initialiser is taken to run nothing worth keeping: `const x =
 * f()` that nothing reads is not needed, even if `f` writes somewhere.
 *
 * It errs toward *needed* on names: a reference is matched by name, so a
 * local that shadows a top-level or imported name keeps the other in. That
 * can hide an export from this check. What it flags, the entry does not call
 * — and moving one it is wrong about fails `tsc`, not a climber, because the
 * code that calls it has to import it from somewhere.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export interface Source {
  /** Relative to the repository root, with forward slashes: `src/engine/x.ts`. */
  path: string;
  source: string;
}

export interface LazyOnly {
  module: string;
  name: string;
  /** The modules outside the first load that import it. */
  importers: string[];
  /** The declaration's span in `module`, for sizing it. */
  start: number;
  end: number;
}

interface Use {
  from: string;
  /** An exported name, or `*` for a namespace import. */
  name: string;
}

interface Parsed {
  sf: ts.SourceFile;
  /** Modules loaded with this one: static value imports and re-exports. */
  deps: string[];
  uses: Use[];
  /** `export { a as b } from './x'`: b → x#a. */
  reexports: Map<string, { from: string; name: string }>;
  /** `export * from './x'`. */
  stars: string[];
  /** Exported name → the local top-level name that holds it. */
  exported: Map<string, string>;
  /** Local name → the value it imports: `import { a as b }` is b → x#a. */
  bindings: Map<string, Use>;
  /** `import('./x')`: loaded later, when the code that asks runs. */
  dynamic: string[];
}

function normalize(parts: string[]): string {
  const out: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

function resolver(paths: ReadonlySet<string>) {
  return (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = `src/${spec.slice(2)}`;
    else if (spec.startsWith('./') || spec.startsWith('../')) base = normalize([...from.split('/').slice(0, -1), ...spec.split('/')]);
    else return null;
    for (const ext of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) if (paths.has(base + ext)) return base + ext;
    return null;
  };
}

const hasExport = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
const hasDefault = (node: ts.Node): boolean =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);

/** The names a top-level statement declares as values. Types declare none. */
function declared(statement: ts.Statement): string[] {
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) return [statement.name.text];
  if (ts.isEnumDeclaration(statement) && !(ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ConstKeyword)) {
    return [statement.name.text];
  }
  if (ts.isVariableStatement(statement)) {
    const names: string[] = [];
    const collect = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) names.push(name.text);
      else for (const element of name.elements) if (!ts.isOmittedExpression(element)) collect(element.name);
    };
    for (const d of statement.declarationList.declarations) collect(d.name);
    return names;
  }
  return [];
}

function parse(file: Source, resolve: (from: string, spec: string) => string | null): Parsed {
  const sf = ts.createSourceFile(
    file.path,
    file.source,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const parsed: Parsed = {
    sf,
    deps: [],
    uses: [],
    reexports: new Map(),
    stars: [],
    exported: new Map(),
    bindings: new Map(),
    dynamic: [],
  };
  const later = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [spec] = node.arguments;
      const target = spec && ts.isStringLiteral(spec) ? resolve(file.path, spec.text) : null;
      if (target !== null) parsed.dynamic.push(target);
    }
    ts.forEachChild(node, later);
  };
  later(sf);
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolve(file.path, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (target === null || clause?.isTypeOnly) continue;
      parsed.deps.push(target);
      const bind = (local: string, use: Use): void => {
        parsed.uses.push(use);
        parsed.bindings.set(local, use);
      };
      if (clause?.name) bind(clause.name.text, { from: target, name: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) bind(bindings.name.text, { from: target, name: '*' });
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) {
          if (!el.isTypeOnly) bind(el.name.text, { from: target, name: (el.propertyName ?? el.name).text });
        }
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const spec = statement.moduleSpecifier;
      if (spec && ts.isStringLiteral(spec)) {
        const target = resolve(file.path, spec.text);
        if (target === null) continue;
        parsed.deps.push(target);
        if (!statement.exportClause) parsed.stars.push(target);
        else if (ts.isNamespaceExport(statement.exportClause)) {
          parsed.reexports.set(statement.exportClause.name.text, { from: target, name: '*' });
        } else if (ts.isNamedExports(statement.exportClause)) {
          for (const el of statement.exportClause.elements) {
            if (el.isTypeOnly) continue;
            parsed.reexports.set(el.name.text, { from: target, name: (el.propertyName ?? el.name).text });
          }
        }
      } else if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const el of statement.exportClause.elements) if (!el.isTypeOnly) parsed.exported.set(el.name.text, (el.propertyName ?? el.name).text);
      }
      continue;
    }
    if (hasExport(statement)) {
      const names = declared(statement);
      if (hasDefault(statement)) parsed.exported.set('default', names[0] ?? 'default');
      else for (const name of names) parsed.exported.set(name, name);
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) parsed.exported.set('default', 'default');
  }
  return parsed;
}

/**
 * The app's own sources under `root`: `src/`, without its tests and without
 * `src/test`, which the build never sees.
 */
export function readSources(root = '.'): Source[] {
  const out: Source[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(path.join(root, dir))) {
      const rel = `${dir}/${entry}`;
      if (statSync(path.join(root, rel)).isDirectory()) {
        if (rel !== 'src/test') walk(rel);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$|\.d\.ts$/.test(entry)) {
        out.push({ path: rel, source: readFileSync(path.join(root, rel), 'utf8') });
      }
    }
  };
  walk('src');
  return out;
}

/** Every module the entry loads, by the rule at the top of this file. */
export function firstLoadModules(files: readonly Source[], entry = 'src/main.tsx'): Set<string> {
  const resolve = resolver(new Set(files.map((f) => f.path)));
  const parsed = new Map(files.map((f) => [f.path, parse(f, resolve)]));
  return closure(parsed, entry);
}

function closure(parsed: ReadonlyMap<string, Parsed>, entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (seen.has(next) || !parsed.has(next)) continue;
    seen.add(next);
    queue.push(...parsed.get(next)!.deps);
  }
  return seen;
}

/** Every module the app can load, now or later: static imports and `import()`. */
function reachable(parsed: ReadonlyMap<string, Parsed>, entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const next = queue.pop()!;
    if (seen.has(next) || !parsed.has(next)) continue;
    seen.add(next);
    queue.push(...parsed.get(next)!.deps, ...parsed.get(next)!.dynamic);
  }
  return seen;
}

/** The module that declares `name`, through any barrels between. */
function origin(parsed: ReadonlyMap<string, Parsed>, file: string, name: string, depth = 0): { file: string; name: string } {
  const p = parsed.get(file);
  if (!p || depth > 20 || p.exported.has(name)) return { file, name };
  const re = p.reexports.get(name);
  if (re) return re.name === '*' ? { file: re.from, name: '*' } : origin(parsed, re.from, re.name, depth + 1);
  for (const star of p.stars) {
    const found = origin(parsed, star, name, depth + 1);
    if (parsed.get(found.file)?.exported.has(found.name)) return found;
  }
  return { file, name };
}

/** Top-level names each top-level statement mentions. */
function references(sf: ts.SourceFile, names: ReadonlySet<string>): Set<string>[] {
  return sf.statements.map((statement) => {
    const found = new Set<string>();
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && names.has(node.text)) {
        const parent = node.parent;
        const isKey =
          (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
          (ts.isPropertyAssignment(parent) && parent.name === node) ||
          ((ts.isFunctionDeclaration(parent) || ts.isClassDeclaration(parent) || ts.isVariableDeclaration(parent)) && parent.name === node);
        if (!isKey) found.add(node.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(statement);
    return found;
  });
}

/** Whether a top-level statement runs something when its module loads. */
function runs(statement: ts.Statement): boolean {
  return !(
    declared(statement).length > 0 ||
    ts.isImportDeclaration(statement) ||
    ts.isExportDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement)
  );
}

export function lazyOnly(files: readonly Source[], entry = 'src/main.tsx'): LazyOnly[] {
  const resolve = resolver(new Set(files.map((f) => f.path)));
  const parsed = new Map(files.map((f) => [f.path, parse(f, resolve)]));
  const first = closure(parsed, entry);

  // Each module's top-level statements: who declares what, and what each
  // one mentions — its own module's names and the names it imports.
  const owners = new Map<string, Map<string, number>>();
  const refs = new Map<string, Set<string>[]>();
  const effects = new Map<string, boolean>();
  for (const [path, p] of parsed) {
    const owner = new Map<string, number>();
    p.sf.statements.forEach((s, i) => declared(s).forEach((name) => owner.set(name, i)));
    owners.set(path, owner);
    refs.set(path, references(p.sf, new Set([...owner.keys(), ...p.bindings.keys()])));
    effects.set(path, p.sf.statements.some(runs));
  }

  // What the first load needs, followed across modules: from the entry,
  // through every name a needed statement mentions, to the statement that
  // declares it — in its own module or the one it is imported from.
  const loaded = new Set<string>();
  const needed = new Map<string, Set<number>>();
  const queue: [string, number][] = [];
  const need = (file: string, i: number | undefined): void => {
    if (i === undefined) return;
    let set = needed.get(file);
    if (!set) needed.set(file, (set = new Set()));
    if (set.has(i)) return;
    set.add(i);
    queue.push([file, i]);
  };
  const load = (file: string): void => {
    const p = parsed.get(file);
    if (!p || loaded.has(file)) return;
    loaded.add(file);
    p.sf.statements.forEach((s, i) => {
      if (file === entry || runs(s)) need(file, i);
    });
    // A module that does something when it loads is loaded with its
    // importer, whether the import names anything or is a bare `import
    // './x'`: Rollup keeps a module's side effects whether or not a name
    // from it is used.
    for (const dep of p.deps) if (effects.get(dep)) load(dep);
  };
  const needExport = (file: string, name: string): void => {
    if (name === '*') {
      load(file);
      const p = parsed.get(file);
      for (const exported of p?.exported.keys() ?? []) needExport(file, exported);
      for (const exported of p?.reexports.keys() ?? []) needExport(file, exported);
      for (const star of p?.stars ?? []) needExport(star, '*');
      return;
    }
    const at = origin(parsed, file, name);
    if (at.name === '*') return needExport(at.file, '*');
    load(at.file);
    const local = parsed.get(at.file)?.exported.get(at.name);
    if (local !== undefined) need(at.file, owners.get(at.file)!.get(local));
  };
  load(entry);
  while (queue.length > 0) {
    const [file, i] = queue.pop()!;
    const p = parsed.get(file)!;
    for (const name of refs.get(file)![i]!) {
      const own = owners.get(file)!.get(name);
      if (own !== undefined) need(file, own);
      else {
        const use = p.bindings.get(name);
        if (use) needExport(use.from, use.name);
      }
    }
  }

  // Who imports what, by the module that declares it — counting only the
  // modules the app can load. A test helper or a script that imports an
  // export does not put it in any chunk, and Rollup drops what only they use.
  const app = reachable(parsed, entry);
  const importers = new Map<string, Map<string, Set<string>>>();
  for (const [path, p] of parsed) {
    if (!app.has(path)) continue;
    for (const use of p.uses) {
      const at = use.name === '*' ? { file: use.from, name: '*' } : origin(parsed, use.from, use.name);
      let byName = importers.get(at.file);
      if (!byName) importers.set(at.file, (byName = new Map()));
      let set = byName.get(at.name);
      if (!set) byName.set(at.name, (set = new Set()));
      set.add(path);
    }
  }

  const out: LazyOnly[] = [];
  for (const module of first) {
    const p = parsed.get(module)!;
    const byName = importers.get(module);
    if (!byName) continue;
    const keep = needed.get(module) ?? new Set<number>();
    for (const [name, local] of p.exported) {
      const i = owners.get(module)!.get(local);
      if (i === undefined || keep.has(i)) continue;
      const users = [...(byName.get(name) ?? []), ...(byName.get('*') ?? [])];
      if (users.length === 0) continue;
      const statement = p.sf.statements[i]!;
      out.push({ module, name, importers: [...new Set(users)].sort(), start: statement.getStart(p.sf), end: statement.getEnd() });
    }
  }
  return out.sort((a, b) => (a.module === b.module ? (a.name < b.name ? -1 : 1) : a.module < b.module ? -1 : 1));
}

/**
 * Lazy-only, and in the first load on purpose, each for the reason given.
 *
 * Moving any of these would cost more than it saves or would break a module
 * in two that is one thing. Here rather than in the test so `npm run bundle`
 * leaves them out of what it offers to move.
 */
export const KEPT: Record<string, string> = {
  'src/db/media.ts#projectOwner':
    'one line beside `sessionOwner`, which the stores need; the two are the owner-key namespace',
  'src/lib/cues.ts#cuesEnabled':
    'reads the switch the settings store sets at boot; moving it means moving the switch',
  'src/content/programs/index.ts#allPrograms': "reads the registry's private maps",
  'src/content/programs/index.ts#writtenProgram': "reads the registry's private maps",
  'src/lib/openedView.ts#openedViewFor':
    'reads the slot `openAt` writes, which is private to the module; moving it means exporting the slot',
  'src/db/sound.ts#readingProblems':
    'reads the counts `recordReading` keeps, which are private to the module; moving it means exporting them',
  'src/engine/rest.ts#startedAsRest':
    'moved and measured at M345: 114.141 → 114.149KB, inside rebuild noise, so not worth a module',
  'src/store/undo.ts#offerUndo':
    'moved and measured at M345: 114.149 → 114.158KB and one more chunk, since thirteen pages share it',
  'src/db/projects.ts#ACTIVE_CAP': 'twenty-seven bytes, a constant beside the project rows it limits',
  'src/engine/plan.ts#blockThrough':
    'moved and measured at M365: in its own module it was one more chunk on a cold Home load (38 → 39 files) for 0.1KB, since the coach, Finish and the assessments share it',
};
