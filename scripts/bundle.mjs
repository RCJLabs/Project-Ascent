/**
 * What the first load is made of, and what a change added to it (PLAN.md
 * M328).
 *
 *     npm run bundle                       the entry chunk, by source file
 *     npm run bundle -- --against HEAD     what the working tree added since HEAD
 *     npm run bundle -- --against main --top 40
 *
 * `perf.test.ts` says *whether* the first load fits its budget. It could
 * never say what moved it, and every milestone that went over answered that
 * by hand: build with sourcemaps, stash, build again, walk both maps, diff.
 * M325 did it to find that a test-week planner, a safety note and a phrase
 * helper had all reached the boot path through one import; M327 did it to
 * find a function only the logger calls sitting in a module Home loads.
 * Both were a sentence once found. This finds them.
 *
 * ## What the numbers mean
 *
 * - **Minified bytes** are the entry chunk's own characters, attributed to
 *   the source file the sourcemap says they came from.
 * - **Gzip cost** is what the first load would lose if that file's bytes
 *   were gone: the entry gzipped whole, minus the entry gzipped without
 *   them. Gzip is not additive — a file's words are cheap if the rest of the
 *   chunk already says them — so these do not sum to the total, and the one
 *   that matters for a decision is this one.
 *
 * Builds go to `node_modules/.cache/ascent-bundle`, never `dist`, which the
 * test suite reads. A comparison builds the other ref in a git worktree
 * there, sharing this checkout's `node_modules`, and removes it after.
 *
 * Rebuilds of an unchanged tree differ by about 0.02KB (`__BUILT_AT__` and
 * chunk-hash churn, measured at M145), so a difference smaller than that is
 * not a change.
 */

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { BUDGET, entryName, firstLoad } from './firstLoad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'ascent-bundle');
/** Rebuild-to-rebuild noise, in kilobytes (M145). */
export const NOISE_KB = 0.02;

// ── Sourcemaps ─────────────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DIGIT = new Map([...B64].map((c, i) => [c, i]));

/** One segment's fields, each a signed integer delta. */
export function decodeVlq(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = DIGIT.get(ch);
    if (digit === undefined) throw new Error(`not base64 VLQ: ${JSON.stringify(segment)}`);
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) {
      shift += 5;
      continue;
    }
    out.push(value % 2 === 1 ? -(value - 1) / 2 : value / 2);
    value = 0;
    shift = 0;
  }
  return out;
}

/**
 * Per generated line, the column each segment starts at and the source it
 * maps to — or -1 for a segment that maps to nothing.
 *
 * Only the two fields this needs are kept. The generated column resets on
 * every line; the source index carries across lines, which is the one rule
 * of the format that is easy to get wrong.
 */
export function decodeMappings(mappings) {
  const lines = [];
  let source = 0;
  for (const line of mappings.split(';')) {
    const segments = [];
    let column = 0;
    for (const segment of line === '' ? [] : line.split(',')) {
      const fields = decodeVlq(segment);
      column += fields[0];
      if (fields.length >= 4) {
        source += fields[1];
        segments.push([column, source]);
      } else {
        segments.push([column, -1]);
      }
    }
    lines.push(segments);
  }
  return lines;
}

/**
 * A source, named for a reader: `src/engine/x.ts`, or a dependency by its
 * package, `node_modules/react-dom`.
 *
 * Named from the file's absolute path, because the builds are written under
 * `node_modules/.cache` and a relative path from there to a dependency never
 * says `node_modules` — `../../../react-dom/…` — which is how the first
 * comparison listed react-dom as having left the entry chunk. Only a
 * `node_modules/<package>` that is not `.cache` is a dependency; anything
 * else is named from the root it was built in. A bundler's virtual module
 * keeps its own name.
 */
