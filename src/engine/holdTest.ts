/**
 * The benchmarks that are a duration, not a number (PLAN.md M99b).
 *
 * ## What was wrong with the milestone as written
 *
 * M99b said "the page you visit to record the number never explains it".
 * **That is wrong.** `Metric.description` is set on 30 of 37 metrics and the
 * assessments page renders it in two of its three places. What is actually
 * true is smaller and more specific: the description is missing from the
 * expanded row — the one a climber who already tracks a benchmark opens —
 * and `BenchmarkPrompt.how` is a **second copy of the same prose** that has
 * already drifted from the first. That is M77's problem, not a missing
 * explanation.
 *
 * ## Seven metrics are a stopwatch
 *
 * `dead_hang`, `lock_off_90`, `core_plank`, `hollow_body`,
 * `front_lever_hold`, `density_hang_bw_20mm` and `arc_duration` are all
 * "hold it until you cannot". The app's answer was a text box, so a climber
 * timed a front lever on their phone's clock app and typed the number in.
 *
 * **Derived, not listed.** Which metrics these are falls out of what they
 * already declare — a numeric metric measured in seconds or minutes is a
 * duration — so there is no second table to keep in step with the registry.
 * `core_lever` is excluded twice over, and a mutation corrected this comment
 * about which reason does the work: its unit is `'level/sec'`, not `'sec'`,
 * so the unit check alone already refuses it. The `kind` check is the rule
 * rather than the mechanism — a stopwatch produces a number, so a metric
 * that does not store one cannot use it — and it is held by a test built on
 * a metric of that shape rather than by anything in the registry today.
 *
 * ## The tap comes after the effort, which is why this works
 *
 * The obvious objection to a stopwatch is that nobody presses stop mid-front
 * lever. They do not have to: you drop off the bar and then tap, so the tap
 * is late by the second it takes to reach the phone rather than impossible.
 * Two things keep that honest — a mark you can *hear* while you are hanging,
 * so the number is not a surprise, and a result that lands in the form as a
 * suggestion you confirm rather than a reading that saves itself.
 *
 * Pure: a metric in, the shape of its test out.
 */

import type { Metric } from '@/content/types';

export interface HoldTest {
  /** The metric's own unit, which is what the result has to be in. */
  unit: 'sec' | 'min';
  /**
   * Seconds between audible marks.
   *
   * Ten for a hold measured in seconds — a seven-to-sixty-second effort,
   * where every ten is a useful landmark and every thirty is one mark. Five
   * minutes for an ARC round, because a beep every ten seconds across
   * twenty-five minutes is a hundred and fifty beeps and nobody wants that.
   */
  markEvery: number;
}

/** The shape of this metric's test, or null when it is not a duration. */
export function holdTest(metric: Metric): HoldTest | null {
  if (metric.kind !== 'number') return null;
  if (metric.unit === 'sec') return { unit: 'sec', markEvery: 10 };
  if (metric.unit === 'min') return { unit: 'min', markEvery: 300 };
  return null;
}

/**
 * Elapsed seconds, in the unit the metric is stored in.
 *
 * Minutes are rounded to whole ones: an ARC round is ten to thirty minutes
 * and "22.5" is a precision the test does not have. Seconds are rounded
 * down, because a hold you were partway through is a hold you did not
 * complete — the same direction a coach counts in.
 */
export function holdValue(elapsedMs: number, test: HoldTest): number {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return test.unit === 'min' ? Math.round(seconds / 60) : Math.floor(seconds);
}

/** How many marks have sounded by now, so the caller fires each one once. */
export function marksBy(elapsedMs: number, test: HoldTest): number {
  return Math.floor(Math.max(0, elapsedMs) / 1000 / test.markEvery);
}

/** "1:20" for a stopwatch face, which always counts in minutes and seconds. */
export function formatStopwatch(elapsedMs: number): string {
  const total = Math.floor(Math.max(0, elapsedMs) / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
