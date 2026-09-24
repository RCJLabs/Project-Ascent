import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import {
  attribute,
  changes,
  composition,
  decodeMappings,
  decodeVlq,
  headline,
  sourceName,
  without,
  chunkChanges,
  chunkName,
  namedFiles,
  namesCost,
} from '../scripts/bundle.mjs';
import { BUDGET, entryName, firstLoad } from '../scripts/firstLoad.mjs';

/**
 * `npm run bundle` (PLAN.md M328).
 *
 * The builds it runs are not tested here — they are twenty seconds each and
 * the numbers they produce were checked against three milestones measured by
 * hand. What is tested is everything between a build and a report: reading
 * a sourcemap, naming a source, costing it, and comparing two.
 */

describe('reading a sourcemap', () => {
  it('decodes a segment', () => {
    expect(decodeVlq('AAAA')).toEqual([0, 0, 0, 0]);
    expect(decodeVlq('CAAC')).toEqual([1, 0, 0, 1]);
    expect(decodeVlq('D')).toEqual([-1]);
    expect(decodeVlq('gB')).toEqual([16]);
    expect(decodeVlq('hB')).toEqual([-16]);
    // Two continuation digits: 22 + 7·32 = 246, halved with its sign bit off.
    expect(decodeVlq('2HAA')).toEqual([123, 0, 0]);
    expect(() => decodeVlq('A!')).toThrow(/not base64 VLQ/);
  });

  it('resets the column each line and carries the source across them', () => {
    // Line one: source 0 at column 0, source 1 at column 3. Line two: back
    // to source 0 at column 0 — a delta of −1 from where line one left it.
    expect(decodeMappings('AAAA,GCAA;ADAA')).toEqual([
      [
        [0, 0],
        [3, 1],
      ],
      [[0, 0]],
    ]);
  });

  it('keeps a segment that maps to nothing as nothing', () => {
    expect(decodeMappings('A,CAAA')).toEqual([
      [
        [0, -1],
        [1, 0],
      ],
    ]);
    expect(decodeMappings(';;AAAA')).toEqual([[], [], [[0, 0]]]);
  });
});

describe('naming a source', () => {
  it('names the app’s own files from the root they were built in', () => {
    expect(sourceName('/repo/src/engine/bodyLoad.ts', '/repo')).toBe('src/engine/bodyLoad.ts');
    expect(sourceName('/tmp/ascent-bundle-x/src/App.tsx', '/tmp/ascent-bundle-x')).toBe('src/App.tsx');
  });

  it('names a dependency by its package, scoped or not', () => {
    expect(sourceName('/repo/node_modules/react-dom/cjs/react-dom.production.js', '/repo')).toBe('node_modules/react-dom');
    expect(sourceName('/repo/node_modules/@scope/pkg/dist/x.js', '/repo')).toBe('node_modules/@scope/pkg');
    // wouter ships a `src/` of its own; it is still wouter.
    expect(sourceName('/repo/node_modules/wouter/src/index.js', '/repo')).toBe('node_modules/wouter');
  });

  it('names a nested dependency by the package whose code it is', () => {
    // The innermost package: a copy of `regexparam` inside wouter is
    // regexparam's code, and that is what a reader is deciding about.
    expect(sourceName('/repo/node_modules/wouter/node_modules/regexparam/dist/index.mjs', '/repo')).toBe(
      'node_modules/regexparam',
    );
  });

  it('does not mistake the cache the builds are written to for a dependency', () => {
    expect(sourceName('/repo/node_modules/.cache/ascent-bundle/x/src/a.ts', '/repo/node_modules/.cache/ascent-bundle/x')).toBe(
      'src/a.ts',
    );
  });

  it('keeps a bundler’s virtual module by its own name', () => {
    expect(sourceName('\0vite/preload-helper.js')).toBe('vite/preload-helper.js');
  });
});

