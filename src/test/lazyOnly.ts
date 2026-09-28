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
 * An exported value of a first-load module that at least one module outside
 * the first load imports, and that nothing in the first load needs. *Needs*
 * is followed through the module itself: an export another file in the
 * entry imports is needed, so is a top-level statement that is not a
 * declaration (it runs), and so is any top-level declaration a needed one
 * refers to by name. An import through a barrel's `export … from` is counted
 * against the module that declares the name; `import * as` counts as all of
 * them.
 *
 * It errs toward *needed*: a reference is matched by name, so a local that
 * shadows a top-level name keeps the top-level one in. That can hide an
 * export from this check. It cannot flag one the entry uses.
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
  const parsed: Parsed = { sf, deps: [], uses: [], reexports: new Map(), stars: [], exported: new Map() };
  for (const statement of sf.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolve(file.path, statement.moduleSpecifier.text);
      const clause = statement.importClause;
      if (target === null || clause?.isTypeOnly) continue;
      parsed.deps.push(target);
      if (clause?.name) parsed.uses.push({ from: target, name: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) parsed.uses.push({ from: target, name: '*' });
      if (bindings && ts.isNamedImports(bindings)) {
        for (const el of bindings.elements) if (!el.isTypeOnly) parsed.uses.push({ from: target, name: (el.propertyName ?? el.name).text });
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
        else if (ts.isNamedExports(statement.exportClause)) {
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

/** The module that declares `name`, through any barrels between. */
function origin(parsed: ReadonlyMap<string, Parsed>, file: string, name: string, depth = 0): { file: string; name: string } {
  const p = parsed.get(file);
  if (!p || depth > 20 || p.exported.has(name)) return { file, name };
  const re = p.reexports.get(name);
  if (re) return origin(parsed, re.from, re.name, depth + 1);
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

export function lazyOnly(files: readonly Source[], entry = 'src/main.tsx'): LazyOnly[] {
  const resolve = resolver(new Set(files.map((f) => f.path)));
  const parsed = new Map(files.map((f) => [f.path, parse(f, resolve)]));
  const first = closure(parsed, entry);

  // Who imports what, by the module that declares it.
  const importers = new Map<string, Map<string, Set<string>>>();
  for (const [path, p] of parsed) {
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
    const statements = p.sf.statements;
    const owner = new Map<string, number>();
    statements.forEach((s, i) => declared(s).forEach((name) => owner.set(name, i)));
    const refs = references(p.sf, new Set(owner.keys()));

    // What the first load needs from this module, followed through it.
    const needed = new Set<number>();
    const queue: number[] = [];
    const need = (i: number | undefined): void => {
      if (i !== undefined && !needed.has(i)) {
        needed.add(i);
        queue.push(i);
      }
    };
    statements.forEach((s, i) => {
      const isDeclaration =
        declared(s).length > 0 ||
        ts.isImportDeclaration(s) ||
        ts.isExportDeclaration(s) ||
        ts.isInterfaceDeclaration(s) ||
        ts.isTypeAliasDeclaration(s) ||
        ts.isEnumDeclaration(s) ||
        ts.isModuleDeclaration(s);
      if (!isDeclaration) need(i);
    });
    const firstImports = (name: string) => [...(byName.get(name) ?? []), ...(byName.get('*') ?? [])].some((f) => first.has(f));
    for (const [name, local] of p.exported) if (firstImports(name)) need(owner.get(local));
    while (queue.length > 0) for (const name of refs[queue.pop()!]!) need(owner.get(name));

    for (const [name, local] of p.exported) {
      const i = owner.get(local);
      if (i === undefined || needed.has(i)) continue;
      const lazy = [...(byName.get(name) ?? [])].filter((f) => !first.has(f));
      if (lazy.length === 0) continue;
      const statement = statements[i]!;
      out.push({ module, name, importers: lazy.sort(), start: statement.getStart(p.sf), end: statement.getEnd() });
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
  'src/engine/scheduler.ts#DAY_NAMES':
    'seventy bytes beside `DAY_SHORT`, which `validateWeek` needs; a module of its own costs a chunk name worth as much',
};