export function sourceName(file, root = '') {
  if (file.includes('\0')) return file.slice(file.indexOf('\0') + 1);
  const clean = file.replace(/\\/g, '/');
  const deps = [...clean.matchAll(/node_modules\/((?:@[^/]+\/)?[^/.][^/]*)/g)];
  if (deps.length > 0) return `node_modules/${deps.at(-1)[1]}`;
  const named = root === '' ? clean : path.relative(root, clean).replace(/\\/g, '/');
  return named.replace(/^(\.\.\/)+/, '');
}

/**
 * The generated code, cut into spans by the source each came from.
 *
 * Returns spans as `[start, end]` string offsets per source name, and the
 * length no segment claims (the runtime's own glue, and anything before a
 * line's first segment).
 */
export function attribute(code, map, name = sourceName) {
  const decoded = decodeMappings(map.mappings);
  const names = map.sources.map((raw) => name(raw));
  const spans = new Map();
  let offset = 0;
  let claimed = 0;
  const lines = code.split('\n');
  lines.forEach((text, i) => {
    const segments = decoded[i] ?? [];
    for (let k = 0; k < segments.length; k += 1) {
      const [column, source] = segments[k];
      const end = k + 1 < segments.length ? segments[k + 1][0] : text.length;
      if (source < 0 || end <= column) continue;
      const named = names[source] ?? '?';
      if (!spans.has(named)) spans.set(named, []);
      spans.get(named).push([offset + column, offset + end]);
      claimed += end - column;
    }
    offset += text.length + 1;
  });
  return { spans, unclaimed: code.length - claimed };
}

/** The code with some spans taken out, for measuring what they cost. */
export function without(code, cut) {
  const sorted = [...cut].sort((a, b) => a[0] - b[0]);
  let out = '';
  let at = 0;
  for (const [start, end] of sorted) {
    if (start > at) out += code.slice(at, start);
    at = Math.max(at, end);
  }
  return out + code.slice(at);
}

const gz = (text) => gzipSync(Buffer.from(text)).length;

/** Every source in the entry chunk, with its bytes and its gzip cost. */
export function composition(code, map, name = sourceName) {
  const { spans, unclaimed } = attribute(code, map, name);
  const whole = gz(code);
  const rows = [...spans].map(([name, cut]) => ({
    name,
    bytes: cut.reduce((n, [a, b]) => n + Buffer.byteLength(code.slice(a, b)), 0),
    gzip: whole - gz(without(code, cut)),
  }));
  rows.sort((a, b) => b.gzip - a.gzip || b.bytes - a.bytes);
  return { rows, unclaimed, whole };
}

// ── The files the entry names ──────────────────────────────────────────────

/**
 * Every other file the entry names, once each (PLAN.md M336).
 *
 * Vite's preload map lists every lazy chunk and stylesheet the app may load,
 * as `"assets/<name>-<hash>.js"`, and each dynamic import names its chunk
 * again as `./<name>-<hash>.js`. None of it is any source file's, so the
 * sourcemap attributes it to nothing — and M334's first version went over
 * budget on nothing else. A lucide icon shared by two lazy pages became a
 * chunk of its own, the list gained its name, and this tool reported *"No
 * source file changed size in the entry chunk"*, which was true and useless.
 */
const NAMED = /"assets\/([\w.-]+?\.(?:js|css))"|\.\/([\w.-]+?-[\w-]{8}\.js)/g;
/** The same, with the comma a list entry leaves behind, for costing them. */
const NAMED_ENTRY = /"assets\/[\w.-]+?\.(?:js|css)",?|\.\/[\w.-]+?-[\w-]{8}\.js/g;

export function namedFiles(code) {
  const files = new Set();
  for (const m of code.matchAll(NAMED)) files.add(m[1] ?? m[2]);
  return [...files].sort();
}

/** `pencil-line-C0cmnosM.js` → `pencil-line`: the name, without the hash. */
export function chunkName(file) {
  return path.basename(file).replace(/-[\w-]{8}\.(?:js|css)$/, '');
}

/**
 * Names the entry gained and lost between two builds.
 *
 * Counted rather than compared as sets: two chunks can share a name — the
 * app has two called `skills` — and a third would be a new file in the list
 * that a set would not see.
 */
