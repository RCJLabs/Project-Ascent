import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';

const ROOT = '/home/user/Project-Ascent/src';
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})(ROOT);

const isTest = (p) => /\.test\.(ts|tsx)$/.test(p) || p.includes('/test/');
const src = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// resolve an import specifier to a file path
function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base + '.ts', base + '.tsx', join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (src.has(c)) return c;
  }
  return null;
}

const importedBy = new Map(files.map((f) => [f, []]));
for (const [file, text] of src) {
  for (const m of text.matchAll(/(?:from|import)\s*\(?\s*'([^']+)'/g)) {
    const t = resolveSpec(file, m[1]);
    if (t && t !== file) importedBy.get(t).push(file);
  }
}

const entry = new Set([join(ROOT, 'main.tsx'), join(ROOT, 'App.tsx')]);
const rows = [];
for (const f of files) {
  if (isTest(f) || entry.has(f)) continue;
  const users = importedBy.get(f);
  const nonTest = users.filter((u) => !isTest(u));
  if (nonTest.length === 0) {
    rows.push({ f: relative(ROOT, f), tests: users.length, lines: src.get(f).split('\n').length });
  }
}
rows.sort((a, b) => b.lines - a.lines);
console.log('modules nothing outside a test imports:');
for (const r of rows) console.log(`  ${String(r.lines).padStart(4)} lines  ${r.tests} test importer(s)  ${r.f}`);
