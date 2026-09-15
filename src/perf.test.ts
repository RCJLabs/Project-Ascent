import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { DRILLS } from '@/content/drills';
import { DRILL_TEXT } from '@/content/drillText';
import { CATALOGUE } from '@/content/programs/catalogue';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import type { MetricEntry } from '@/db/metrics';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveCareer } from '@/engine/career';
import { checkInHistory } from '@/engine/checkIns';
import { conversionTrend } from '@/engine/conversion';
import { blockReport } from '@/engine/blockReport';
import { fieldSeries } from '@/engine/sessionFields';
import { clearClimberStateCache, deriveClimberState } from '@/engine/derive';
import { deriveStats } from '@/engine/stats';
import { clearXpCache, deriveXp } from '@/engine/xp';

/**
 * The budget (PLAN.md M18).
 *
 * Both halves of "ten years of logs is indistinguishable from one, and
 * first load is under 300KB" are measured here rather than remembered.
 * These are ceilings with room in them, not targets to creep up to: a
 * failure means something got materially slower or heavier, not that a
 * number moved.
 */

/** Three sessions a week, two climbs each — a real climber's density. */
function log(sessions: number): Session[] {
  const out: Session[] = [];
  const date = new Date('2016-01-01T00:00:00');
  for (let i = 0; i < sessions; i += 1) {
    const key = date.toISOString().slice(0, 10);
    out.push({
      id: `${key}#0`,
      date: key,
      planned: false,
      completed: true,
      rewarded: true,
      mode: i % 4 === 0 ? 'outdoor' : 'indoor',
      rpe: 5 + (i % 5),
      durationMin: 90 + (i % 60),
      warmup: i % 3 !== 0,
      drillDone: i % 5 === 0,
      climbs: [
        { id: `a${i}`, grade: `V${3 + (i % 5)}`, scale: 'V', count: 2 + (i % 4), result: 'send', style: 'redpoint' },
        { id: `b${i}`, grade: `V${5 + (i % 4)}`, scale: 'V', count: 1 + (i % 3), result: 'attempt' },
      ],
      createdAt: `${key}T18:00:00.000Z`,
      updatedAt: `${key}T18:00:00.000Z`,
    } as Session);
    date.setDate(date.getDate() + 2 + (i % 2));
  }
  return out;
}

function timings(fn: () => void): number[] {
  fn();
  const runs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    const start = performance.now();
    fn();
    runs.push(performance.now() - start);
  }
  return runs.sort((a, b) => a - b);
}

/** Median of five, so one unlucky GC pause does not fail a build. */
function median(fn: () => void): number {
  return timings(fn)[2] as number;
}

/**
 * How many alternating samples each side of a ratio gets. Fifteen, and the
 * number is measured rather than picked — see below.
 */
const RATIO_RUNS = 15;

/**
 * Two measurements of **the same amount of work**, taken alternately,
 * fastest of each.
 *
 * The fastest of a batch is the run with the least interference from
 * everything else on the machine, and so the closest estimate of what the
 * work itself costs. An absolute budget wants the conservative number and
 * keeps the median; a ratio of two medians divides one noisy measurement by
 * another, and with a three-millisecond denominator that is enough to fail a
 * green build. It did, twice in a day (PLAN.md M41).
 *
 * Taking the fastest of each was not enough on its own (PLAN.md M112d). A
 * `fastest(a)` then `fastest(b)` runs all of one and then all of the other,
 * so a runner that gets busier between the two batches inflates *every*
 * sample of the second — and a minimum over equally inflated samples is
 * still inflated. That is a ratio failing for a reason that has nothing to
 * do with the code, which is what happened on CI at 2.0ms → 7.2ms while the
 * same commit measured 2.3 → 4.9 on a quiet machine. Alternating was the fix
 * for that, and it held for it.
 *
 * ## And it was still not enough (PLAN.md M172)
 *
 * The ratio kept failing, and it is the only wall-clock assertion in this
 * file that ever has: **five failures, all of them this one** — 3.58, 3.61,
 * 4.04, 4.25 and 4.41 against a ceiling of 3. No absolute budget in this
 * file has flaked once in the life of the project.
 *
 * All five have the same fingerprint. The denominator sits flat at 1.6–2.1ms
 * while the numerator goes to 5.6, 7.2, 8.0, 8.3, 8.5 against a quiet 3.9.
 * **The contention lands almost entirely on the longer side**, and the
 * reason is that the two sides were not the same length: a four-millisecond
 * window is exposed to about twice as much preemption as a two-millisecond
 * one, and taking the minimum only helps if some sample got a clean window
 * to be the minimum of. On a busy machine the long side has fewer of those
 * to pick from. Alternating puts both sides in the same *conditions*; it
 * cannot put them in the same *duration*, and that is what the division
 * needed.
 *
 * So the rule this function now depends on, and which its one caller has to
 * keep: **`a` and `b` must do equal work.** A ratio of two equal-duration
 * measurements is what makes drift cancel in the division rather than
 * landing on whichever side takes longer.
 *
 * ## What each change was worth
 *
 * Measured by running this file under eight spinning loops on four cores —
 * three times the machine — which is harsher than any runner it has failed
 * on. Each row is runs of the whole file that ended with this assertion
 * over its line:
 *
 *   unequal sides, 5 samples                    2 of 3
 *   equal sides, 15 samples                     1 of 5
 *   equal sides, 15 samples, order swapped      1 of 8
 *   + one retry                                 1 of 12
 *   **+ two half-logs instead of one twice**    **0 of 12**
 *
 * And at *four* times the machine, where the absolute budgets in this file
 * start failing on their own: 0 of 12 again. The assertion that used to be
 * the only one that ever broke is now not the first one to.
 *
 * The sample count and the equal sides are each necessary and neither is
 * sufficient — an isolated harness put unequal-but-15-samples at 1 in 15 and
 * equal-but-5-samples at 5 in 12, while equal at 15 cleared 27 rounds. The
 * order swap and the second array are what closed the rest, and the reason
 * for both is in the caller. Fifteen samples cost about 120ms.
 */
function ratioOf(a: () => void, b: () => void): { one: number; two: number } {
  const as: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < RATIO_RUNS; i += 1) {
    // Swapped every other round, so neither side is always the one that
    // lands in the second half of a timeslice.
    const [first, second] = i % 2 === 0 ? [a, b] : [b, a];
    const firstInto = i % 2 === 0 ? as : bs;
    const secondInto = i % 2 === 0 ? bs : as;
    let start = performance.now();
    first();
    firstInto.push(performance.now() - start);
    start = performance.now();
    second();
    secondInto.push(performance.now() - start);
  }
  as.sort((x, y) => x - y);
  bs.sort((x, y) => x - y);
  return { one: as[0] as number, two: bs[0] as number };
}

/**
 * One retry, for the assertions that read a clock (PLAN.md M172).
 *
 * Only the wall-clock tests carry it. The byte counts below do not and must
 * not: a bundle measurement is deterministic, so a retry there could only
 * make a real failure take twice as long to report.
 *
 * It is a backstop rather than the fix, and it is not what fixed the ratio:
 * the row in `ratioOf`'s table with the retry in place still failed one run
 * in twelve, and the change after it is the one that cleared. What the retry
 * is for is the absolute budgets, which have never flaked in the life of the
 * project but are the assertions that break first when the machine is four
 * times oversubscribed — `deriveXp` at 26–35ms of 25, `climberState` at
 * 60–70ms of 60.
 *
 * What retrying cannot hide is a regression: the code is identical on both
 * attempts, so anything real fails twice — as those four-times-oversubscribed
 * failures did. The margins make that true in practice as well as in
 * principle. Nothing here is set within a retry's worth of its measurement:
 * the ratio reads 0.95 against a ceiling of 1.5, `deriveXp` 6.5ms against 25.
 * A derivation that had genuinely gone quadratic lands past 2, not at 1.51.
 */
const WALL_CLOCK = { retry: 1 };

/**
 * A workload with a known answer, for the self-check on `ratioOf` below.
 * Arithmetic into a sink the optimiser cannot drop, about 1.6ms a unit.
 */
let burnt = 0;
let spikes = 0;
function burn(units: number): void {
  let x = 0;
  const steps = units * 400_000;
  for (let i = 0; i < steps; i += 1) x = (x + i * 7) % 1_000_003;
  burnt += x;
}

const TEN_YEARS = 1560;

/** A decade of benchmark results, for the block report's scan. */
function results(n: number): MetricEntry[] {
  const ids = CATALOGUE[0]!.assessments;
  const date = new Date('2016-01-01T00:00:00');
  const out: MetricEntry[] = [];
  for (let i = 0; i < n; i += 1) {
    const key = date.toISOString().slice(0, 10);
    out.push({
      id: `m${i}`,
      metricId: ids[i % ids.length]!,
      date: key,
      value: 20 + (i % 40),
      createdAt: `${key}T10:00:00.000Z`,
    } as MetricEntry);
    date.setDate(date.getDate() + 7);
  }
  return out;
}

