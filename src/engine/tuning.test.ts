import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every tuning number says why it is that number (PLAN.md M198).
 *
 * The app is full of decisions stored as constants — ninety days of trend,
 * seven minutes of warmup, a quarter of an XP point — and most of them carry
 * a comment saying what they are and why they are not something else. The
 * ones that did not were indistinguishable from the ones nobody had thought
 * about, which is the whole problem: a reader cannot tell a chosen number
 * from an accident by looking at it.
 *
 * ## What this can and cannot see
 *
 * It sees a declaration with **nothing above it at all** — no comment on the
 * line before, and none above the run of declarations it sits in. It
 * deliberately allows a shared comment over a group, because that is how
 * `ACUTE_DAYS` and `CHRONIC_DAYS` are documented and splitting them would be
 * worse prose.
 *
 * **It cannot tell whether a shared comment actually covers the second
 * constant.** `DEFAULT_START` and `DEFAULT_DURATION` sat under a comment
 * about six o'clock, and this rule would have passed them; M198 found those
 * by reading. So this is a floor, not a proof — it stops the empty case,
 * which is the one that keeps happening.
 *
 * ## Where tuning lives
 *
 * The engine, the library, the database and the stores. **Not `ui` or
 * `features`**, where a bare number is almost always a pixel: `PAD_L = 42`
 * and `CELL = 10` are one chart's geometry, read in the twenty lines under
 * them and meaningless anywhere else. Demanding a sentence about each would
 * be noise in front of the cases this exists for, and the ninth brainstorm
 * said so when it first counted them. A tuning decision that found its way
 * into a component would escape this — the answer to that is to move it,
 * not to widen the sweep.
 */

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const TUNING = ['src/engine', 'src/lib', 'src/db', 'src/store'];

const SOURCES = TUNING.flatMap(walk)
  .filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts') && !p.endsWith('.test.tsx'))
  .map((path) => ({ path, source: readFileSync(path, 'utf8') }));

