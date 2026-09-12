import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
import { deriveClimberState } from '@/engine/derive';
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
 * The fastest of five — the run with the least interference from everything
 * else on the machine, and so the closest estimate of what the work itself
 * costs.
 *
 * Only for *ratios*. An absolute budget wants the conservative number and
 * keeps the median; a ratio of two medians divides one noisy measurement by
 * another, and with a three-millisecond denominator that is enough to fail a
 * green build. This one did, twice in a day, while passing on its own
 * (PLAN.md M41).
 */
function fastest(fn: () => void): number {
  return timings(fn)[0] as number;
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

  it('derives XP in single-digit milliseconds', () => {
    // Was 106.9ms before M18, and it runs on every session write. The cost
    // was `loadStateAt` walking 28 days per session with Date arithmetic:
    // 43,680 Date constructions per derivation. One sliding pass instead.
    const ms = median(() => {
      clearXpCache();
      deriveXp({ sessions, projects: [], ledger: [] });
    });
    expect(ms, `deriveXp took ${ms.toFixed(1)}ms`).toBeLessThan(25);
  });

  it('scales linearly rather than superlinearly', () => {
    const half = log(TEN_YEARS / 2);
    const one = fastest(() => {
      clearXpCache();
      deriveXp({ sessions: half, projects: [], ledger: [] });
    });
    const two = fastest(() => {
      clearXpCache();
      deriveXp({ sessions, projects: [], ledger: [] });
    });
    // Twice the log should not cost more than three times the work.
    expect(two / Math.max(one, 0.01), `${one.toFixed(1)}ms → ${two.toFixed(1)}ms`).toBeLessThan(3);
  });

  it('derives everything else in single-digit-to-low milliseconds', () => {
    const budgets: [string, number, () => void][] = [
      ['climberState', 60, () => deriveClimberState(sessions)],
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
    const over = budgets
      .map(([name, budget, fn]) => ({ name, budget, ms: median(fn) }))
      .filter((r) => r.ms > r.budget)
      .map((r) => `${r.name} ${r.ms.toFixed(1)}ms > ${r.budget}ms`);
    expect(over).toEqual([]);
  });

  it('caches so nine callers cost one derivation', () => {
    // The cache is keyed on reference identity, which is sound because the
    // stores replace their arrays rather than mutating them — and which
    // means a caller passing a fresh `[]` each time silently gets nothing.
    // `useXp` memoises the flattened sessions for exactly this reason.
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

  it.runIf(built)('keeps the first load under 217.1KB gzipped', () => {
    const html = readFileSync('dist/index.html', 'utf8');
    const entry = /assets\/(index-[A-Za-z0-9_-]+\.js)/.exec(html)?.[1];
    expect(entry, 'no entry chunk in index.html').toBeDefined();

    const js = gzipSync(readFileSync(`${dist}/${entry}`)).length;
    const css = readdirSync(dist)
      .filter((f) => f.endsWith('.css'))
      .reduce((n, f) => n + gzipSync(readFileSync(`${dist}/${f}`)).length, 0);
    const total = (js + css) / 1024;

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
    expect(total, `first load is ${total.toFixed(2)}KB gzipped`).toBeLessThan(217.1);
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

  it.runIf(built)('keeps the heavy routes out of the first load', () => {
    const names = readdirSync(dist).filter((f) => f.endsWith('.js'));
    for (const split of ['AscentPage', 'BuilderPage', 'GuidePage', 'SearchPage']) {
      expect(names.some((f) => f.startsWith(split)), `${split} is not split out`).toBe(true);
    }
  });

  it('imports only the routes that cannot be deferred', () => {
    // The guard that keeps the split from eroding one convenient static
    // import at a time. Home is where the app opens, the logger is what it
    // is for, onboarding is the first screen of a new install, and the
    // placeholder is a few lines. Everything else is a chunk.
    const app = readFileSync('src/App.tsx', 'utf8');
    const eager = [...app.matchAll(/^import \{([^}]+)\} from '@\/(features\/[^']+)'/gm)].map(
      (m) => m[2],
    );
    expect(eager.sort()).toEqual([
      'features/home/HomePage',
      'features/log/LogPage',
      'features/onboarding/WelcomePage',
      'features/placeholder/PlaceholderPage',
    ]);
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