describe('ten years of logs stays cheap', () => {
  const sessions = log(TEN_YEARS);
  const metricEntries = results(520);
  const state = deriveClimberState(sessions);

  it('derives XP in single-digit milliseconds', WALL_CLOCK, () => {
    // Was 106.9ms before M18, and it runs on every session write. The cost
    // was `loadStateAt` walking 28 days per session with Date arithmetic:
    // 43,680 Date constructions per derivation. One sliding pass instead.
    const ms = median(() => {
      clearXpCache();
      deriveXp({ sessions, projects: [], ledger: [] });
    });
    expect(ms, `deriveXp took ${ms.toFixed(1)}ms`).toBeLessThan(25);
  });

  it('scales linearly rather than superlinearly', WALL_CLOCK, () => {
    // The two sides have to be the same length or the division measures the
    // machine — see `ratioOf`. So the short log is derived *twice*, which is
    // the same 1,560 sessions of work the long one does in a single pass,
    // and the question becomes whether doing them together costs more than
    // doing them apart. That is superlinearity, asked the other way round.
    //
    // Two separate arrays rather than the same one twice, and that is not a
    // detail: deriving one 780-session array twice runs the second pass over
    // memory the first pass just warmed, so on a contended machine the short
    // side keeps its cache while the long side loses its larger one. The
    // residual failures said so plainly — the whole-log side inflated to
    // 7.5–12.2ms while the half-log side came in at 2.8–3.7ms, *below* its
    // own quiet figure of 4.0. Two arrays give both sides the same 1,560
    // sessions of footprint as well as the same count of them, and that is
    // the change that took the stress failures to none.
    //
    // Both sides are declared once and the guard reads the same declaration
    // the measurement runs, which is the rule `content/authored.test.ts`
    // states for its own sweeps: a check and the thing it checks held as two
    // copies is a check that can be rewired without anything noticing. With
    // the lengths asserted against separate literals, pointing the long side
    // at a half-log would have read 0.5 and passed.
    const split = [log(TEN_YEARS / 2), log(TEN_YEARS / 2)];
    const whole = [sessions];
    const count = (logs: Session[][]) => logs.reduce((n, l) => n + l.length, 0);
    expect(count(split), 'the two sides are no longer equal work').toBe(count(whole));

    const derive = (logs: Session[][]) => () => {
      for (const part of logs) {
        clearXpCache();
        deriveXp({ sessions: part, projects: [], ledger: [] });
      }
    };
    const { one, two } = ratioOf(derive(split), derive(whole));
    // Twice the log should not cost more than three times the work — which,
    // against two half-logs instead of one, is 1.5. The claim is the one it
    // has always been: `full / half < 3` is `full / (2 × half) < 1.5`.
    expect(
      two / Math.max(one, 0.01),
      `two halves ${one.toFixed(1)}ms → one whole ${two.toFixed(1)}ms`,
    ).toBeLessThan(1.5);
  });

  it('derives everything else in single-digit-to-low milliseconds', WALL_CLOCK, () => {
    const budgets: [string, number, () => void][] = [
      // Cleared each time, or this measures the M157 cache rather than the
      // work — the same array goes in on every iteration, which is exactly
      // the case the cache exists to make free.
      ['climberState', 60, () => {
        clearClimberStateCache();
        deriveClimberState(sessions);
      }],
      ['altimeter', 20, () => deriveAltimeter(sessions)],
      ['career', 20, () => deriveCareer({ sessions, records: state.personalRecords })],
      ['stats', 10, () => deriveStats({ state, metrics: [], projects: [] })],
      // Windowed to 90 days, so what this measures is the O(n) scan that
      // finds them — which is the part that grows with the log.
      ['checkIns', 20, () => checkInHistory({ sessions, to: sessions[sessions.length - 1]!.date })],
      ['conversion', 25, () => conversionTrend({ sessions, scale: 'V', to: sessions[sessions.length - 1]!.date })],
      ['fieldSeries', 20, () => fieldSeries({ sessions, to: sessions[sessions.length - 1]!.date })],
      // Ten years of metric entries against one twelve-week battery: the
      // cost is the scan per assessment, which grows with the log.
      ['blockReport', 20, () => blockReport({
        program: CATALOGUE[0]!,
        startDate: '2025-01-05',
        entries: metricEntries,
        today: '2025-04-01',
      })],
    ];
    const results = budgets.map(([name, budget, fn]) => ({ name, budget, ms: median(fn) }));
    const over = results
      .filter((r) => r.ms > r.budget)
      .map((r) => `${r.name} ${r.ms.toFixed(1)}ms > ${r.budget}ms`);
    expect(over).toEqual([]);

    // A floor as well as a ceiling, for the one entry with a cache behind it
    // (PLAN.md M157). Drop the `clearClimberStateCache()` above and this
    // measures a cache hit — nanoseconds, comfortably under 60ms, green and
    // measuring nothing. The battery showed it. Ten years of sessions cost
    // ~13ms cold here and a warm lookup is four reference comparisons, so
    // 0.5ms separates them with two orders of magnitude to spare either way.
    const climber = results.find((r) => r.name === 'climberState')!;
    expect(climber.ms, `climberState ${climber.ms.toFixed(4)}ms — measuring the cache?`).toBeGreaterThan(0.5);
  });

  /**
   * The same measurement for the climber state (PLAN.md M157), and the
   * reason the benchmark above clears the cache.
   *
   * Without this, dropping `clearClimberStateCache()` from that benchmark
   * passes — a warm cache is nanoseconds and nanoseconds are under 60ms. The
   * battery showed exactly that. A cold measurement that has to stay well
   * above a warm one is what makes the budget above measure the work.
   */
  it('caches the climber state so a page costs one derivation', WALL_CLOCK, () => {
    const cold = median(() => {
      clearClimberStateCache();
      deriveClimberState(sessions);
    });
    deriveClimberState(sessions);
    const warm = median(() => deriveClimberState(sessions));
    expect(cold, `cold ${cold.toFixed(1)}ms`).toBeGreaterThan(0.5);
    expect(warm, `warm ${warm.toFixed(3)}ms vs cold ${cold.toFixed(1)}ms`).toBeLessThan(
      Math.max(cold / 10, 0.5),
    );
  });

  it('caches so nine callers cost one derivation', WALL_CLOCK, () => {
    // The cache is keyed on reference identity, which is sound because the
    // stores replace their arrays rather than mutating them — and which
    // means a caller passing a fresh `[]` each time silently gets nothing.
    // Before M157 this was measured with one array in a loop, which is not
    // what the app does: `useMemo` is per-component-instance, so each
    // component built its own array and missed. `useAllSessions` is what
    // makes the number real.
    const projects: never[] = [];
    const ledger: never[] = [];
    const cold = median(() => {
      clearXpCache();
      deriveXp({ sessions, projects, ledger });
    });
    deriveXp({ sessions, projects, ledger });
    const warm = median(() => deriveXp({ sessions, projects, ledger }));
    expect(warm, `warm ${warm.toFixed(3)}ms vs cold ${cold.toFixed(1)}ms`).toBeLessThan(
      Math.max(cold / 10, 0.5),
    );
  });

  it('re-derives the moment anything actually changes', () => {
    const projects: never[] = [];
    const ledger: never[] = [];
    const before = deriveXp({ sessions, projects, ledger });
    const grown = [...sessions, { ...sessions[0]!, id: 'extra', date: '2027-01-01' }];
    const after = deriveXp({ sessions: grown, projects, ledger });
    expect(after.total).toBeGreaterThan(before.total);
  });
});

/**
 * And the measurements themselves work (PLAN.md M172).
 *
 * Every assertion in this file that reads a clock passes today because the
 * code is fast, which is indistinguishable from passing because the
 * measurement is broken — and `ratioOf` is now the most rewritten thing here.
 * `return { one: x, two: x }` would make the scaling check green for ever and
 * nothing else in the suite would notice; the battery for this milestone
 * showed the same of taking the slowest sample instead of the fastest, and of
 * not sorting the samples at all.
 *
 * So the helper is run on workloads whose answers are known.
 */
describe('the clock the budgets are read off', () => {
  it('reports a real difference and no false one', WALL_CLOCK, () => {
    const even = ratioOf(
      () => burn(2),
      () => burn(2),
    );
    const evenRatio = even.two / Math.max(even.one, 0.01);
    expect(evenRatio, `the same work read as ${evenRatio.toFixed(2)}`).toBeLessThan(1.5);

    // The second case deliberately breaks the equal-work rule the caller
    // keeps, because an unequal pair is exactly what this has to still see.
    const doubled = ratioOf(
      () => burn(1),
      () => burn(2),
    );
    const doubledRatio = doubled.two / Math.max(doubled.one, 0.01);
    expect(doubledRatio, `twice the work read as ${doubledRatio.toFixed(2)}`).toBeGreaterThan(1.5);

    // And the burn ran, rather than being optimised into nothing — which
    // would make both readings the ratio of two empty loops.
    expect(burnt, 'the workload did no work').toBeGreaterThan(0);
  });

  /**
   * The property the whole design rests on: the number reported is the
   * *fastest* sample, so a side that is occasionally interrupted still reads
   * as what it costs. That is what makes a ratio survivable on a shared
   * runner, and until this test nothing held it — taking the slowest sample,
   * or never sorting them, both survived the battery.
   *
   * The spike is on the first sample as well as every fifth, because an
   * unsorted helper reads sample zero and a sorted one reads the minimum:
   * only a spike in both places tells them apart.
   */
  it('reads the fastest sample, whichever side is interrupted', WALL_CLOCK, () => {
    const spiky = () => {
      spikes += 1;
      burn(spikes === 1 || spikes % 5 === 0 ? 4 : 1);
    };

    spikes = 0;
    const slowTwo = ratioOf(() => burn(1), spiky);
    const two = slowTwo.two / Math.max(slowTwo.one, 0.01);
    expect(two, `an interrupted long side read as ${two.toFixed(2)}`).toBeLessThan(1.5);

    spikes = 0;
    const slowOne = ratioOf(spiky, () => burn(1));
    const one = slowOne.two / Math.max(slowOne.one, 0.01);
    expect(one, `an interrupted short side read as ${one.toFixed(2)}`).toBeGreaterThan(0.67);

    // Fifteen samples is the measured figure, not a preference — the stress
    // table in `ratioOf` is what it was chosen against, and three samples
    // survived the battery because a quiet machine cannot tell the
    // difference. The literal is the pin.
    expect(RATIO_RUNS, 'the stress table in ratioOf is measured at fifteen').toBeGreaterThanOrEqual(15);
    expect(spikes, 'the helper did not take a sample per run').toBe(RATIO_RUNS);
  });

  /**
   * Wall clock retries, bytes do not. Stated in `WALL_CLOCK`'s own docblock
   * and, until this, held by nothing: removing the retry outright survived
   * the battery, and so would adding it to a budget test.
   */
  it('retries the clocks and not the byte counts', () => {
    const self = readFileSync('src/perf.test.ts', 'utf8');
    const declared = [...self.matchAll(/^ {2}it(\.runIf\(built\))?\('([^']+)',( WALL_CLOCK,)?/gm)].map(
      (m) => ({ name: m[2]!, reads: m[1] !== undefined, retries: m[3] !== undefined }),
    );
    expect(declared.length, 'no tests matched — the pattern has rotted').toBeGreaterThanOrEqual(15);
    expect(WALL_CLOCK.retry, 'one attempt over, not a loop until green').toBe(1);
    expect(
      declared.filter((d) => d.reads && d.retries).map((d) => d.name),
      'a byte count cannot flake, so a retry there only delays the report',
    ).toEqual([]);
    expect(declared.filter((d) => d.retries).map((d) => d.name)).toEqual([
      'derives XP in single-digit milliseconds',
      'scales linearly rather than superlinearly',
      'derives everything else in single-digit-to-low milliseconds',
      'caches the climber state so a page costs one derivation',
      'caches so nine callers cost one derivation',
      'reports a real difference and no false one',
      'reads the fastest sample, whichever side is interrupted',
    ]);
  });
});

