import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrograms } from '@/content/programs';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  ACUTE_DAYS,
  ACWR_BOUNDS,
  CHRONIC_DAYS,
  CHRONIC_WEEKS,
  buildLoadIndex,
  deriveClimberState,
  loadSeries,
} from './derive';
import { MAX_BUILD, RAMP } from './peak';

/**
 * Which ACWR the app computes, and what it is allowed to say about it
 * (PLAN.md M168).
 */

const TODAY = '2026-05-04';

const at = (date: string, rpe: number, min: number): Session => ({
  ...newSession(date, 0),
  completed: true,
  rpe,
  durationMin: min,
});

/** Three sessions a week for three months, which is a baseline. */
function steady(days = 90, on = [1, 3, 5]): Session[] {
  const out: Session[] = [];
  for (let d = days; d >= 0; d -= 1) {
    const date = addDays(TODAY, -d);
    if (on.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) out.push(at(date, 7, 60));
  }
  return out;
}

/**
 * Both forms of the ratio off the same log.
 *
 * Coupled is what the app computes: the acute week divided by a baseline that
 * contains it. Uncoupled divides it by the twenty-one days *before* it, which
 * is the usual answer to the coupling criticism.
 */
function forms(sessions: Session[]): { coupled: number | null; uncoupled: number | null } {
  const index = buildLoadIndex(sessions);
  const load = (d: string) => index.byDate.get(d)?.load ?? 0;
  let acute = 0;
  let chronic = 0;
  for (let i = 0; i < 7; i += 1) acute += load(addDays(TODAY, -i));
  for (let i = 0; i < 28; i += 1) chronic += load(addDays(TODAY, -i));
  const prior = chronic - acute;
  return {
    coupled: chronic === 0 ? null : acute / (chronic / 4),
    uncoupled: prior === 0 ? null : acute / (prior / 3),
  };
}

beforeAll(async () => {
  await loadPrograms();
});

