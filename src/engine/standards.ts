/**
 * What a reading qualifies you for (PLAN.md M235).
 *
 * `assessments.ts` gives a climber their history, their change and their test
 * schedule, and `content/metrics.ts` carries a prose description per metric
 * and **no reference value of any kind**. So a first dead hang has nothing to
 * be placed against, and the second can only be compared to the first.
 *
 * ## Why this is not a reference band
 *
 * The item this came from asked for a sourced, dated band per metric. Three
 * things are wrong with that, and the first is fatal:
 *
 * - **The one band with real literature behind it needs a bodyweight.**
 *   Finger strength as a percentage of bodyweight against grade is the
 *   best-attested reference in the sport — `siege.ts` quotes the prototype's
 *   own *"Max Hang 20mm 7s at BW+30%"* — and M234 refused to store one, on
 *   purpose. A band in absolute pounds is a band for one bodyweight that
 *   misleads every other climber, which is the exact error M234 removed.
 * - **A band is a population comparison**, however it is dressed. Nothing in
 *   this app compares one climber to another; that is the premise M234's
 *   refusal partly rested on, and it is not one to change in a footnote.
 * - **The sources mostly do not exist.** For a handful of metrics there is
 *   published data, small-sample and often elite-only. For `toe_touch`,
 *   `wall_angel`, `flexibility` — self-scored out of ten — and `box_jump_height`
 *   there is nothing. A band invented for those would be the app
 *   manufacturing authority.
 *
 * ## What it is instead
 *
 * **The catalogue's own entry requirements.** `prerequisites.metrics` is
 * `{ metricId, atLeast }[]`, authored per program and already used by the
 * finder to block or warn — eight of the thirteen programs carry them, and
 * across seven metrics they form a ladder nobody ever showed the climber:
 *
 * ```
 * dead_hang          30s Base Camp · 45s Gravity Defied · 60s Iron Grip
 * max_pushups          5 Base Camp · 10 Gravity Defied · 15 Iron Grip
 * core_plank         60s Base Camp · 90s Gravity Defied
 * max_boulder_grade  V3 Lockdown   · V5 Iron Grip · V8 Peak Performance
 * ```
 *
 * A 52-second dead hang is past Gravity Defied's floor and ten short of Iron
 * Grip's, and the app has known that all along — it just never said it
 * anywhere except as a reason to turn a program away.
 *
 * Sourced by construction, dated by the catalogue, needs no bodyweight and no
 * literature, and compares a climber to **the training in front of them**
 * rather than to other people. It covers seven metrics of the thirty-seven
 * and says nothing about the rest, which is the honest amount.
 */

import { PROGRAMS } from '@/content/programs';
import type { Metric, MetricId } from '@/content/types';
import { joinList } from './phrase';

export interface Standard {
  metricId: MetricId;
  /** The floor, in the metric's stored units. */
  atLeast: number;
  /**
   * Every program that asks for this number, in catalogue order.
   *
   * A list rather than one name, because a rung is a **number** and programs
   * stand on it: Gravity Defied and The Long Game both ask for a 45-second
   * dead hang. The first version carried one program per row, so which of
   * the two the sentence named was decided by their order in `PROGRAMS` —
   * the same arbitrariness M233 took out of the shop ladder, and a test
   * caught it here on the first run.
   */
  programs: string[];
  /** True only when every program on this rung warns rather than blocks. */
  soft: boolean;
}

/**
 * Every floor the catalogue sets for a metric, lowest first, one row per
 * number.
 *
 * Read from `PROGRAMS` rather than a second table, so a prerequisite edited
 * in a program moves this and a program added brings its floors with it.
 */
export function standardsFor(metricId: MetricId): Standard[] {
  const rungs = new Map<number, Standard>();
  for (const program of PROGRAMS) {
    for (const m of program.prerequisites?.metrics ?? []) {
      if (m.metricId !== metricId) continue;
      const soft = program.prerequisites?.soft ?? false;
      const rung = rungs.get(m.atLeast);
      if (rung === undefined) {
        rungs.set(m.atLeast, { metricId, atLeast: m.atLeast, programs: [program.name], soft });
      } else {
        rung.programs.push(program.name);
        // One blocking program on the rung makes the whole rung a block.
        rung.soft = rung.soft && soft;
      }
    }
  }
  return [...rungs.values()].sort((a, b) => a.atLeast - b.atLeast);
}

export interface Placing {
  /** The highest floor this reading clears, or null when it clears none. */
  cleared: Standard | null;
  /** The next floor above it, or null once every one is behind. */
  next: Standard | null;
}

/**
 * Where a reading sits on that ladder.
 *
 * Only for metrics where **higher is better**, which every one the catalogue
 * sets a floor for happens to be. `min_edge` gets better by going down and
 * `atLeast` would mean the opposite there, so rather than guess at an
 * inversion no program has ever asked for, this returns nothing and the page
 * shows nothing. A reading with no standard is not a failure to report.
 */
export function place(metric: Metric, value: number): Placing | null {
  if (!metric.higherIsBetter) return null;
  const ladder = standardsFor(metric.id);
  if (ladder.length === 0) return null;

  let cleared: Standard | null = null;
  for (const standard of ladder) {
    if (value >= standard.atLeast) cleared = standard;
    else return { cleared, next: standard };
  }
  return { cleared, next: null };
}

/**
 * The sentence, or null when the catalogue has nothing to say.
 *
 * `show` renders a stored number the way the climber reads it — grades
 * through their own notation, weights in their own units — and is passed in
 * rather than imported, because this module has no business knowing about
 * settings and `formatEntry` already does the job for every caller.
 *
 * The phrasing never congratulates and never warns. *"Past Gravity Defied's
 * 45 sec"* is a fact about the catalogue; whether it is good news is the
 * climber's to decide, and the finder is the thing that acts on it.
 */
export function describePlacing(
  placing: Placing | null,
  show: (value: number) => string,
): string | null {
  if (placing === null) return null;
  const { cleared, next } = placing;

  // One phrasing whether a rung carries one program or four, rather than a
  // possessive that has to become a list halfway down the ladder.
  const who = (rung: Standard) =>
    `${joinList(rung.programs)} ${rung.programs.length === 1 ? 'asks' : 'ask'} for`;

  if (cleared === null && next !== null) return `${who(next)} ${show(next.atLeast)}.`;
  if (cleared !== null && next !== null) {
    return `Past ${show(cleared.atLeast)}, which ${who(cleared)}. ${who(next)} ${show(next.atLeast)}.`;
  }
  if (cleared !== null) {
    return `Past every floor the catalogue sets — the highest is the ${show(cleared.atLeast)} ${who(cleared)}.`;
  }
  return null;
}