/**
 * Budgets with headroom in them (PLAN.md M40).
 *
 * These were 300KB and 900KB and the app sat at 282.9KB and 894.6KB — 5.7%
 * and 0.6% of room, which is a budget that has already been spent. Splitting
 * every route but the four that cannot be deferred took the first load to
 * 225KB and the entry chunk to 694KiB; the numbers below leave real room for
 * the next feature rather than for the next line.
 */
describe('the bundle stays small', () => {
  const dist = 'dist/assets';
  const built = existsSync(dist);

  /**
   * The ceiling, named so the slack check below can read it.
   *
   * Every milestone that moves this moves it to just above what it measured,
   * with one exception recorded below — the history is in the comment inside
   * the first test.
   */
  const BUDGET = 138.0;

  /** The first load, gzipped: the entry chunk plus every stylesheet. */
  function firstLoadKb(): number {
    const html = readFileSync('dist/index.html', 'utf8');
    const entry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1];
    expect(entry, 'no entry chunk in index.html').toBeDefined();
    const js = gzipSync(readFileSync(`${dist}/${entry}`)).length;
    const css = readdirSync(dist)
      .filter((f) => f.endsWith('.css'))
      .reduce((n, f) => n + gzipSync(readFileSync(`${dist}/${f}`)).length, 0);
    return (js + css) / 1024;
  }

  it.runIf(built)('keeps the first load under the budget', () => {
    const total = firstLoadKb();

    // 260 until M78 moved the program bodies out of the entry chunk, which
    // took it from 239.5KB to 197.7KB. The budget follows the win, and
    // closely: a first draft set it at 230, and a mutation that leaked 57KB
    // of bodies back into the entry landed at 219 and passed. Headroom a
    // regression can hide in is not headroom.
    //
    // 215 → 216 at M99, which measured its own cost before moving the line:
    // 214.59KB before the circuit timer, 215.45KB after, so 0.86KB for a
    // parser and a generalised timer subject. The budget moves by what the
    // feature actually weighs and not a byte more. The real headroom is a
    // lazy `LogPage` — it is eagerly imported, so everything it touches is
    // first-load — and that is a perf milestone rather than a side effect of
    // this one.
    //
    // 216 → 216.2 at M103, measured the same way: 215.71KB before the injury
    // check-in, 216.12KB after, so 0.41KB for a tissue answer on the
    // check-in and a reading of it. The line stopped being a round number
    // here on purpose — 217 would have handed the next milestone 0.88KB of
    // free space, which is the headroom a regression hides in, three
    // paragraphs above.
    //
    // 216.2 → 216.8 at M104, and the interesting half is what it did not
    // cost. One coach rule reading M91's `blockAdherence` put 1.75KB into
    // the entry chunk, because `HomePage` imported `useTips` from
    // `CoachPage.tsx` — so `lazy(CoachPage)` in the router had been buying
    // nothing at all, and the page's JSX, tone table and icons were
    // first-load along with it. Splitting the hook into its own module gave
    // 1.20KB back and made the lazy boundary real. Net: 215.71 → 216.75.
    //
    // 216.8 → 216.9 at M105, which is the number worth noticing: a CSV
    // parser, a row-to-session mapper and a preview card cost **0.07KB** of
    // first load, because `SettingsPage` is lazy and — unlike `CoachPage`
    // before M104 — nothing eager imports out of it. The engine lands in
    // the settings chunk where it is used. That is what the boundary is
    // for, and the difference between the two milestones is the whole
    // argument for keeping it real.
    //
    // 216.9 → 217.1 at M107, measured: 216.88 → 217.05, so 0.17KB for a
    // browsable drill library. Both its pages are lazy; what lands on first
    // load is two rows in the route table, which is eager because search
    // reads it, and two `lazy()` wrappers in `App.tsx`.
    //
    // 217.1 → 217.4 at M108, measured 217.05 → 217.37, so 0.32KB — the
    // largest move since M104 and for the same reason: `LogPage` and
    // `GymPage` are eagerly imported, so a chip row in the climb entry is
    // first-load by construction. The lazy `LogPage` the note above calls
    // the real headroom is still the answer, and still a perf milestone.
    //
    // 217.4 → 217.7 at M110, measured 217.34 → 217.68, so 0.34KB for the
    // sample-data banner — which is in the eager shell because the risk it
    // guards is sample data mistaken for a real log on a page that is not
    // Settings. It first measured **221.67**: the banner imported `hasDemo`
    // from `db/demo.ts` and pulled the generator, the RNG and the programs
    // it reads into the entry chunk with it. `db/demoFlag.ts` is the split
    // that gave 3.99KB back, and `demoClimber.test.tsx` holds it apart. The
    // line is 217.8 rather than 217.7: the demo's project burns cost 0.05KB.
    //
    // 217.8 → 218.0 at M111, measured 217.80 → 217.93, so 0.13KB for the
    // file handler. It first measured **218.09**: the launch consumer
    // imported `lib/launchFile.ts`, which imports the sniffer, and
    // `useFirstRunRedirect` needed the launched flag synchronously — so the
    // whole path was eager. `lib/launchFlag.ts` is the split, the same one
    // M110 made for the demo flag: two lines in the entry chunk, everything
    // behind them loaded when a file actually arrives. What is left is the
    // hook, the flag, and one line in the redirect.
    //
    // 218.0 → 218.6 at M112, measured 217.93 → 218.57, so 0.64KB for the
    // cooldown card. It first measured **220.16**: `LogPage` is one of the
    // four routes that cannot be deferred, so the twelve stretches and their
    // prose were in the entry chunk of every cold start, with the keyword
    // scanner behind `sessionParts` dragged in after them. Loading both on
    // the tap gave **1.59KB** back and put them in a 1.72KB chunk of their
    // own. What is left is the card.
    //
    // 218.6 → 218.7 at M112b, measured 218.57 → 218.64, so 0.07KB for the
    // season on the calendar. Almost nothing, and for the usual reason:
    // `CalendarPage` is a lazy route, so `blockOn`, `soonestSeason` and the
    // wiring all land in its own chunk. What reaches the entry chunk is
    // whatever rollup hoists as shared.
    //
    // 218.7 → 218.8 at M112d, measured 218.64 → 218.71, so 0.07KB for the
    // rock ladder. `derive.ts` is entry-chunk by definition — everything
    // reads `ClimberState` — so this is the cost of the accumulator itself.
    // The card is on the lazy progress route.
    //
    // Unchanged at M107b, and that is the milestone rather than a footnote:
    // 144 drills' cues and faults would have cost **7.58KB** on the fields
    // they were proposed for, because `content/drills/index.ts` is
    // entry-chunk by construction. In `content/drillCoaching.ts`, read only
    // by a lazy route, they cost nothing here and 19.5KB in that route's own
    // chunk. Unchanged again at M114 — 218.65 → 218.67 for the delete, which
    // is a counter in a lazy Settings.
    //
    // 218.8 → 218.9 at M111b, measured 218.67 → 218.87, so 0.20KB for the
    // attach page. The page itself is lazy and 2.17KB; what lands here is
    // what always lands for a new route — a `lazy()` wrapper, a `<Route>`
    // row, and the entry in `ui/routes.ts`, which the shell imports eagerly
    // for back-link titles and the search browser. M107 paid 0.17KB for two
    // routes, so this is the going rate and not a regression.
    //
    // **A process note, because it nearly shipped red.** The full suite was
    // run *before* `npm run build`, so this check measured the previous
    // milestone's `dist` and passed on it. It is `it.runIf(built)`, which
    // makes a stale artefact look identical to a healthy one. Build first.
    //
    // **218.9 → 174.1 at M115**, measured 218.86 → 174.04, so **44.81KB** —
    // larger than every increase since M78 put together, and it came from
    // deleting one static import. Five milestones in a row paid entry-chunk
    // prices because `LogPage` was eager: M108's 0.32KB for a chip row,
    // M112's 0.64KB for the cooldown card and the 1.59KB split it had to
    // make to avoid more.
    //
    // Read the long note further down before quoting this number: with the
    // service worker precaching every chunk, it is the order the bytes
    // arrive in rather than how many there are, and the case for the change
    // is 48ms of cold start rather than 44.81KB of download.
    //
    // The line drops the whole way rather than part of it. This file's own
    // rule is that headroom a regression can hide in is not headroom — and
    // 45KB of slack would hide `LogPage` being made eager again by accident,
    // which is precisely the mistake being fixed.
    //
    // **174.1 → 203.4 at M117, and the logger is eager again — on
    // purpose, and measured this time.** Home *is* today's session now, so
    // the boot path is the logger by definition. The M115 split was still
    // tried — heading eager, body behind a `lazy()`, 165.13KB of first
    // load — against a static import at 202.98KB (both Python gzip; this
    // function read the shipped build at 203.22), seven cold and seven
    // warm starts each, the page's own clock stamped by a MutationObserver
    // the first time the day heading and the session button appeared:
    //
    //   cold, CPU 6×, localhost       heading 583 → 591   button 888 → 592
    //   warm, CPU 6×, localhost       heading 459 → 387   button 608 → 387
    //   cold, CPU 4×, 100ms / 4Mbps   heading 416 → 392   button 546 → 392
    //   warm, CPU 4×, 100ms / 4Mbps   heading 277 → 254   button 369 → 254
    //
    // (medians of seven, ms, lazy → eager; 32 script requests against 3.)
    // The premise of the split was that the shell would paint sooner and
    // the body a moment later. The first half was false — the heading
    // painted no earlier, and later when warm — and the second half cost
    // ~300ms cold and ~220ms warm to the button that is the point of the
    // page. So the 38KB goes back on the boot path, and the 44.81KB M115
    // took off it is spent on the one screen that needs it. Two things
    // M115 and M116 bought stay bought: nothing *else* eager imports the
    // logger, and the glossary is still a tap away rather than a boot cost.
    //
    // **166.0 → 168.0 at M132**, measured 165.29 → 167.92, so 2.63KB for
    // twelve drills — about 0.22KB each, and all of it description. The
    // drill library is entry-chunk by construction: `derive`, `plan`,
    // `challenges` and `plateau` all call `getDrill` synchronously, so
    // every drill's prose loads on every cold start whether or not the
    // library is ever opened. M107b split the *cues* out for exactly this
    // reason and left the descriptions where they were.
    //
    // Measured while here, because the number is worth writing down: the
    // 156 descriptions gzip to **15.93KB**, which is a tenth of the entry
    // chunk for content only two lazy routes read. Splitting them the way
    // the cues were split is a milestone of its own — `filterDrills`
    // searches descriptions and three screens render them — and not
    // something to do in the commit that adds twelve.
    //
    // **168.0 → 170.0 at M135**, measured 167.92 → 169.32, so 1.40KB for
    // the week: the engine reading (`engine/week.ts`) and the hook that
    // feeds it are first-load because Home's card says where the week
    // stands, and a card that counted for itself would drift from the page.
    // The page is a lazy route at 3.9KB of its own. The calendar lost its
    // move UI in the same change and the entry did not shrink by it,
    // because the calendar is lazy too. M137 is the one that buys this
    // back, and more.
    //
    // **137.2 → 138.0, raised rather than spent** — the seventh entry here to
    // record no feature, and the first that is **late**. M191's entry said
    // the next milestone to touch a first-load file would raise this first;
    // M192 did not, and shipped at 0.20KB of slack — below the hash churn
    // M145 measured, so a rebuild that changed nothing could have failed it.
    // The rule held in the letter, because nothing was moved to make a
    // failing thing pass, and was missed in the spirit. Recorded because a
    // process that is only followed when convenient is not one.
    //
    // Bounded both ways before it was committed: 300 fails the slack guard,
    // 136.9 fails the budget, and 138.50 — exactly 1.5 of slack — fails the
    // slack guard while 138.49 passes, which is where the cap really is.
    //
    // 1.00KB, the same target every raise here has used and deliberately
    // short of the 1.5 the slack guard allows. What it buys, measured: the
    // three milestones since the last raise cost 0.79, 0.76 and 0.12, so
    // this is roughly one more of the expensive kind — and the expensive
    // kind is now the only kind, since M183 took the coach engine off this
    // path and a rule's copy costs nothing.
    //
    // **137.2 holds at M192**, measured 136.88 → 137.00: 0.12KB. The page
    // itself is a 1.63KB lazy chunk and costs this line nothing; what lands
    // here is the route, its row in `ui/routes.ts`, and `venueHref`.
    //
    // **0.20KB of slack, and the raise is overdue.** M191's entry said the
    // next milestone to touch a first-load file would raise the ceiling
    // first, and this one did not — the rule was followed in the letter
    // (nothing was moved to make a failure pass) and missed in the spirit.
    // The raise goes in the commit after this one, which is later than it
    // should have been.
    //
    // **137.2 holds at M191**, measured 136.12 → 136.88: 0.76KB, and unlike
    // the last two coach milestones this one lands here in full —
    // `features/log/PreSession.tsx` is first-load because Home shows the
    // day's card, so the chip, its handler and its copy are all in front of
    // the first paint. That is the right place for them: the whole finding
    // is that a climber could not reach this without a program.
    //
    // **0.32KB of slack.** Left rather than raised here, for the reason the
    // M187 entry gives at length: a ceiling moves in its own commit ahead of
    // a milestone, never under pressure from the change that wants it. The
    // raise three commits back bought 1.05KB and this spent 0.76 of it, so
    // the next first-load milestone raises again.
    //
    // **Unchanged at M190**, measured 136.13 → 136.12: **down** 0.01KB, for
    // the same reason M188's entry gives — `coach.ts` and `plateau.ts` are
    // both off the first-paint path since M183, so a rule's copy costs this
    // line nothing. Two milestones running now.
    //
    // **Unchanged at M188**, measured 136.15 → 136.13: **down** 0.02KB, from
    // a milestone that added a whole engine module. `engine/comedown.ts` and
    // the two new branches in `detraining` are read by `coach.ts`, which M183
    // moved off the first-paint path — so a coach rule now costs the entry
    // chunk nothing at all, where M178's cost 0.37KB for the same kind of
    // work. That is the first time the boundary has been visible in this
    // column rather than argued for, and it is worth the line.
    //
    // **136.3 → 137.2, raised rather than spent** — the sixth entry here to
    // record no feature, and the first raise since M179's. M187 left the line
    // at 0.15KB of slack, which is *below* the hash churn M145 measured when
    // a lazy chunk's filename changed inside the entry's module map: a
    // rebuild that changed nothing could have failed it, and a gate that
    // cries wolf is a gate that gets raised in a hurry.
    //
    // 1.05KB, deliberately short of the 1.5 the slack guard allows, for the
    // reason the M173 raise gives at length: at the cap the guard sits on its
    // own ceiling with nothing left for churn. What it buys, measured rather
    // than guessed: the four milestones since the last raise came to
    // **−27.46KB** between them, so this is not headroom for a trend, it is
    // headroom for the one kind of milestone that still spends — M187's, a
    // first-load file gaining prose. Those have cost 0.79, 0.37 and 0.10.
    //
    // The line moves in its own commit, ahead of the milestone rather than
    // inside it, because the one condition a budget should never be moved
    // under is pressure from the change that needs it. M187 is already
    // shipped and measured; this raise is for whatever comes next.
    //
    // **136.3 holds at M187**, measured 135.36 → 136.15: 0.79KB, which is
    // the first *spend* since M182 and the price of a second failure mode
    // being told apart from the first. `ui/ErrorBoundary.tsx` is first-load
    // by construction — it is the thing that catches a page that throws —
    // and it now carries two sets of copy rather than one, plus the detector
    // and the retryable route helper beside it.
    //
    // **0.15KB of slack, the tightest this line has ever been**, and below
    // the hash churn M145 recorded when a lazy chunk's filename changed
    // inside the entry's module map. It is left there rather than fixed
    // here: the rule this file follows is that a ceiling moves in its own
    // commit *ahead* of the milestone, never under pressure from the change
    // that wants it, and this change is already made. The next milestone to
    // touch a first-load file raises it first — and a raise is now the
    // honest move rather than a deferred one, because a rebuild that changes
    // nothing could blow this.
    //
    // **141.9 → 136.3 at M185, the largest cut this line has taken.**
    // Measured 140.94 → 135.36: **5.58KB**, against a ceiling of 5.57
    // measured beforehand by stubbing the library out — so this took all of
    // it. The drill bodies were imported by `content/drills/index.ts`, and
    // **six modules on the first-paint path call `getDrill`** for a category
    // or a name: `derive`, `fingerGap`, `restDrill`, `challenges`,
    // `sessionLength`, `plan`. Cutting any one of the six was worth 0.06KB,
    // which is why this had to be a change to the registry rather than to
    // its callers — and why the first draft of the proposal, which blamed
    // one safety rule, was wrong.
    //
    // The registry fills itself through one `import()` now, which is
    // `content/programs/index.ts` verbatim: M78 solved this for the program
    // bodies and the drills were simply never given the same treatment.
    // `getDrill` stays synchronous, so none of the six callers changed.
    //
    // 0.94KB of slack. These bytes do not leave the app — the router waits
    // for the library before it renders a page, so every launch fetches it —
    // but they are off the *first paint*, which is what this line measures,
    // and the chunk is fetched in parallel with the program catalogue rather
    // than parsed ahead of it.
    //
    // **143.0 → 141.9 at M186, five lines.** Measured 142.12 → 140.94:
    // **1.18KB**, the cheapest entry on this list per character changed.
    // `@/db` is a barrel, and it re-exports `db/exportImport.ts`, which pulls
    // `engine/exportCsv.ts` — the whole backup and CSV path. Five stores
    // imported `getDb` from the barrel instead of from `@/db/db`, and that
    // convenience put the backup machinery in front of the first paint.
    //
    // These bytes leave the app the way M184's did: a climber who never opens
    // Settings never downloads the CSV writer.
    //
    // 0.96KB of slack. `wired.test.ts` carries the general rule rather than
    // the two filenames — no module on the first-paint path may import the
    // barrel — because the barrel will grow and the next thing re-exported
    // from it will arrive with no milestone attached.
    //
    // **150.5 → 143.0 at M184, the second cut and the cheaper one.** Measured
    // 149.54 → 142.12: **7.42KB**, and unlike M183 it bought no boundary, no
    // fallback and no layout shift. `HomePage.tsx` imported `ReviewCard` from
    // `@/features/review/ReviewPage`, a page the router defers, and got the
    // page — its share sheet, `ui/shareCard.ts`'s SVG builder, its header and
    // back link. The card never needed any of it; one file held both.
    //
    // So the fix was a move rather than a defer, which is worth separating
    // from M183's entry above. M183 moved parse work off the first paint and
    // said plainly that the bytes did not leave the app. **These bytes do
    // leave**: nothing on Home reads the share sheet, and a climber who never
    // opens `/review` now never downloads it.
    //
    // 0.88KB of slack. What is left on this card is `engine/review.ts` and
    // its dependencies — measured at a further **5.75KB** if it went behind a
    // boundary like the coach card's. Not taken here: that is M183's shape
    // applied to a second card, and it should be judged on its own rather
    // than folded into a milestone about a file in the wrong place.
    //
    // **164.0 → 150.5 at M183, the first time this line has come down.**
    // Measured 163.61 → 149.54: **14.07KB off the entry chunk**, which is
    // more than every milestone since M78 has spent on it put together.
    // Home's one coach card imported `useTips` eagerly, and that one import
    // reached `coach.ts`, `plateau.ts`, `planVsLog.ts`, `adherence.ts`,
    // `trip.ts`, `progress.ts`, `effort.ts` and `phrase.ts` — nine modules
    // that nothing else on the first-paint path needs.
    //
    // **The cut is in the milestone's own commit, and that is the opposite
    // of the rule above, on purpose.** A raise moves ahead of the change
    // that needs it, because a ceiling must never be moved under pressure
    // from the thing it is about to fail. A cut can only be made *after* the
    // win is real — the line and the measurement have to move together or
    // the suite is red between them — and it is under no pressure at all,
    // because nothing is asking for it.
    //
    // 0.96KB of slack, set by the same rule every raise here has used.
    //
    // **What it is not.** The bytes did not leave the app. Home is the only
    // screen the app opens on and it wants the card, so the chunk is fetched
    // about 30ms later on a warm cache and the browser parses the same total
    // either way — measured, first paint came 8ms earlier at a quarter CPU,
    // not 100. What the split buys is that the coach engine is no longer in
    // front of the first paint, and that this line now measures what the app
    // needs before it can draw anything rather than what it needs in the
    // first half-second. The 14.07KB is honest as a budget figure and would
    // be dishonest as a download saving.
    //
    // **164.0 holds at M178**, measured 163.24 → 163.61: 0.37KB — the most
    // expensive milestone since M173, and for the same reason: the cost of a
    // coach rule is its prose. `engine/coach.ts` is first-load, because Home
    // shows the top card, so one rule's headline, body and comment all land
    // here in full. The logic is a filter, a sort and two constants, and it
    // reuses `assessmentStatus`, which the file already called — the
    // arithmetic was free and the sentence was not.
    //
    // 0.39KB of slack, the tightest this line has been since M172's 0.23.
    // The next milestone that touches a first-load file will need the raise
    // made ahead of it, in its own commit, as every raise here has been.
    //
    // **164.0 holds at M177**, measured 163.14 → 163.24: 0.10KB. `store/
    // profile.ts` is first-load — every screen reads the climber — and what
    // it gained is a list, a field and one action; `engine/injuryLog.ts` is
    // where the reading lives and it is lazy, read only by the injury page
    // and the body page's card. The sentences a climber sees are in both of
    // those chunks rather than here. 0.76KB of slack.
    //
    // **164.0 holds at M176**, measured 163.01 → 163.14: 0.13KB, and the
    // headroom raised two milestones ago is what it was raised for. `Rank`
    // gained a number, `rankFor` a branch, `nextRank` lost its null and
    // `rankLabel` is one line — all of it in `economy.ts`, which is
    // first-load because the logger's reward card reads it. What costs is the
    // `RanksCard` sentence, and that lands in the lazy Game chunk; what shows
    // here is the shared arithmetic. 0.86KB of slack.
    //
    // **Unchanged at M175+M181+M182**, measured 163.04 → 163.01: **down**
    // 0.03KB, which is rounding rather than a saving. Three signatures and a
    // dismissal key are arithmetic, not prose; `coach.ts`'s one new headline
    // is shorter than the sentence it replaced. `HomePage` gained a `useMemo`
    // and an import of `loadsFingersDirectly`, which `coach.ts` already put
    // on the boot path for M160's finger-gap rule — so the module was there
    // and only the call is new. 0.99KB of slack.
    //
    // **163.3 → 164.0, raised rather than spent** — the fifth entry here to
    // record no feature, and for the same reason as the first four. M179 left
    // the measurement at 163.04, which is 0.26KB: above the 0.21 that
    // prompted the last raise and still below the chunk-hash churn M145
    // recorded, so the next change of any size would have had to move the
    // line inside its own commit.
    //
    // 0.96KB, and the arithmetic behind picking it is the same as last time.
    // The slack guard allows 1.5 and a raise to the cap leaves nothing for
    // that churn; the milestones since the last raise cost 162.29 → 163.04,
    // a median of 0.00 and a largest of 0.57 — M173's three tip bodies. So
    // this is one heavy milestone's worth with room to spare, and the two
    // proposals most likely to spend it (M178's coach rules, M176's ladder)
    // are both prose-carrying.
    //
    // The line moves in its own commit, ahead of the milestone rather than
    // inside it, because the one condition a budget should never be moved
    // under is pressure from the change that needs it.
    //
    // **Unchanged at M179**, measured 163.07 → 163.04: **down** 0.03KB. The
    // milestone is two sweeps in `ui/wired.test.ts`, and a test weighs
    // nothing; what moved the number is the other half — `AltimeterState`
    // lost `intoSegment` and `etaWeeks`, two fields the sweep found published
    // and read by nothing, and `altimeter.ts` is first-load because Home's
    // strip reads it. 0.26KB of slack, so the raise the entry below defers
    // is still the next thing.
    //
    // **163.3 holds at M174**, measured 162.85 → 163.07: 0.22KB, and all of
    // it is one tip body. `coach.ts` is first-load because Home reads the top
    // tip, so a rule's prose is entry-chunk prose — the same 0.19KB-a-body
    // rate M173 paid for three of them. The logic is free by comparison: the
    // rule reads a field `CoachInput` already declared, and `useTips` fills
    // it from a program it was already holding.
    //
    // **0.23KB of slack, which is the tightest this line has been since
    // M152.** The next milestone raises it, on its own and before it starts,
    // for the reason the three raises below all give.
    //
    // **Unchanged at M180**, measured 162.86 → 162.85: **down** 0.01KB, which
    // is rounding on a rebuild and not a saving — the point is that moving a
    // rule onto the write path cost nothing at all. `engine/sessionMode.ts`
    // was already first-load, because `store/index.ts` runs M170's repair at
    // boot; `db/sessions.ts` is first-load by construction. So the one new
    // import joins two modules that were already in the entry chunk, and the
    // inline copy it replaced in `PreSession` came out. The importer's half
    // lands in the lazy Settings chunk where `exportImport` already lives.
    //
    // **163.3 holds at M173**, measured 162.29 → 162.86: 0.57KB, and the
    // headroom raised on its own two commits ago is what it was raised for.
    // Nearly all of it is English. `coach.ts` is first-load because Home's
    // card reads the top tip, and the milestone adds three tip bodies to it —
    // the same reason M163's two rewrote bodies cost 0.45KB. The logic is
    // nine lines and `scoredDays` is a number the derivation already had.
    //
    // It is not all spending. `MIN_HISTORY_DAYS` replaced three bare
    // literals, `MIN_CHRONIC_DAYS` stopped being private, and `RATIO_NEEDS`
    // replaced **four** copies of one sentence across `loadZone`,
    // `loadTrend` and `peak` — so some of the 0.57 was bought back by the
    // deduplication in the same commit. 0.44KB of slack.
    //
    // **162.5 → 163.3, raised rather than spent** — the fourth entry here to
    // record no feature, and for the same reason as the first three. M172
    // left the line where M163's raise put it and the measurement at 162.29,
    // which is 0.21KB: less than the hash churn M145 recorded when a lazy
    // chunk's filename changed inside the entry's module map, and a ceiling
    // that close fails on builds that changed nothing worth failing over.
    //
    // 1.01KB, which is deliberately short of the 1.5 the slack guard allows.
    // At the cap the guard sits on its own ceiling with nothing left for that
    // churn, and a raise that has to be re-made on the next rebuild is not a
    // raise. What it buys, measured rather than guessed: the eight milestones
    // since the last raise cost 161.56 → 162.29 between them — a median of
    // 0.03KB and a largest of 0.31 — so 1.01KB is three of the heaviest or
    // thirty of the typical, not the "one milestone's headroom" the entries
    // below call it. Worth naming as that rather than repeating the phrase:
    // what a milestone costs has fallen by an order of magnitude since the
    // lazy routes went in, and the same slack now lasts far longer.
    //
    // The line moves in its own commit, ahead of the milestone rather than
    // inside it, because the one condition a budget should never be moved
    // under is pressure from the change that needs it.
    //
    // **Unchanged at M172**, measured 162.29 → 162.29, and it could not have
    // been anything else: the milestone changes one file and that file is
    // this one. Recorded anyway, because an entry saying a milestone cost
    // nothing is also the record that the line was read.
    //
    // **Unchanged at M169**, measured 162.27 → 162.29: 0.02KB, which is one
    // `retired` string on a field spec. Everything else the milestone did is
    // tests — the widened `wired.test.ts` sweep and the new value sweep — and
    // a test weighs nothing at all. `content/fields.ts` is in the catalogue's
    // chunk rather than the entry one, so even that string is not really here;
    // the 0.02 is rounding on a rebuild.
    //
    // **Unchanged at M168**, measured 162.24 → 162.27: 0.03KB, and it is the
    // one sentence that got longer. The three retired claims were replaced
    // roughly in kind; `ACUTE_DAYS`, `CHRONIC_DAYS` and `CHRONIC_WEEKS` are
    // three numbers that minify to nothing and remove two hard-coded copies
    // of each; the long caveat is on the Progress card and the injury guide,
    // both lazy. The whole case for the decision lives in `derive.ts`'s
    // docblock, which the bundler strips.
    //
    // **Unchanged at M166**, measured 162.24 → 162.24: nothing at all, to two
    // decimal places. A six-section guide is about 9KB of prose and none of it
    // is here — `content/guides/index.ts` imports all sixteen guide modules,
    // which is exactly why `guides/summary.ts` exists: the program page reads
    // the summary list to decide whether to show a link, and the bodies stay in
    // the guides chunk until someone opens one. The new summary row is four
    // fields. The constraint on General Training rides in the catalogue, which
    // is fetched rather than imported.
    //
    // **Unchanged at M165**, measured 162.26 → 162.24: **down** 0.02KB, which
    // is chunk-hash churn rather than a saving — the point is that a Medium
    // milestone cost nothing at all. `engine/pyramidShape.ts` has exactly one
    // caller, `ProgressPage`, so the module and its paragraph both land in
    // that lazy chunk. Putting the reading where the drawing already is was
    // the right answer for the climber and happens to be the free one; a
    // coach tip saying the same thing would have been first-load prose and
    // would have needed the line raised.
    //
    // **Unchanged at M171**, measured 162.11 → 162.26: 0.15KB, and the page
    // itself is none of it — the whole privacy statement lands in
    // `PrivacyPage-*.js`, a lazy route. What is first-load is the route table
    // entry and its twelve search keywords, which is how a climber typing
    // "tracking" or "who can see" finds the page at all, and which the search
    // sheet reads before any route has been chosen.
    //
    // **Unchanged at M170**, measured 161.87 → 162.11: 0.24KB. `engine/
    // sessionMode.ts` is nine lines of logic and the rest is prose; it is
    // first-load because `store/index.ts` runs the one-time repair at boot,
    // and that has to be the boot path — it is the only place that has both
    // the catalogue and the whole log in hand. The two chips in the logger
    // are on a lazy route. The `outdoor` flag on five session types costs
    // nothing here: the catalogue is fetched, not imported.
    //
    // **Unchanged at M164**, measured 161.56 → 161.87: 0.31KB. `engine/
    // restDrill.ts` is first-load because `PreSession` is — Home renders that
    // card and nothing else of the logger — and the drill registry it reads
    // was already on the boot path by construction, so what is new is the
    // module's own prose, one link in the pre-session card and one line of
    // the start handler. The `DrillCard` extraction in `LogPage` is roughly
    // neutral: the JSX is rendered in two branches now and written once,
    // where it used to be written once and rendered in one, and `LogPage` is
    // a lazy route either way.
    //
    // **Unchanged at M163**, measured 161.11 → 161.56: 0.45KB, and nearly all
    // of it is English. `engine/trip.ts` is nine lines of logic; what costs is
    // the two rewritten tip bodies in `coach.ts`, which is first-load because
    // Home's card reads it, and prose does not minify. The first draft was
    // 161.63 — over the old line — and the fix was to cut the danger body from
    // roughly seven hundred characters to under five hundred, which the card
    // needed anyway: a paragraph that long on Home is one nobody finishes.
    // `store/objectives` was already on the boot path (`store/index.ts`
    // hydrates it), so the hook reading it added nothing.
    //
    // **161.6 → 162.5, raised rather than spent** — the third entry here to
    // record no feature, and for the same reason as the first two. M163 came
    // in at 161.56 after its prose was cut, which leaves 0.04KB: below the
    // 0.05 that the entry below already called too tight to ship on, and the
    // slack guard in this file puts the ceiling on a raise at 1.5KB, so 162.5
    // is the largest honest step from the 161.11 measured before M163.
    //
    // The line moves in its own commit, ahead of the milestone rather than
    // inside it, because the one condition a budget should never be moved
    // under is pressure from the change that needs it.
    //
    // **Unchanged at M167**, measured 161.06 → 161.11: 0.05KB, and the whole
    // of it is one regex. The milestone's bulk — `engine/programSafety.ts`,
    // its five rules and the paragraphs they say — lands in the builder's
    // chunk, and `ISSUE_RANK` lands in `customProgram`'s; neither is on the
    // first-load path, which is `index-*.js` and the stylesheet and nothing
    // else. What *is* first-load is `bodyLoad.ts`, because the logger reads
    // it, and the only change there is the `one-arm` pattern growing a
    // lookahead. The cheapest of the three safety milestones by a wide
    // margin, and the reason is that a builder check is read while writing a
    // program, which is the one screen nobody reaches on a cold start.
    //
    // **Unchanged at M161**, measured 161.02 → 161.06: 0.04KB — a component
    // on a lazy route, two call sites, and three functions in `bodyLoad.ts`,
    // which the logger already pulls in. The cheapest safety milestone of
    // the three, because the reading it needed was already there.
    //
    // **Unchanged at M160**, measured 160.55 → 161.02: 0.47KB for
    // `engine/fingerGap.ts` and the coach rule that reads it. First-load
    // because the coach is — Home's card is the first thing that asks it a
    // question — and the module is small because the work is done by
    // `bodyLoad`'s existing rules; what is new is which three of them count
    // and the arithmetic over the dates.
    //
    // **160.6 → 161.6, raised rather than spent** — the second entry here to
    // record no feature, and for the same reason as the first. M162 came in
    // at 160.55, which left 0.05KB: the next change of any size would have
    // had to move the line in its own commit, under pressure, which is the
    // one condition a budget should never be moved under. So it moves here,
    // alone, to one milestone's headroom again.
    //
    // **Unchanged at M162**, measured 159.83 → 160.55: 0.72KB, and the
    // headroom raised on its own before M158 is now spent — 0.05KB left,
    // tighter than the 0.11 that prompted the raise. The next milestone
    // moves the line again, and should do it on its own for the same reason.
    // The cost is honesty rather than feature: a bracket in the load window,
    // three fields on `LoadState`, a coach rule and a second `unknown` note,
    // all of it in `derive.ts` and `coach.ts`, which are first-load because
    // Home's card reads them.
    //
    // **Unchanged at M159**, measured 159.83 → 159.83 — no movement at all.
    // A date guard, a write-once meta key and a card on a lazy route, and
    // `version.ts` swapped a string literal for a build-time define, which
    // minifies to the same literal. The one entry here that bought something
    // for nothing.
    //
    // **Unchanged at M158**, measured 159.73 → 159.83: 0.10KB, nearly all of
    // it `readOr` in `db/db.ts` and the seven one-line wrappings it enables.
    // First-load by construction — `db/db.ts` is what every read goes through
    // — and the cheapest kind of copy there is, since the fallbacks are a
    // `false`, a `0`, two `[]`s, a `null` and an empty `Map`.
    //
    // **Unchanged at M157**, measured 159.59 → 159.73: 0.14KB for two
    // reference-identity caches — one flattening of the log in the sessions
    // store, one derivation in `engine/derive.ts` — both of them first-load
    // by construction, since the store and the engine are what every screen
    // goes through. It buys back far more than it costs at runtime: a page
    // that asked four times for the climber state walked a decade of
    // sessions four times and now walks it once.
    //
    // **159.7 → 160.6, raised rather than spent.** The one entry here that
    // records no feature. M152 came in at 159.59 and left 0.11KB, which is
    // inside the rule but not inside its intent: the next change of any size
    // would have had to move the line in its own commit, and a budget moved
    // under pressure is a budget moved without thought. So it moves here
    // instead, on its own, to one milestone's headroom — the 1.5KB the slack
    // check calls roughly that. Nothing was built to earn it and nothing
    // spent it; the milestone that does spend it says what it bought, the way
    // every entry below does.
    //
    // **Unchanged at M152**, measured 159.44 → 159.59: 0.15KB for five back
    // links, three empty-state actions and a card of two rows on Progress —
    // all of it markup on pages that were already in the tree, and the
    // routing change that moved the drill library cost nothing at all. It
    // leaves 0.11KB, which is the tightest this has been; the next milestone
    // raises the line rather than squeezing under it.
    //
    // **158.9 → 159.7 at M151**, measured 158.61 → 159.44: 0.83KB, and
    // first-load by construction twice over. `db/db.ts` is what every read
    // and write goes through, and the banner lives in `AppShell`, which is
    // the shell itself — there is no boundary to put either behind. Most of
    // it is the copy: four faults, each with a headline, a body and, for
    // the full disk, somewhere to go, because the four need different
    // things done and a single message would be the same shrug this
    // milestone exists to remove. 0.26KB of slack.
    //
    // **Unchanged at M155+M156**, measured 158.68 → 158.61 — the number
    // went *down*. 642 lines left the tree and almost none of them were on
    // the boot path, which is the honest reading: dead code is mostly not
    // expensive, it is just dead.
    //
    // **Unchanged at M153**, measured 158.16 → 158.37: a part-name table
    // beside the load rules, the split that sorts a protocol's safety rules
    // by whether they are about this climber, and the note the logger draws
    // them in. 0.21KB, inside the 0.23 that was left.
    //
    // **158.6 → 158.9 at M154**, measured 158.37 → 158.68: 0.31KB, and all
    // of it is first-load by construction. `main.tsx` is the entry point, so
    // the module that asks whether a new version exists cannot be anywhere
    // else — there is no lazy boundary to put a service-worker registration
    // behind. Two thirds of it is `lib/swUpdate.ts` and its injected clock;
    // the rest is two constants and two predicates in `engine/offline.ts`,
    // which the prompt already pulls in. 0.22KB of slack.
    //
    // **155.0 → 158.6 at M148**, measured 154.13 → 158.10: 3.97KB, and the
    // largest single-milestone cost to first load since M117. Worth the
    // paragraph, because the number is not an accident and the fix for it
    // is not this milestone.
    //
    // Split by rebuilding twice: **2.56KB is the six joins themselves** —
    // a minute estimate against a logged duration, a declared intensity
    // against a typed RPE, a weekly step against a series of readings, a
    // deload marker against the load index, spacing constraints against
    // the dates, a menu against the ticks — and **1.41KB is their copy**,
    // eight bodies at the length every other coach rule is written to. No
    // import did this: stubbing `sessionLength` out changed the figure by
    // nothing, because `PreSession` already carries it.
    //
    // It lands in the entry chunk because `HomePage` renders the top tip's
    // headline *and* its body, so `useTips` is eager and everything the
    // coach reads is first-load. M104 made the `/coach` route's lazy
    // boundary real by splitting the hook out of the page; the boundary
    // that is still notional is Home's own card, and moving it behind one
    // would take this, `coach.ts`, `plateau.ts` and `adherence.ts` off the
    // boot path together. That is a perf milestone with its own suspense
    // boundary to get right, and doing it inside this one would leave two
    // measurements tangled in each other.
    //
    // 0.50KB of slack, which is the tightest this line has been set: the
    // next milestone to touch the entry chunk moves it and says what for.
    //
    // **154.0 → 155.0 at M145**, measured 153.98 → 154.00, and the 0.02KB
    // is not weight. The calendar's legend is in `CalendarPage`, a lazy
    // chunk; what grew in the entry is the *module map*, because that
    // chunk's content hash changed and its filename is a string the entry
    // carries. Deterministic — two builds agree to the byte — and unrelated
    // to anything that loads at boot.
    //
    // The line moves because 154.0 had three bytes of room left, which is
    // smaller than one lazy chunk's hash churn: a ceiling that close fails
    // on builds that changed nothing worth failing over, and a gate that
    // cries wolf is a gate that gets raised in a hurry. 1.00KB of slack,
    // inside the 1.5KB the headroom test allows.
    //
    // **170.0 → 154.0 at M137**, measured 169.42 → 153.50, so 15.92KB back:
    // the 156 drill descriptions left the entry chunk for
    // `content/drillText.ts`, a 17.3KB chunk of their own that the drill
    // pages import and the search sheet fetches when it opens. The injury
    // scan, which read the paragraphs, reads `Drill.loads` instead —
    // derived from the text and pinned to it — which is the ~1KB the
    // entry kept. The line follows the win the way it followed M78's.
    //
    // **165.0 → 166.0 at M131**, measured 164.17 → 165.29, so 1.12KB, and
    // the interesting part is the 2.3KB it is *not*. The session-length
    // estimate reads the prescription, and a first draft read protocol
    // timers too — which put `content/protocols`, prose and cues and all,
    // in the entry chunk, because the card that shows the estimate is the
    // one on the front door. Measured both ways: 167.63 with the registry,
    // 165.29 without, for five to twenty per cent of accuracy on a figure
    // already printed as a range. The cheaper number won.
    //
    // **164.0 → 165.0 at M129**, measured 163.95 → 164.03, so 0.08KB. The
    // dose arithmetic — `easedDose`, `easesAnything` and the deload rule
    // M128 built on it — lives in `engine/plan.ts`, which is entry-chunk by
    // construction because `usePlannedDay` reads it on every screen that
    // shows a day. The readiness engine and the prescription card it feeds
    // are both inside the lazy logger, so what reaches here is the
    // arithmetic and nothing else.
    //
    // Unchanged at M125 through M128, measured 163.06 → 163.95: new light
    // palettes are the same number of bytes, and M126's block screen, M127's
    // week steps and M128's deload all landed on lazy routes or in content.
    //
    // **203.0 → 164.0 at M124, measured 202.08 → 163.06 — 39KB off, and
    // the largest single move this file has recorded.** The logger is
    // genuinely lazy again: Home shows the pre-session card and the editor
    // is behind the tap, so `LogPage`'s 20.48KB chunk and everything only
    // it reaches left the entry chunk.
    //
    // **This is not M115 being reinstated and M117 being undone, and the
    // difference is the whole point.** M115 made the logger lazy and left
    // Home with a card that *linked* to it, so the session button itself
    // arrived a chunk load late — that is what M117's table below measured
    // at ~300ms cold, and it is why the split lost. The button is eager
    // here: `PreSession.tsx` carries the card, the label logic and the
    // start, and Home imports that rather than `DayBody`. What went behind
    // the tap is the editor, which nobody sees until they have pressed the
    // button that creates the session anyway — and by then the service
    // worker has precached the chunk. The guard below is what keeps the
    // static import from creeping back.
    //
    // **204.4 → 203.0 at M123**, measured 204.33 → 202.08, and the first
    // move *down* since M117: onboarding left the entry chunk for a 3.50KB
    // lazy chunk of its own, and `lib/launchFlag.ts` went with the
    // redirect it existed for. The three cards Home carries instead cost
    // well under a kilobyte of the 2.25 that came back. Unchanged at M121
    // and M122, both lazy routes.
    //
    // **Unchanged at M120**, measured 203.48 → 204.32 against 204.4: the
    // fold, the rest timer and the tally row moved into the eager logger
    // (0.84KB), and `GymPage`'s lazy chunk went — which the entry never
    // carried, so it saved nothing here. Slack is 0.08KB; the next milestone
    // to touch the entry chunk moves the line, which is the rule working.
    //
    // **Unchanged at M119**, measured 203.43 → 203.48: the view field in
    // `settings.ts` and the picker's route through the entry chunk.
    //
    // **A correction to the two notes below (M119).** M117's "202.42" and
    // M118's "202.43 →" were a Python gzip of the same files; the "→ 203.43"
    // was this function's Node gzip. The two compressors differ by about
    // 0.8KB on this input, so the M118 delta read as 1.0KB when it was
    // 0.21KB. Rebuilt from the M117 commit and measured here: **203.22**.
    // The budgets themselves were never wrong — each was checked by this
    // test against its own number — only the deltas quoted in prose were.
    // Every figure in this file from here on is this function's.
    //
    // **203.4 → 204.4 at M118**, measured 203.22 → 203.43: the reward
    // card's fold (`ui/Disclosure` was not on the boot path before) and
    // the search keywords for `/game` and `/body` in the route table.
    //
    // 174.04 → 165.13 before the logger came back: Home lost the climber
    // strip, the altimeter, the arcade card and — the large one — `BoardCard`,
    // which it imported from `BoardPage.tsx` and so carried the whole board
    // page in the entry chunk. Those are on the Game tab now, lazily.
    expect(total, `first load is ${total.toFixed(2)}KB gzipped`).toBeLessThan(BUDGET);
  });

  it.runIf(built)('leaves no headroom a regression could hide in', () => {
    /**
     * The rule this file has stated in prose since M78, made checkable.
     *
     * A ceiling cannot notice being *raised*: set `BUDGET` to 300 and the
     * test above passes forever while catching nothing, which is exactly
     * what a mutation showed. This is the other half — the budget has to sit
     * just above what was actually measured, so the next regression hits it
     * rather than disappearing into slack.
     *
     * 1.5KB because that is roughly one milestone's worth of growth: enough
     * that a small feature does not have to move the line in the same
     * commit, not enough to swallow a route being made eager by accident.
     */
    const slack = BUDGET - firstLoadKb();
    expect(slack, `the budget has ${slack.toFixed(2)}KB of slack`).toBeLessThan(1.5);
    expect(slack, 'the budget is already blown').toBeGreaterThan(0);
  });

  it.runIf(built)('keeps every program body out of the entry chunk', () => {
    // One marker per program, not one marker. The first version of this
    // checked for a single exercise name, and a static import of the
    // catalogue survived it: Rollup split the bodies across both chunks,
    // 57KB of them into the entry, and the one name happened to stay
    // behind. A body is only out of the entry if all eleven are.
    const html = readFileSync('dist/index.html', 'utf8');
    const entryName = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)![1]!;
    const entry = readFileSync(`${dist}/${entryName}`, 'utf8');
    const chunks = readdirSync(dist).filter((f) => f.endsWith('.js'));
    const catalogue = chunks.filter((f) => f.startsWith('catalogue-'));
    expect(catalogue, 'the catalogue is its own chunk').toHaveLength(1);
    const bodies = readFileSync(`${dist}/${catalogue[0]!}`, 'utf8');

    expect(CATALOGUE.length).toBeGreaterThanOrEqual(11);
    for (const program of CATALOGUE) {
      // Subtitles are prose long enough to be unique and, trimmed at the
      // first quote, safe from whatever quoting the minifier chose.
      const marker = program.subtitle.split(/['"]/)[0]!.trim();
      expect(marker.length, `${program.id} subtitle too short to be a marker`).toBeGreaterThan(12);
      expect(entry.includes(marker), `${program.id} is in the entry chunk`).toBe(false);
      expect(bodies.includes(marker), `${program.id} is not in the catalogue chunk`).toBe(true);
    }
  });

  it.runIf(built)('keeps the arcade out of the entry chunk', () => {
    /**
     * The Ascent is one lazy route and its tuning table has no business on
     * the boot path (PLAN.md M214).
     *
     * This exists because M214 put it there. `db/game.ts` is read before
     * anything renders, it gained an import of the run-ending tally, and the
     * tally's module imported `ascent/config` for the spawn weights — which
     * carried the whole arcade table into the first load and took it from
     * 137.35KB to 138.47, through the ceiling. The tally is dependency-free
     * now and the reading that needs the weights is a separate module. This
     * fails if the two are ever merged back.
     */
    const html = readFileSync('dist/index.html', 'utf8');
    const entryName = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)![1]!;
    const entry = readFileSync(`${dist}/${entryName}`, 'utf8');
    // Markers from `ascent/config` only. `rewards.PAYOUT` is deliberately
    // not on this list: `store/game.ts` prices a finished run through
    // `payoutFor` to write the ledger, so that table is a real boot-path
    // dependency and `freeSoloMultiplier` is in the entry on purpose.
    //
    // One marker per table, because a partial leak would pass a single probe.
    for (const marker of ['arrivalWindowRatio', 'rampSeconds', 'maxRampReduction', 'laneChangeMs']) {
      expect(entry.includes(marker), `${marker} is in the entry chunk`).toBe(false);
    }
    // The control: the Ascent's *route* is eager — the shell needs every
    // path for search and the nav — so this sweep finding nothing at all
    // would mean it was reading the wrong file rather than passing.
    expect(entry.includes('minigame'), 'the route table is not in the entry either').toBe(true);
  });

  it.runIf(built)('keeps the drill text out of the entry chunk', () => {
    // A marker per drill, not one marker, for the reason the program-body
    // check above gives: a split that leaks half the text back into the
    // entry would pass a single probe. Every one of the 156 has to be out,
    // and all of them in the one chunk that holds them (PLAN.md M137).
    const html = readFileSync('dist/index.html', 'utf8');
    const entryName = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)![1]!;
    const entry = readFileSync(`${dist}/${entryName}`, 'utf8');
    const chunks = readdirSync(dist).filter((f) => f.startsWith('drillText-') && f.endsWith('.js'));
    expect(chunks, 'the drill text is its own chunk').toHaveLength(1);
    const text = readFileSync(`${dist}/${chunks[0]!}`, 'utf8');
    expect(DRILLS.length).toBeGreaterThan(150);
    for (const drill of DRILLS) {
      // The longest run of the text with no quote or backslash in it, so the
      // marker survives whatever quoting the minifier chose; trimmed at the
      // first quote alone, a text that opens with one made a nine-letter
      // marker.
      const marker = DRILL_TEXT[drill.id]!
        .split(/['"\\]/)
        .map((run) => run.trim())
        .sort((x, y) => y.length - x.length)[0]!
        .slice(0, 60);
      expect(marker.length, `${drill.id} text too short to be a marker`).toBeGreaterThan(12);
      expect(entry.includes(marker), `${drill.id} is in the entry chunk`).toBe(false);
      expect(text.includes(marker), `${drill.id} is not in the drill text chunk`).toBe(true);
    }
  });

  it.runIf(built)('keeps the heavy routes out of the first load', () => {
    // `LogPage` was on this list from M115 to M116. Home is the logger now
    // (M117), so its chunk *is* the entry chunk — see the table below.
    const names = readdirSync(dist).filter((f) => f.endsWith('.js'));
    for (const split of ['AscentPage', 'BuilderPage', 'GuidePage', 'SearchSheet']) {
      expect(names.some((f) => f.startsWith(split)), `${split} is not split out`).toBe(true);
    }
  });

  it('imports only the routes that cannot be deferred', () => {
    // The guard that keeps the split from eroding one convenient static
    // import at a time. Home is where the app opens, the placeholder is a
    // few lines, and `TodayRedirect` is six — a launcher shortcut points at
    // `#/today`, so it is a cold-start entry and deferring it would put two
    // chunk loads in front of one navigation. Everything else is a chunk.
    // Onboarding was on this list until M123: a new install was sent to
    // `/welcome` before anything else, so the page had to be eager. It is
    // opt-in from a Home card now, and lazy.
    //
    // **`LogPage` was on this list until M115, Home imported it again from
    // M117 to M123, and since M124 nothing imports it eagerly at all.**
    // Home carries `PreSession.tsx` — the card and the button — and the
    // editor is behind the tap; the test below holds that. What follows is
    // the M115 record, kept because it is the reasoning M124 acted on.
    // "The logger is what it is for" read as a reason to keep it eager for
    // five milestones, and the
    // note above called it the real headroom every time without anyone
    // measuring it. Measured: **44.81KB gzipped** of entry chunk, 218.86 →
    // 174.05.
    //
    // **That headline number oversells it, and the measurements that say so
    // are worth keeping.** The service worker precaches every chunk
    // (`globPatterns` is `**/*.js`), so a first visit fetches the same bytes
    // either way — the split changes the *order* they arrive in, not the
    // volume. Counting what a cold start actually pulls, boot goes
    // 254.12 → 209.29KB; but a climber who cold-starts and goes straight to
    // the logger pulls **20 chunks and 51.27KB** on that navigation, for
    // 260.56KB against 254.12 before. That path is **6.44KB worse**, not
    // 27KB better as a first draft of this comment claimed by counting only
    // `LogPage`'s own 17.73KB chunk.
    //
    // What justifies it is the time, measured rather than assumed: cold
    // load to first heading on a 6× throttled CPU, seven runs each, median
    // **775ms → 727ms** and best-case 730 → 672. Around 6%, on every cold
    // start, for everyone — against 6.44KB once, on a first-ever visit that
    // goes straight to the logger before the precache lands.
    //
    // The 20-chunk fan-out was the next thing to look at rather than a
    // footnote: 13.99KB of it was the glossary, pulled in by one `<Term>` on
    // an exercise name so it could ask whether that name has a definition.
    //
    // **M116 fixed it and the regression above went with it.** The keys live
    // in `content/glossaryTerms.ts` (1.57KB, generated) and the definitions
    // load on the tap that asks for one, so the logger navigation is
    // 51.27 → **39.05KB** and boot-plus-logger is 260.56 → **248.36KB** —
    // against **254.12KB** before M115 made the logger lazy at all. The path
    // this comment recorded as 6.44KB worse is now 5.76KB better, and every
    // other path keeps the 44.81KB.
    const app = readFileSync('src/App.tsx', 'utf8');
    const eager = [...app.matchAll(/^import \{([^}]+)\} from '@\/(features\/[^']+)'/gm)].map(
      (m) => m[2],
    );
    expect(eager.sort()).toEqual([
      'features/home/HomePage',
      'features/log/TodayRedirect',
      'features/placeholder/PlaceholderPage',
    ]);
  });

  it('keeps the editor off the front door', () => {
    // The import that would silently undo M124's 39KB. `HomePage.tsx`
    // needs the pre-session card, which is its own module for exactly this
    // reason; importing anything from `LogPage.tsx` — `DayBody` is the
    // tempting one — puts two thousand lines of editor back in the entry
    // chunk, and the budget test above would be the only thing to notice.
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    expect(home).not.toMatch(/from '@\/features\/log\/LogPage'/);
    // And the card has to stay independent of it, or Home pulls it
    // transitively and the check above proves nothing.
    const card = readFileSync('src/features/log/PreSession.tsx', 'utf8');
    expect(card).not.toMatch(/from '\.\/LogPage'/);
  });

  it('keeps the redirect out of the logger it redirects to', () => {
    // The mechanism behind the split. `TodayRedirect` used to be declared in
    // `LogPage.tsx`, so importing it imported 2,000 lines and everything
    // they touch — the same shape as `db/demoFlag.ts` (M110), and as
    // `lib/launchFlag.ts` was from M111 until M123 retired it with the
    // redirect it served. If it moves back, the eager list above
    // still passes and the 44.81KB comes back silently.
    const redirect = readFileSync('src/features/log/TodayRedirect.tsx', 'utf8');
    expect(redirect).not.toMatch(/from '\.\/LogPage'/);
    expect(readFileSync('src/features/log/LogPage.tsx', 'utf8')).not.toMatch(
      /export function TodayRedirect/,
    );
  });

  it.runIf(built)('has no single chunk over 780KB', () => {
    const big = readdirSync(dist)
      .filter((f) => f.endsWith('.js'))
      .map((f) => ({ f, kb: statSync(`${dist}/${f}`).size / 1024 }))
      .filter((x) => x.kb > 780)
      .map((x) => `${x.f} ${x.kb.toFixed(0)}KB`);
    expect(big).toEqual([]);
  });
});
