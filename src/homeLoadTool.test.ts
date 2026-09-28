import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, describe, expect, it } from 'vitest';
import { differ, HOME_BUDGET, HOME_SLACK, judge, total } from '../scripts/homeLoad.mjs';
import { BUDGET as FIRST_LOAD_BUDGET } from '../scripts/firstLoad.mjs';

/**
 * `npm run homeload` (PLAN.md M346).
 *
 * The recording needs a browser and runs in CI beside the layout harness,
 * where one is installed; it was checked by hand to fetch the same 45 files
 * on five runs of each profile. What is tested here is everything after the
 * browser: sizing what it fetched, and the line.
 */

const dir = mkdtempSync(path.join(tmpdir(), 'homeload-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const put = (name: string, text: string): number => {
  writeFileSync(path.join(dir, name), text);
  return gzipSync(text).length;
};

describe('sizing what Home fetched', () => {
  // Varied lines rather than one repeated, so it stays several times the
  // size of `b` once gzipped and the order below means something.
  const a = put('a-1234abcd.js', Array.from({ length: 300 }, (_, i) => `export const a${i} = ${i * 7919};`).join('\n'));
  const b = put('b-1234abcd.js', 'export const b = "two";');

  it('gzips each file the way the first load does, and adds them up', () => {
    const { kb, files } = total(['b-1234abcd.js', 'a-1234abcd.js'], dir);
    expect(kb).toBeCloseTo((a + b) / 1024, 10);
    expect(files.map((f) => f.gzip).sort((x, y) => x - y)).toEqual([a, b].sort((x, y) => x - y));
  });

  it('lists the largest first', () => {
    expect(a).toBeGreaterThan(b * 3);
    const { files } = total(['b-1234abcd.js', 'a-1234abcd.js'], dir);
    expect(files.map((f) => f.name)).toEqual(['a-1234abcd.js', 'b-1234abcd.js']);
  });

  it('counts a file asked for twice once, as the network would', () => {
    expect(total(['a-1234abcd.js', 'a-1234abcd.js'], dir).kb).toBeCloseTo(a / 1024, 10);
  });

  it('refuses to size a file this build does not have', () => {
    // The server was serving some other build, and a total over the wrong
    // files is worse than none.
    expect(() => total(['a-1234abcd.js', 'gone-00000000.js'], dir)).toThrow(/gone-00000000\.js was fetched/);
  });
});

describe('the line', () => {
  it('passes a measurement just under it', () => {
    expect(judge(HOME_BUDGET - 0.5)).toEqual([]);
  });

  it('fails one at or over it', () => {
    expect(judge(HOME_BUDGET)).toHaveLength(1);
    expect(judge(HOME_BUDGET + 3)[0]).toMatch(/over the/);
  });

  it('fails one so far under it that the saving would be spent unseen', () => {
    expect(judge(HOME_BUDGET - HOME_SLACK)).toHaveLength(1);
    expect(judge(HOME_BUDGET - HOME_SLACK - 5)[0]).toMatch(/lower HOME_BUDGET/);
    expect(judge(HOME_BUDGET - HOME_SLACK + 0.01)).toEqual([]);
  });

  it('allows the same slack the first load does', () => {
    expect(HOME_SLACK).toBe(1.5);
  });

  it('sits above the first load, which it contains', () => {
    // Home fetches the entry chunk and the stylesheet first; a line below
    // theirs could never pass.
    expect(HOME_BUDGET).toBeGreaterThan(FIRST_LOAD_BUDGET);
  });
});

describe('the two loads', () => {
  it('names what only one of them fetched', () => {
    expect(differ(['x.js', 'y.js'], ['y.js', 'z.js'])).toEqual({ onlyA: ['x.js'], onlyB: ['z.js'] });
    expect(differ(['x.js'], ['x.js'])).toEqual({ onlyA: [], onlyB: [] });
  });
});

describe('the script', () => {
  const source = readFileSync('scripts/homeLoad.mjs', 'utf8');

  it('loads Playwright only when it runs, not when a test imports it', () => {
    // CI runs the suite before it installs Playwright, which is not a
    // dependency of the app; a require at the top would fail this file
    // there and pass it on any machine that happens to have it.
    const top = source.slice(0, source.indexOf('async function main('));
    expect(top).not.toMatch(/require\(process\.env\.PLAYWRIGHT/);
    expect(source.slice(source.indexOf('async function main('))).toMatch(/require\(process\.env\.PLAYWRIGHT/);
  });

  it('is the script npm runs', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['homeload']).toBe('node scripts/homeLoad.mjs');
  });
});