export function chunkChanges(before, after) {
  const count = (files) => {
    const n = new Map();
    for (const f of files) n.set(chunkName(f), (n.get(chunkName(f)) ?? 0) + 1);
    return n;
  };
  const a = count(before);
  const b = count(after);
  const diff = (x, y) =>
    [...x].flatMap(([name, k]) => Array.from({ length: Math.max(0, k - (y.get(name) ?? 0)) }, () => name)).sort();
  return { added: diff(b, a), removed: diff(a, b) };
}

/**
 * What the names cost the first load, gzipped: the entry with them and
 * without. About 3KB when this was written, of 120 — content hashes do not
 * compress, so a new name is roughly fifteen bytes whatever it is called.
 */
export function namesCost(code) {
  return gz(code) - gz(code.replace(NAMED_ENTRY, ''));
}

// ── Builds ─────────────────────────────────────────────────────────────────

function build(root, outDir) {
  execFileSync(
    path.join(ROOT, 'node_modules', '.bin', 'vite'),
    ['build', '--sourcemap', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] },
  );
  const entry = entryName(outDir);
  const code = readFileSync(path.join(outDir, 'assets', entry), 'utf8');
  const map = JSON.parse(readFileSync(path.join(outDir, 'assets', `${entry}.map`), 'utf8'));
  const assets = path.join(outDir, 'assets', map.sourceRoot ?? '');
  // Virtual modules are not paths, and resolving one makes it look like one.
  const name = (raw) => (raw.includes('\0') ? sourceName(raw) : sourceName(path.resolve(assets, raw), root));
  return { load: firstLoad(outDir), named: namedFiles(code), namesCost: namesCost(code), ...composition(code, map, name) };
}

/**
 * Another ref, built as the app builds it.
 *
 * In a git worktree in the system's temp directory, with this checkout's
 * `node_modules` linked in. Both halves of that were learned the hard way:
 *
 * - **Not under `node_modules/.cache`**, where the first version put it.
 *   Vite does not apply `tsconfig.json` to a file whose path contains
 *   `node_modules`, so the other ref compiled its class fields into
 *   constructors and an identical tree measured 44 bytes apart in
 *   `ErrorBoundary.tsx`.
 * - **With the link ignored.** The repo ignores `node_modules/`, which is a
 *   directory pattern, and a link is not a directory — so Tailwind scanned
 *   every package through it and the other ref's stylesheet came out 77KB
 *   against 48KB. The worktree's own `.gitignore` gets the bare name.
 */
