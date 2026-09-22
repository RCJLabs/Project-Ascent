import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * INDEX.md says what the git log and PLAN.md say (PLAN.md M315).
 *
 * M298a's ninth entry asked for an index and asked for it to be *derived*,
 * which is the whole of the design: PLAN.md is twenty-two thousand lines
 * and a hand-written index of it would be a second record to keep in step
 * with the first. M312 spent a milestone on what happens to those — four
 * counts, measured once, left, and wrong by the time anyone looked.
 *
 * So the generator is the index and this is what makes that true: it runs
 * `npm run index` and fails on any difference. A stale INDEX.md is a
 * failing test rather than a thing to notice.
 *
 * It regenerates rather than re-implementing the parse. A test that
 * re-derived the rows would be the second implementation this whole
 * approach exists to avoid, and it would agree with the first by being
 * written from it.
 */

describe('the index', () => {
  it('is what the generator would write today', () => {
    const before = readFileSync('INDEX.md', 'utf8');
    execFileSync('node', ['scripts/gen-index.mjs'], { encoding: 'utf8' });
    const after = readFileSync('INDEX.md', 'utf8');
    if (before !== after) {
      const b = before.split('\n');
      const a = after.split('\n');
      const at = b.findIndex((line, i) => line !== a[i]);
      expect.fail(
        `INDEX.md is stale. Run \`npm run index\`, and if the difference is this\n` +
          `milestone's own row, \`git commit --amend\` it into the commit that\n` +
          `shipped it — the generator cannot see a commit that does not exist yet.\n` +
          `First difference at line ${at + 1}:\n` +
          `  on disk:   ${b[at] ?? '(end of file)'}\n` +
          `  generated: ${a[at] ?? '(end of file)'}`,
      );
    }
    // The `if` above is the check; this is what gives the passing case an
    // assertion, which `setup.ts` requires of every test. A battery mutant
    // aimed here survived, which is how I know which of the two is load-
    // bearing.
    expect(after).toBe(before);
  });

  /**
   * And it is an index of this project rather than an empty table.
   *
   * The M309 floor. A generator whose patterns stopped matching writes a
   * file with headings and no rows, and the check above would pass on it
   * happily, because a generator agrees with itself whatever it produces.
   */
  it('has a row for every milestone the log names', () => {
    const subjects = execFileSync('git', ['log', '--format=%s'], { encoding: 'utf8' });
    const shipped = new Set<string>();
    for (const line of subjects.split('\n')) {
      const named = /^(M\d+[a-z]?)\s*[:—–-]\s*./.exec(line);
      if (named) shipped.add(named[1]!);
    }
    expect(shipped.size, 'the log stopped naming milestones').toBeGreaterThan(250);

    const index = readFileSync('INDEX.md', 'utf8');
    const rows = new Set([...index.matchAll(/^\| \*\*(M\d+[a-z]?)\*\* \|/gm)].map((m) => m[1]!));
    expect([...shipped].filter((id) => !rows.has(id)).sort()).toEqual([]);
    expect(rows.size).toBe(shipped.size);
  });

  it('points at the files that are here, and names the ones that are not', () => {
    const index = readFileSync('INDEX.md', 'utf8');
    const listed = [...index.matchAll(/^- `([^`]+)` — M/gm)].map((m) => m[1]!);
    expect(listed.length, 'the file section is empty').toBeGreaterThan(400);
    const tracked = new Set(
      execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n'),
    );
    // Every file it lists still exists: the question that section answers
    // is "why is this file like this", which a deleted file does not have.
    expect(listed.filter((f) => !tracked.has(f))).toEqual([]);
    // Files with history, not this milestone's own: a file added by the
    // commit that ships the index is not in the log the index was built
    // from, which is the same one-commit lag the amend above is for.
    expect(listed).toContain('src/engine/coach.ts');
    expect(listed).toContain('scripts/layout.mjs');
    // And not the two records that change with every milestone by
    // construction: "which milestones touched PLAN.md" is "nearly all of
    // them", which is not an answer worth two hundred and eighty ids.
    expect(listed).not.toContain('PLAN.md');
    expect(listed).not.toContain('INDEX.md');
  });
});