const DECLARATION = /^(?:export )?const ([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*(-?[\d_.]+)\s*;/;
/**
 * Any constant, for walking upward. A comment covers the whole run beneath
 * it, and the run is not all bare numbers — `MAX_BYTES = 600 * 1024` sits
 * between one and its comment, and `VIEW = { … }` between another.
 */
const ANY_CONST = /^(?:export )?const [A-Z][A-Z0-9_]*\s*(?::|=)/;

/**
 * Named, and taking its corpus, so the controls below run this exact code
 * (PLAN.md M155, M195, M196). A sweep that reports nothing is worth nothing
 * until the same path has been shown to report something.
 */
export function undocumented(corpus: readonly { path: string; source: string }[]): string[] {
  const out: string[] = [];
  for (const { path, source } of corpus) {
    const lines = source.split('\n');
    for (const [i, line] of lines.entries()) {
      const declared = DECLARATION.exec(line);
      if (declared === null) continue;
      let above = i - 1;
      // Up through blank lines and sibling declarations, to whatever comes
      // first: a comment documents the whole run beneath it.
      while (above >= 0) {
        const previous = lines[above]!.trim();
        if (previous === '' || ANY_CONST.test(previous)) {
          above -= 1;
          continue;
        }
        break;
      }
      const previous = above >= 0 ? lines[above]!.trim() : '';
      const documented =
        previous.startsWith('//') ||
        previous.startsWith('*') ||
        previous.startsWith('/*') ||
        previous.endsWith('*/');
      if (!documented) out.push(`${declared[1]} = ${declared[2]} (${path}:${i + 1})`);
    }
  }
  return out;
}

const CORPUS = [
  { path: 'a.ts', source: '/** Why. */\nexport const DOCUMENTED = 1;\n' },
  { path: 'b.ts', source: 'interface X { y: number }\n\nexport const BARE = 2;\n' },
  { path: 'c.ts', source: '/** Why, for both. */\nconst FIRST = 3;\nconst SECOND = 4;\n' },
  { path: 'd.ts', source: '// A line comment counts.\nconst LINE = 5;\n' },
  // Nothing above it at all, which is what the walk falls off the top of.
  { path: 'e.ts', source: 'const AT_THE_TOP = 6;\n' },
];

const EXPORTED = /^export const ([A-Z][A-Z0-9_]*)\s*(?::\s*[^=]+)?=\s*(.+?);\s*$/;

/**
 * Every exported tuning name is owned by exactly one module, with the file
 * that owns it and what it is set to.
 *
 * Also taking its corpus, for the reason the sweep above does.
 */
export function shared(
  corpus: readonly { path: string; source: string }[],
): { name: string; sites: string[] }[] {
  const owners = new Map<string, string[]>();
  for (const { path, source } of corpus) {
    for (const line of source.split('\n')) {
      const declared = EXPORTED.exec(line.trim());
      if (declared === null) continue;
      owners.set(declared[1]!, [...(owners.get(declared[1]!) ?? []), `${path} = ${declared[2]}`]);
    }
  }
  return [...owners.entries()]
    .filter(([, sites]) => sites.length > 1)
    .map(([name, sites]) => ({ name, sites }));
}

/**
 * And no two of them share a name (PLAN.md M198).
 *
 * This is the half of M198 the comments do not cover, and it is the half a
 * reader actually trips over. **`ENOUGH` was 3, 8, 10 and 3** in
 * `projectHistory`, `ropeStyle`, `angles` and `calendar`, while eight other
 * modules already qualified theirs — `ENOUGH_SENDS`, `ENOUGH_TRIES`,
 * `ENOUGH_REST`. **`MIN_HISTORY_DAYS` was 21 in `derive.ts` and 60 in
 * `statHistory.ts`**, so grepping it found the wrong number half the time.
 * And `BLOCK_DAYS` was 28 in two files, one of which carried a comment
 * saying it was the same 28 as the other — a copy announcing itself.
 *
 * The rule is blunt on purpose: one name, one owner, even where the values
 * agree. Two modules owning a number is how they come to disagree.
 */
describe('no two tuning names collide', () => {
  it('finds enough exported constants to be checking anything', () => {
    expect(SOURCES.flatMap(({ source }) =>
      source.split('\n').filter((line) => EXPORTED.test(line.trim())),
    ).length).toBeGreaterThan(30);
  });

  it('names the shared one, and lets a re-export through', () => {
    expect(
      shared([
        { path: 'a.ts', source: 'export const ONE = 1;\n' },
        { path: 'b.ts', source: 'export const ONE = 2;\n' },
        { path: 'c.ts', source: 'export const TWO = 3;\n' },
      ]).map((c) => c.name),
    ).toEqual(['ONE']);
    // A re-export is not a second owner, and needs no special case to be
    // let through: `export { ONE } from './a'` is not an `export const`, so
    // the pattern above never sees it. There *was* a special case here, and
    // M198's battery found it was dead code — a line that could only ever
    // skip what had already been skipped.
    expect(
      shared([
        { path: 'a.ts', source: 'export const ONE = 1;\n' },
        { path: 'b.ts', source: "export { ONE } from './a';\n" },
      ]),
    ).toEqual([]);
    // What *would* be a second owner: a module aliasing the value into a
    // constant of its own.
    expect(
      shared([
        { path: 'a.ts', source: 'export const ONE = 1;\n' },
        { path: 'b.ts', source: "import { ONE as O } from './a';\nexport const ONE = O;\n" },
      ]).map((c) => c.name),
    ).toEqual(['ONE']);
  });

  it('has none', () => {
    const corpus = SOURCES;
    expect(corpus.length).toBeGreaterThan(100);
    expect(shared(corpus)).toEqual([]);
  });
});

describe('every tuning number says why it is that number', () => {
  it('finds enough constants to be checking anything', () => {
    const found = SOURCES.flatMap(({ source }) =>
      source.split('\n').filter((line) => DECLARATION.test(line)),
    );
    expect(found.length).toBeGreaterThan(40);
  });

  it('names the bare one, and only that one', () => {
    // Four shapes: documented, bare, documented as a group, and a line
    // comment. Only the second is this rule's business.
    expect(undocumented(CORPUS)).toEqual(['BARE = 2 (b.ts:3)', 'AT_THE_TOP = 6 (e.ts:1)']);
  });

  it('lets a comment cover the run of declarations beneath it', () => {
    // How `ACUTE_DAYS` and `CHRONIC_DAYS` are written, and splitting them
    // into two comments would be worse prose than the pair deserves.
    expect(undocumented([CORPUS[2]!])).toEqual([]);
  });

  it('has none', () => {
    // The corpus is named once and asserted on, because a sweep handed an
    // empty one flags nothing and passes.
    const corpus = SOURCES;
    expect(corpus.length).toBeGreaterThan(100);
    expect(corpus.some(({ path }) => path === 'src/engine/derive.ts')).toBe(true);
    expect(undocumented(corpus)).toEqual([]);
  });
});