describe('cutting the code by source', () => {
  const code = 'aaabbb\ncc';
  const map = { sources: ['a.ts', 'b.ts'], mappings: 'AAAA,GCAA;ADAA' };

  it('gives each source its own spans', () => {
    const { spans, unclaimed } = attribute(code, map);
    expect(spans.get('a.ts')).toEqual([
      [0, 3],
      [7, 9],
    ]);
    expect(spans.get('b.ts')).toEqual([[3, 6]]);
    // The newline is the one character nothing claims.
    expect(unclaimed).toBe(1);
  });

  it('names sources through the reader it is given', () => {
    const { spans } = attribute(code, map, (raw) => raw.toUpperCase());
    expect([...spans.keys()].sort()).toEqual(['A.TS', 'B.TS']);
  });

  it('takes spans out, overlapping or not', () => {
    expect(without('0123456789', [[2, 4]])).toBe('01456789');
    expect(
      without('0123456789', [
        [6, 8],
        [2, 4],
        [3, 5],
      ]),
    ).toBe('01589');
    // One span wholly inside an earlier one takes nothing more out.
    expect(
      without('0123456789', [
        [2, 8],
        [3, 5],
      ]),
    ).toBe('0189');
  });

  it('costs a source as what the gzip would lose without it', () => {
    // A long unrepeated run is expensive to keep; one that repeats the rest
    // of the chunk is nearly free. That is why the costs are not additive.
    const unique = Array.from({ length: 400 }, (_, i) => String.fromCharCode(33 + ((i * 37) % 90))).join('');
    const echo = 'x'.repeat(400);
    const text = unique + echo;
    const mapped = { sources: ['unique.ts', 'echo.ts'], mappings: `AAAA,${'gZ'}CAA` };
    const { rows, whole } = composition(text, mapped);
    expect(whole).toBe(gzipSync(Buffer.from(text)).length);
    expect(rows.map((r) => r.name)).toEqual(['unique.ts', 'echo.ts']);
    expect(rows[0]!.bytes).toBe(400);
    expect(rows[0]!.gzip).toBeGreaterThan(rows[1]!.gzip * 5);
  });
});

describe('comparing two builds', () => {
  const row = (name: string, bytes: number, gzip: number) => ({ name, bytes, gzip });

  it('says what arrived, what left and what grew, largest first', () => {
    const before = { rows: [row('src/a.ts', 100, 50), row('src/gone.ts', 40, 30), row('src/same.ts', 10, 5)] };
    const after = { rows: [row('src/a.ts', 160, 70), row('src/new.ts', 380, 170), row('src/same.ts', 10, 5)] };
    expect(changes(before, after)).toEqual([
      { name: 'src/new.ts', status: 'new', bytes: 380, gzip: 170 },
      { name: 'src/gone.ts', status: 'gone', bytes: -40, gzip: -30 },
      { name: 'src/a.ts', status: 'changed', bytes: 60, gzip: 20 },
    ]);
  });
});

describe('the headline', () => {
  it('reads the budget the test holds, both ways', () => {
    expect(headline({ kb: BUDGET - 0.5, js: 1024, css: 1024 })).toMatch(/0\.50KB of headroom/);
    expect(headline({ kb: BUDGET + 0.25, js: 1024, css: 1024 })).toMatch(/0\.25KB OVER/);
  });
});