describe('the app computes the coupled ratio, and this is what that means', () => {
  /**
   * The coupling itself, as arithmetic rather than as a claim: the acute week
   * is inside the chronic window, so its load is on both sides of the
   * division. Held by taking one session out of the acute week and watching
   * the chronic baseline move with it.
   */
  it('puts the acute week inside its own baseline', () => {
    const base = steady();
    const extra = at(addDays(TODAY, -1), 8, 120);
    const before = deriveClimberState(base, { today: TODAY }).load;
    const after = deriveClimberState([...base, extra], { today: TODAY }).load;
    expect(after.acute).toBeGreaterThan(before.acute);
    // The uncoupled form would leave this untouched. It does not.
    expect(after.chronic, 'the chronic baseline ignored a session from this week').toBeGreaterThan(
      before.chronic,
    );
  });

  /**
   * The windows themselves, pinned through the engine rather than through
   * this file's own arithmetic.
   *
   * The battery found this missing: widening the acute window to a fortnight
   * and shrinking the chronic divisor to three both survived, because every
   * other test here computes the windows itself and the fixtures are uniform
   * enough that a wrong window still reads 1.0. A formula nothing pins is a
   * default, which is the thing this milestone exists to stop.
   */
  it.each([
    [6, true],
    [7, false],
  ])('counts a session %i days ago in the acute week: %s', (ago, inside) => {
    const one = [at(addDays(TODAY, -ago), 7, 60)];
    const { acute } = deriveClimberState(one, { today: TODAY }).load;
    expect(acute > 0).toBe(inside);
  });

  it.each([
    [27, true],
    [28, false],
  ])('counts a session %i days ago in the chronic window: %s', (ago, inside) => {
    const one = [at(addDays(TODAY, -ago), 7, 60)];
    const { chronic } = deriveClimberState(one, { today: TODAY }).load;
    expect(chronic > 0).toBe(inside);
  });

  /**
   * And the baseline is the 28-day total over four, not over three — read off
   * the index rather than hard-coded, because the unit is effort × hours and
   * a literal here would be asserting the sRPE formula by accident.
   */
  it('divides the chronic window by four', () => {
    const day = addDays(TODAY, -10);
    const one = [at(day, 7, 60)];
    const total = buildLoadIndex(one).byDate.get(day)!.load;
    expect(total, 'the fixture logged no load').toBeGreaterThan(0);
    expect(deriveClimberState(one, { today: TODAY }).load.chronic).toBeCloseTo(total / 4, 5);
  });

  /**
   * The coupling, stated as the identity it is: the chronic total is the
   * acute week plus the twenty-one days before it. Mutating the window to
   * exclude the acute week breaks this and nothing else in the suite.
   */
  it('builds the baseline out of a window that contains the acute week', () => {
    const log = [...steady(), at(addDays(TODAY, -1), 8, 120)];
    const { acute, chronic } = deriveClimberState(log, { today: TODAY }).load;
    const index = buildLoadIndex(log);
    const load = (d: string) => index.byDate.get(d)?.load ?? 0;
    let prior21 = 0;
    for (let i = 7; i < 28; i += 1) prior21 += load(addDays(TODAY, -i));
    expect(chronic * 4).toBeCloseTo(acute + prior21, 5);
    expect(prior21, 'the fixture has no history to be coupled with').toBeGreaterThan(0);
  });

  /**
   * The same windows, from the other implementation.
   *
   * `deriveLoad` answers for one day and `loadSeries` rolls a series; both
   * are deliberate and both used to carry their own copies of 7, 28 and 4.
   * A mutation to either survived every test of the other, so the constants
   * are named once now and this holds the two readings equal.
   */
  it('reads the same ratio through the series as through the single day', () => {
    const log = [...steady(), at(addDays(TODAY, -1), 8, 120)];
    const index = buildLoadIndex(log);
    const [point] = loadSeries(index, [TODAY]);
    const state = deriveClimberState(log, { today: TODAY }).load;
    expect(point!.acute).toBeCloseTo(state.acute, 5);
    expect(point!.chronic).toBeCloseTo(state.chronic, 5);
    expect(point!.acwr!).toBeCloseTo(state.acwr!, 5);
    expect(point!.zone).toBe(state.zone);
  });

  it.each([
    [ACUTE_DAYS - 1, true],
    [ACUTE_DAYS, false],
  ])('counts a session %i days ago in the series acute window: %s', (ago, inside) => {
    const [point] = loadSeries(buildLoadIndex([at(addDays(TODAY, -ago), 7, 60)]), [TODAY]);
    expect(point!.acute > 0).toBe(inside);
  });

  it.each([
    [CHRONIC_DAYS - 1, true],
    [CHRONIC_DAYS, false],
  ])('counts a session %i days ago in the series chronic window: %s', (ago, inside) => {
    const [point] = loadSeries(buildLoadIndex([at(addDays(TODAY, -ago), 7, 60)]), [TODAY]);
    expect(point!.chronic > 0).toBe(inside);
  });

  /** And the windows are the ones the milestone decided on. */
  it('names the windows once, at seven days and twenty-eight', () => {
    expect(ACUTE_DAYS).toBe(7);
    expect(CHRONIC_DAYS).toBe(28);
    expect(CHRONIC_WEEKS).toBe(4);
  });

  it('agrees with the uncoupled form exactly when nothing is changing', () => {
    const { coupled, uncoupled } = forms(steady());
    expect(coupled).toBeCloseTo(1, 5);
    expect(uncoupled).toBeCloseTo(1, 5);
  });

  /**
   * And diverges hard as load rises, which is the measurement the decision
   * rests on. The numbers are the ones quoted in `derive.ts` and in the
   * injury guide; if they move, both pieces of prose are wrong.
   */
  it.each([
    { shape: 'one extra session', coupled: 1.23, uncoupled: 1.33, days: [-2] },
    { shape: 'a trip week', coupled: 3.11, uncoupled: 10.52, days: [0, -1, -2, -3, -4] },
  ])('reads $shape as $coupled coupled and $uncoupled uncoupled', ({ coupled, uncoupled, days }) => {
    const extra = days.map((d) =>
      days.length === 1 ? at(addDays(TODAY, d), 7, 60) : at(addDays(TODAY, d), 8, 300),
    );
    const read = forms([...steady(), ...extra]);
    expect(read.coupled!).toBeCloseTo(coupled, 1);
    expect(read.uncoupled!).toBeCloseTo(uncoupled, 1);
    expect(read.uncoupled!).toBeGreaterThan(read.coupled!);
  });

  /**
   * The reason the bands cannot simply be carried across. A trip reads inside
   * the chart's drawn range under this form and several times off the end of
   * it under the other, on the same five days of climbing.
   */
  it('shows the danger line means different things under each form', () => {
    const trip = [...steady(), ...[0, 1, 2, 3, 4].map((d) => at(addDays(TODAY, -d), 8, 300))];
    const { coupled, uncoupled } = forms(trip);
    expect(coupled!).toBeGreaterThan(ACWR_BOUNDS.cautionTo);
    expect(uncoupled! / coupled!).toBeGreaterThan(3);
  });

  /**
   * And the reason the rest of the app would need redrawing. `peak.ts` states
   * its own arithmetic in prose — a steady geometric ramp of `r` settles at
   * `4 / (1 + 1/r + 1/r² + 1/r³)` — and that formula *is* the coupled one.
   * Under the uncoupled form the same ramp settles higher, so `RAMP` and
   * `MAX_BUILD` were chosen against numbers that would no longer hold.
   */
  it('is the form peak.ts derives its ramp from', () => {
    const settled = (r: number) => 4 / (1 + 1 / r + 1 / r ** 2 + 1 / r ** 3);
    const uncoupledSettled = (r: number) => 3 / (1 / r + 1 / r ** 2 + 1 / r ** 3);
    // The app's own claim, checked: 1.22 a week reaches the top of the band.
    expect(settled(1.22)).toBeCloseTo(ACWR_BOUNDS.optimalTo, 1);
    // And the ramp the plan actually uses sits comfortably inside it.
    expect(settled(RAMP)).toBeLessThan(ACWR_BOUNDS.optimalTo);
    // Under the other form it does not settle in the same place at all.
    expect(uncoupledSettled(RAMP)).toBeGreaterThan(settled(RAMP));
    expect(uncoupledSettled(1.2)).toBeGreaterThan(ACWR_BOUNDS.optimalTo);
    expect(MAX_BUILD).toBeGreaterThan(1);
  });
});

