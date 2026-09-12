import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DRILLS, getDrill } from './drills';
import { DRILL_COACHING } from './drillCoaching';

/**
 * The coach's cues and faults, and how much of the library has them
 * (PLAN.md M107b).
 *
 * ## Why this is a count and not a rule
 *
 * 144 drills' worth of coaching cannot be written in one sitting, and a
 * half-written side table is how content debt becomes invisible: the
 * library would ship with twelve drills coached and a hundred and
 * thirty-two silently bare, and nothing would ever say so.
 *
 * So `WRITTEN` is a pinned list of the source programs whose drills are
 * done. Adding a source to it is a claim, and these tests hold the claim:
 * removing coaching from a drill in a listed source fails, adding a source
 * without writing its coaching fails, and the remaining count is asserted
 * rather than hidden so the size of the job is always on screen.
 *
 * It is the shape `guides/accuracy.test.ts` uses for guide debt, for the
 * same reason: a list that shrinks is a plan, and an allow-list that grows
 * quietly is not.
 */
const WRITTEN = ['base_camp', 'iron_grip', 'lockdown', 'gravity_defied', 'the_long_game', 'the_siege', 'peak_performance'] as const;

/** Drills whose provenance lies entirely inside a finished source. */
const coached = DRILLS.filter(
  (d) => d.sources.length > 0 && d.sources.every((s) => (WRITTEN as readonly string[]).includes(s)),
);

describe('the drills that are coached', () => {
  it('gives every one of them at least two cues', () => {
    // Two, because one cue is a restatement of the focus line, and a coach
    // who says one thing at the wall is not coaching.
    const thin = coached.filter((d) => (DRILL_COACHING[d.id]?.cues ?? []).length < 2);
    expect(thin.map((d) => d.id)).toEqual([]);
  });

  it('gives every one of them at least one fault', () => {
    const thin = coached.filter((d) => (DRILL_COACHING[d.id]?.faults ?? []).length < 1);
    expect(thin.map((d) => d.id)).toEqual([]);
  });

  it('names a source some drill actually comes from', () => {
    // A typo in the list above would finish nothing while looking like
    // progress.
    const sources = new Set(DRILLS.flatMap((d) => d.sources));
    for (const s of WRITTEN) expect(sources.has(s), `no drill comes from "${s}"`).toBe(true);
  });

  it('is not an empty claim', () => {
    // Without this, emptying WRITTEN would make every check above pass.
    expect(coached.length).toBeGreaterThan(5);
  });
});

/**
 * The cost of keeping the coaching in a side table.
 *
 * `DrillId` is `string`, so a renamed drill leaves its coaching orphaned
 * and the compiler says nothing. This is the compiler.
 */
describe('every entry coaches a drill that exists', () => {
  it('has no orphan', () => {
    const orphans = Object.keys(DRILL_COACHING).filter((id) => getDrill(id) === undefined);
    expect(orphans).toEqual([]);
  });

  it('would notice one', () => {
    // Without this the check above passes on an empty table just as happily.
    expect(Object.keys(DRILL_COACHING).length).toBeGreaterThan(5);
    expect(getDrill('no_such_drill')).toBeUndefined();
  });
});

describe('what a cue is', () => {
  const entries = Object.entries(DRILL_COACHING);

  it('is short enough to say between two moves', () => {
    // A cue that runs past a sentence is a second description. Faults are
    // allowed to be longer: being recognisable from the outside takes more
    // words than an instruction does.
    const long = entries.flatMap(([id, c]) =>
      c.cues.filter((line) => line.length > 120).map((line) => `${id}: ${line}`),
    );
    expect(long).toEqual([]);
  });

  it('does not repeat a line inside one drill', () => {
    for (const [id, c] of entries) {
      const lines = [...c.cues, ...c.faults];
      expect(new Set(lines).size, id).toBe(lines.length);
    }
  });

  it('does not repeat the drill name back at the reader', () => {
    // The page renders the name as its title. "Sticky Feet: keep your feet
    // sticky" is the shape this catches.
    const echoes = entries.flatMap(([id, c]) => {
      const name = getDrill(id)?.name.toLowerCase() ?? '';
      return c.cues.filter((line) => line.toLowerCase().startsWith(`${name}:`)).map((l) => `${id}: ${l}`);
    });
    expect(echoes).toEqual([]);
  });
});

describe('the coaching stays off the boot path', () => {
  /**
   * The measurement this module exists for (PLAN.md M107b).
   *
   * `content/drills/index.ts` is entry-chunk by construction — `derive`,
   * `plan`, `challenges` and `plateau` all call `getDrill` synchronously —
   * so cues written onto a `Drill` load on every cold start. Twelve cost
   * 1.58KB gzipped and all 144 cost 7.58KB, for a page most visits never
   * open. `perf.test.ts` holds the number; this holds the mechanism.
   */
  it('is not imported by the drill library itself', () => {
    // The one import that would undo the whole thing, because everything
    // eager reaches the library.
    for (const file of ['src/content/drills/index.ts', 'src/content/types.ts']) {
      expect(readFileSync(file, 'utf8'), file).not.toMatch(/drillCoaching/);
    }
  });

  it('reaches the page through the lazy route only', () => {
    // `DrillPage` is `lazy()` in App.tsx, so a static import here lands in
    // its chunk. That is the arrangement; if the route ever stops being
    // lazy, this is the test that has to be read again.
    expect(readFileSync('src/features/drills/DrillPage.tsx', 'utf8')).toMatch(
      /^import \{ drillCoaching \} from '@\/content\/drillCoaching';$/m,
    );
    expect(readFileSync('src/App.tsx', 'utf8')).toMatch(
      /const DrillPage = lazy\(\(\) => import\('@\/features\/drills\/DrillPage'\)/,
    );
  });

  it('is read by nothing eager', () => {
    // A second reader is how a lazy module becomes an eager one. Any new
    // importer has to be a lazy route, and adding one means editing this.
    const ALLOWED = ['src/features/drills/DrillPage.tsx'];
    const found = execSync(
      'grep -rl "content/drillCoaching" src --include=*.ts --include=*.tsx || true',
      { encoding: 'utf8' },
    )
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.includes('.test.'));
    expect(found.filter((f) => !ALLOWED.includes(f))).toEqual([]);
    expect(found.length, 'the grep found nothing at all').toBeGreaterThan(0);
  });
});

describe('the size of what is left', () => {
  it('reports it rather than hiding it', () => {
    // Not a threshold — a statement. The number goes down as sources are
    // written, and this line is where it is read off. It fails only if the
    // library has been coached and this file was not updated to say so,
    // which is the one direction that would leave the plan lying.
    expect({ done: coached.length, left: DRILLS.length - coached.length }).toEqual({
      done: 144,
      left: 0,
    });
  });
});
