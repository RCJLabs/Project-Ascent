/**
 * Weight and length in the units the climber uses (PLAN.md M48).
 *
 * The app reads grades as V or Font and routes as YDS or French — it is
 * plainly built for climbers outside the US — and then prescribed max hangs
 * in pounds and box jumps in inches. Meanwhile `min_edge` was already in
 * millimetres, because a 20mm edge is a 20mm edge everywhere. The app was
 * never imperial; it was inconsistent.
 *
 * **Canonical storage stays imperial.** Which unit a number is stored in is
 * invisible, and changing it would mean migrating every logged benchmark for
 * no gain the climber can see. Which unit it is *shown* in is the part that
 * was wrong, and that is a display concern — the same shape as
 * `displayGrade`, and for the same reason.
 */

export type UnitSystem = 'imperial' | 'metric';

/**
 * The imperial units this app measures in, and what they are elsewhere.
 *
 * Keyed by the exact `unit` string a metric declares, so a unit that is not
 * in here is one that needs no conversion — `mm`, `sec`, `reps`. That is the
 * common case and the default: a climber says "20mm edge" in every country.
 */
const CONVERSIONS: Record<string, { label: string; perImperial: number }> = {
  lbs: { label: 'kg', perImperial: 0.45359237 },
  'BW+lbs': { label: 'BW+kg', perImperial: 0.45359237 },
  in: { label: 'cm', perImperial: 2.54 },
  'in from floor': { label: 'cm from floor', perImperial: 2.54 },
  ft: { label: 'm', perImperial: 0.3048 },
};

/**
 * Units that measure *added* weight rather than weight held (PLAN.md M234).
 *
 * `BW+lbs` is the unit of the two benchmarks this app calls standard — the
 * 20mm max hang and the weighted pull-up 3RM — and what it stores is the
 * plate, not the load. The climber is the rest of the load and the app has
 * never known what the climber weighs.
 *
 * That is fine for the thing the number is actually used for: what to load
 * next session reads off added weight either way, and nothing in this app
 * compares one climber to another — there are no reference values in
 * `content/metrics.ts` and no percentiles anywhere.
 *
 * It is not fine for a **percentage**. Thirty pounds added becoming
 * thirty-three is ten per cent of the plate and under two per cent of what
 * the fingers hold, and the app reported the first as a gain. See `changeOf`
 * in `engine/assessments.ts`, which now declines to give one, and the note
 * this drives on the assessment page.
 *
 * A set rather than a flag on `Metric`, because the unit already says it and
 * a second marker is a second thing to drift. `assessments.test.ts` pins
 * which metrics it covers so the set cannot quietly widen.
 */
const ADDED_WEIGHT = new Set(['BW+lbs']);

/** Whether this unit measures what was added rather than what was held. */
export function isAddedWeight(unit: string): boolean {
  return ADDED_WEIGHT.has(unit);
}

/** What to call this unit for a climber reading in `system`. */
export function unitLabel(unit: string, system: UnitSystem): string {
  if (system === 'imperial') return unit;
  return CONVERSIONS[unit]?.label ?? unit;
}

/** A stored number, in the units it should be shown in. */
export function toDisplay(value: number, unit: string, system: UnitSystem): number {
  const conversion = CONVERSIONS[unit];
  if (system === 'imperial' || conversion === undefined) return value;
  // One decimal: 27.2kg is a weight a person recognises, 27.21556kg is not,
  // and the extra digits would come back on the next edit as drift.
  return Math.round(value * conversion.perImperial * 10) / 10;
}

/** A typed number, in the units it is stored in. */
export function fromInput(value: number, unit: string, system: UnitSystem): number {
  const conversion = CONVERSIONS[unit];
  if (system === 'imperial' || conversion === undefined) return value;
  return Math.round((value / conversion.perImperial) * 10) / 10;
}

/**
 * The altimeter's height, which is feet everywhere and was not in the metric
 * registry at all.
 *
 * Its own formatter rather than `toDisplay`, because these are large numbers
 * — 10,238 ft is 3,120 m — and one decimal place on a lifetime total is
 * noise. Whole units and a thousands separator, which is how the altimeter
 * already read.
 */
export function formatHeight(feet: number, units: UnitSystem): string {
  const value = units === 'metric' ? feet * 0.3048 : feet;
  return `${Math.round(value).toLocaleString()} ${units === 'metric' ? 'm' : 'ft'}`;
}

/** Just the number, for a place that prints the unit itself. */
export function heightValue(feet: number, units: UnitSystem): number {
  return units === 'metric' ? Math.round(feet * 0.3048) : Math.round(feet);
}

/**
 * The other direction, for the one thing in the app that stores metres.
 *
 * The Ascent's simulation is metric — `METRES_PER_PX` is 0.4 — while every
 * other height here is canonically feet, and `formatHeight` is the one
 * formatter. So a run converts on the way *in* to that formatter rather than
 * growing a second one, and the factor stays in the table above where the
 * other four conversions live.
 */
export function feetFromMetres(metres: number): number {
  return metres / CONVERSIONS['ft']!.perImperial;
}