/**
 * Every source file, tests excluded — the same sweep `privacy.test.ts` uses,
 * and for the same reason: a claim is only retired if it cannot come back.
 */
function sourceFiles(dir = 'src'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry) || /\.test\.tsx?$/.test(entry)) continue;
    out.push(path);
  }
  return out;
}

const FILES = sourceFiles();

describe('what the app is allowed to claim about it', () => {
  it('reads enough of the source to be worth trusting', () => {
    expect(FILES.length).toBeGreaterThan(200);
    expect(FILES).toContain('src/ui/loadZone.ts');
    expect(FILES).toContain('src/content/guides/injury.ts');
  });

  /**
   * The claims this milestone retired.
   *
   * `derive.ts` is the one file exempt, and deliberately: it is the record of
   * what was decided and why, it quotes the retired sentences in order to say
   * they are retired, and none of its prose is ever rendered. Everything else
   * — UI, content, guides — is held absolutely, including the guide that used
   * to make the loudest of these claims. A guide is a reference document
   * rather than a changelog, so it does not quote what it used to say either.
   */
  const DECISION_RECORD = 'src/engine/derive.ts';
  const claiming = (pattern: RegExp) =>
    FILES.filter((path) => path !== DECISION_RECORD && pattern.test(readFileSync(path, 'utf8')));

  it.each([
    ['the pattern most associated with injury', /most associated with injury/i],
    ['a powerful metric', /powerful metric/i],
    ['minimize injury risk', /minimi[sz]e injury risk/i],
    ['high risk of injury', /high(er)? risk of injury/i],
    ['injury risk at a minimum', /injury risk at a minimum/i],
  ])('no longer claims %s', (_label, pattern) => {
    expect(claiming(pattern)).toEqual([]);
  });

  /** And the exemption is a real one rather than a hole: it does quote them. */
  it('keeps the retired claims only in the file that records the decision', () => {
    const record = readFileSync(DECISION_RECORD, 'utf8');
    expect(record).toMatch(/most associated with injury/);
    expect(record).toMatch(/powerful metric/);
  });

  /**
   * And says the awkward thing instead, in the two places a climber can
   * actually read it: the chart they came to for an explanation, and the
   * guide that explains the number.
   */
  it.each([
    ['src/features/progress/ProgressPage.tsx', /both sides of the division/],
    ['src/features/progress/ProgressPage.tsx', /the argument is not settled/],
    ['src/content/guides/injury.ts', /the app uses the contested form of it/],
    ['src/content/guides/injury.ts', /never as a diagnosis/],
  ])('%s says %s', (path, pattern) => {
    expect(readFileSync(path, 'utf8')).toMatch(pattern);
  });

  /**
   * The mechanism survives the retraction, and it should: tissue adapting
   * slower than the muscle driving the change is not the contested part, and
   * stripping it would leave a warning with no reason attached.
   */
  it('keeps the mechanism it can still stand behind', () => {
    expect(readFileSync('src/ui/loadZone.ts', 'utf8')).toMatch(/connective tissue adapts slower/);
    expect(readFileSync('src/engine/coach.ts', 'utf8')).toMatch(/adapt slower than the muscles/);
    expect(readFileSync('src/content/guides/injury.ts', 'utf8')).toMatch(/adapts more slowly/);
  });

  /**
   * And the guide keeps saying what the app draws, which is the older rule
   * this milestone had to leave intact: a guide that says 1.3 while the app
   * draws the line at 1.4 is worse than a guide that says nothing.
   */
  it('still states the bands the app actually uses', () => {
    const guide = readFileSync('src/content/guides/injury.ts', 'utf8');
    expect(guide).toContain(`${ACWR_BOUNDS.optimalFrom} - ${ACWR_BOUNDS.optimalTo}`);
    expect(guide).toContain(`${ACWR_BOUNDS.optimalTo} - ${ACWR_BOUNDS.cautionTo}`);
    expect(guide).toContain(`> ${ACWR_BOUNDS.cautionTo}`);
  });
});