describe('the first load it measures', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'first-load-'));
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const js = 'console.log("the entry");'.repeat(20);
  const css = 'body{color:red}'.repeat(20);

  /** A build as Vite writes one: the chunk ends in a newline either way. */
  function built(name: string, mapped: boolean): string {
    const dir = path.join(root, name);
    mkdirSync(path.join(dir, 'assets'), { recursive: true });
    writeFileSync(path.join(dir, 'index.html'), '<script src="/assets/index-ENTRY1.js"></script>');
    const tail = mapped ? '//# sourceMappingURL=index-ENTRY1.js.map\n' : '';
    writeFileSync(path.join(dir, 'assets', 'index-ENTRY1.js'), `${js}\n${tail}`);
    // A lazy chunk Rollup also named `index`, which is what the guides chunk is.
    writeFileSync(path.join(dir, 'assets', 'index-GUIDES.js'), 'x'.repeat(5000));
    writeFileSync(path.join(dir, 'assets', 'index-STYLE.css'), css);
    return dir;
  }
  const shipped = built('shipped', false);
  const mapped = built('mapped', true);

  it('finds the entry the page loads, not another chunk with the same name', () => {
    expect(entryName(shipped)).toBe('index-ENTRY1.js');
  });

  it('measures the entry and every stylesheet', () => {
    const load = firstLoad(shipped);
    expect(load.js).toBe(gzipSync(Buffer.from(`${js}\n`)).length);
    expect(load.css).toBe(gzipSync(Buffer.from(css)).length);
    expect(load.kb).toBe((load.js + load.css) / 1024);
  });

  it('measures a build made with maps as the build that ships', () => {
    // The first strip took the chunk's own last newline with the comment and
    // read one byte light; checked against the real build at M328, the two
    // entries are now the same length to the byte.
    expect(firstLoad(mapped)).toEqual(firstLoad(shipped));
  });
});

/**
 * The files the entry names (PLAN.md M336). None of them is any source
 * file's, so the comparison above never saw a new one — which is how M334's
 * icon chunk put the first load over budget while this tool said no source
 * had changed.
 */
describe('the files the entry names', () => {
  const entry =
    'const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/Page-AbCd1234.js",' +
    '"assets/pencil-line-C0cmnosM.js","assets/Page-Zz9_-xY1.css"])))=>i.map(i=>d[i]);' +
    'const P=()=>import("./Page-AbCd1234.js");const Q=()=>import("./skills-C_WSRQt3.js");' +
    'const note="assets/are-not-files";';

  it('reads the preload list and the dynamic imports, once each', () => {
    expect(namedFiles(entry)).toEqual([
      'Page-AbCd1234.js',
      'Page-Zz9_-xY1.css',
      'pencil-line-C0cmnosM.js',
      'skills-C_WSRQt3.js',
    ]);
  });

  it('names a file by what it is called, not by its hash', () => {
    expect(chunkName('pencil-line-C0cmnosM.js')).toBe('pencil-line');
    expect(chunkName('assets/skills-C_WSRQt3.js')).toBe('skills');
    expect(chunkName('Page-Zz9_-xY1.css')).toBe('Page');
    expect(chunkName('workbox-2fbc6a65.js')).toBe('workbox');
  });

  it('counts what arrived and what left, names that repeat included', () => {
    const before = ['a-11111111.js', 'skills-22222222.js', 'skills-33333333.js', 'gone-44444444.js'];
    const after = ['a-55555555.js', 'skills-22222222.js', 'skills-66666666.js', 'skills-77777777.js', 'new-88888888.js'];
    // A rebuilt chunk with a new hash is the same name, not an arrival.
    expect(chunkChanges(before, after)).toEqual({ added: ['new', 'skills'], removed: ['gone'] });
    expect(chunkChanges(before, before)).toEqual({ added: [], removed: [] });
  });

  it('costs the names as what the entry would lose without them', () => {
    expect(namesCost(entry)).toBeGreaterThan(0);
    expect(namesCost('const nothing = "named here";'.repeat(20))).toBe(0);
    // One more name costs more than none more.
    const more = entry.replace('"assets/Page-AbCd1234.js",', '"assets/Page-AbCd1234.js","assets/extra-Q1w2E3r4.js",');
    expect(namesCost(more)).toBeGreaterThan(namesCost(entry));
  });

  /**
   * And the format the real build writes, which is the one that matters: a
   * pattern that stopped matching Vite's output would report no names and no
   * change, for ever, looking exactly like a build that added none.
   */
  it.skipIf(!existsSync('dist/index.html'))('reads the built entry, and every file it names exists', () => {
    const code = readFileSync(path.join('dist', 'assets', entryName('dist')), 'utf8');
    const named = namedFiles(code);
    expect(named.length).toBeGreaterThan(100);
    expect(named.filter((f) => !existsSync(path.join('dist', 'assets', f)))).toEqual([]);
    expect(namesCost(code)).toBeGreaterThan(1000);
  });
});