function buildRef(ref) {
  const tree = mkdtempSync(path.join(tmpdir(), 'ascent-bundle-'));
  rmSync(tree, { recursive: true, force: true });
  // A run that died half-way leaves a registration behind.
  execFileSync('git', ['worktree', 'prune'], { cwd: ROOT });
  execFileSync('git', ['worktree', 'add', '--detach', tree, ref], { cwd: ROOT, stdio: 'ignore' });
  try {
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
    appendFileSync(path.join(tree, '.gitignore'), '\nnode_modules\n');
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: tree }).toString().trim();
    return { sha, ...build(tree, path.join(CACHE, 'against')) };
  } finally {
    execFileSync('git', ['worktree', 'remove', '--force', tree], { cwd: ROOT });
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

const kb = (bytes) => (bytes / 1024).toFixed(2);
const signed = (n, digits = 2) => {
  const shown = Math.abs(n).toFixed(digits);
  if (Number(shown) === 0) return `±${shown}`;
  return `${n > 0 ? '+' : '−'}${shown}`;
};

export function headline(load) {
  const room = BUDGET - load.kb;
  return (
    `First load ${load.kb.toFixed(2)}KB gzipped (entry ${kb(load.js)} + css ${kb(load.css)}), ` +
    `budget ${BUDGET}: ${room >= 0 ? `${room.toFixed(2)}KB of headroom` : `${(-room).toFixed(2)}KB OVER`}.`
  );
}

/** Rows that differ between two builds, largest gzip change first. */
export function changes(before, after) {
  const was = new Map(before.rows.map((r) => [r.name, r]));
  const now = new Map(after.rows.map((r) => [r.name, r]));
  const names = new Set([...was.keys(), ...now.keys()]);
  return [...names]
    .map((name) => {
      const a = was.get(name);
      const b = now.get(name);
      return {
        name,
        status: a === undefined ? 'new' : b === undefined ? 'gone' : 'changed',
        bytes: (b?.bytes ?? 0) - (a?.bytes ?? 0),
        gzip: (b?.gzip ?? 0) - (a?.gzip ?? 0),
      };
    })
    .filter((c) => c.bytes !== 0)
    .sort((x, y) => Math.abs(y.gzip) - Math.abs(x.gzip) || Math.abs(y.bytes) - Math.abs(x.bytes));
}

function main(argv) {
  const at = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? undefined : argv[i + 1];
  };
  const top = Number(at('--top') ?? 25);
  const against = at('--against');
  mkdirSync(CACHE, { recursive: true });

  const here = build(ROOT, path.join(CACHE, 'here'));
  console.log(headline(here.load));

  if (against === undefined) {
    console.log(`\nThe entry chunk by source — gzip cost if removed, then minified bytes:`);
    for (const r of here.rows.slice(0, top)) {
      console.log(`  ${kb(r.gzip).padStart(6)}KB  ${String(r.bytes).padStart(7)}B  ${r.name}`);
    }
    const rest = here.rows.length - top;
    if (rest > 0) console.log(`  … and ${rest} more (--top ${here.rows.length} for all)`);
    console.log(`  ${String(here.unclaimed).padStart(16)}B  unattributed (bundler glue)`);
    console.log(
      `\nThe entry names ${here.named.length} other files it may load, and their names cost ` +
        `${kb(here.namesCost)}KB of it gzipped.`,
    );
    return;
  }

  const base = buildRef(against);
  const delta = here.load.kb - base.load.kb;
  console.log(
    `Against ${against} (${base.sha}): ${base.load.kb.toFixed(2)} → ${here.load.kb.toFixed(2)}KB ` +
      `(${signed(delta)}KB)${Math.abs(delta) <= NOISE_KB ? ' — within rebuild noise' : ''}.`,
  );
  const moved = changes(base, here);
  const arrived = moved.filter((c) => c.status === 'new');
  if (arrived.length > 0) {
    console.log(`\nNew in the entry chunk — reached the boot path through an import:`);
    for (const c of arrived) console.log(`  ${signed(c.gzip / 1024).padStart(7)}KB  ${signed(c.bytes, 0).padStart(7)}B  ${c.name}`);
  }
  const rest = moved.filter((c) => c.status !== 'new').slice(0, top);
  if (rest.length > 0) {
    console.log(`\nChanged — gzip cost, then minified bytes:`);
    for (const c of rest) {
      console.log(`  ${signed(c.gzip / 1024).padStart(7)}KB  ${signed(c.bytes, 0).padStart(7)}B  ${c.name}${c.status === 'gone' ? '  (left)' : ''}`);
    }
  }
  const { added, removed } = chunkChanges(base.named, here.named);
  if (added.length > 0 || removed.length > 0) {
    console.log(`\nFiles the entry names — each a name in its preload list, and no source file's:`);
    for (const name of added) console.log(`  + ${name}`);
    for (const name of removed) console.log(`  − ${name}`);
    console.log(
      `  ${base.named.length} → ${here.named.length} files; the names cost ` +
        `${kb(base.namesCost)} → ${kb(here.namesCost)}KB gzipped.`,
    );
  }
  if (here.unclaimed !== base.unclaimed) {
    console.log(`\nUnattributed (bundler glue): ${base.unclaimed} → ${here.unclaimed}B.`);
  }
  if (moved.length === 0) {
    console.log(
      added.length + removed.length > 0
        ? '\nNo source file changed size in the entry chunk; what moved is the list of files it names, above.'
        : '\nNo source file changed size in the entry chunk.',
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
