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
 * Two measurements taken alternately, fastest of each.
 *
 * The fastest of five is the run with the least interference from everything
 * else on the machine, and so the closest estimate of what the work itself
 * costs. An absolute budget wants the conservative number and keeps the
 * median; a ratio of two medians divides one noisy measurement by another,
 * and with a three-millisecond denominator that is enough to fail a green
 * build. It did, twice in a day (PLAN.md M41).
 *
 * Taking the fastest of each was not enough on its own (PLAN.md M112d). A
 * `fastest(a)` then `fastest(b)` runs all five of one and then all five of
 * the other, so a runner that gets busier between the two batches inflates
 * *every* sample of the second — and a minimum over five equally inflated
 * samples is still inflated. That is a ratio failing for a reason that has
 * nothing to do with the code, which is what happened on CI at 2.0ms →
 * 7.2ms while the same commit measured 2.3 → 4.9 on a quiet machine.
 *
 * `fastest` alone was not enough. It runs all five of one and then all five
 * of the other, so a runner that gets busier between the two batches
 * inflates *every* sample of the second — and a minimum over five equally
 * inflated samples is still inflated. That is a ratio failing for a reason
 * that has nothing to do with the code, which is what happened on CI at
 * 2.0ms → 7.2ms while the same commit measured 2.3 → 4.9 on a quiet machine.
 *
 * Alternating puts both sides in the same conditions, so drift cancels in
 * the division instead of landing entirely on the numerator.
 */
function ratioOf(a: () => void, b: () => void): { one: number; two: number } {
  const as: number[] = [];
  const bs: number[] = [];
  for (let i = 0; i < 5; i += 1) {
    let start = performance.now();
    a();
    as.push(performance.now() - start);
    start = performance.now();
    b();
    bs.push(performance.now() - start);
  }
  as.sort((x, y) => x - y);
  bs.sort((x, y) => x - y);
  return { one: as[0] as number, two: bs[0] as number };
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
    const { one, two } = ratioOf(
      () => {
        clearXpCache();
        deriveXp({ sessions: half, projects: [], ledger: [] });
      },
      () => {
        clearXpCache();
        deriveXp({ sessions, projects: [], ledger: [] });
      },
    );
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

  /**
   * The ceiling, named so the slack check below can read it.
   *
   * Every milestone that moves this moves it to just above what it measured;
   * the history is in the comment inside the first test.
   */
  const BUDGET = 158.9;

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
