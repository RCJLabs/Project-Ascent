/**
 * The load checks only lazy pages run (PLAN.md M345).
 *
 * Out of `bodyLoad.ts`, whose rules and day-load reading Home needs at boot.
 * What an exercise, a drill or a test loads, and what a protocol's safety
 * note should say, are asked by the log, the test pages and the tissue-load
 * readings.
 */

import type { BodyPart } from '@/content/bodyParts';
import type { Drill, Exercise, Metric, Protocol } from '@/content/types';
import { drillFindings, firstConflict, joinExercise, type LoadFinding, scanText } from './bodyLoad';

/** The parts a text loads, deduplicated. */
export function partsInText(text: string): BodyPart[] {
  return [...new Set(scanText(text).flatMap((f) => f.parts))];
}

/** Every part an exercise loads, by its own words. Empty when none match. */
export function exerciseLoads(exercise: Exercise): BodyPart[] {
  return partsInText(joinExercise(exercise));
}

function joinMetric(metric: Pick<Metric, 'label' | 'description'>): string {
  return [metric.label, metric.description].filter(Boolean).join(' ');
}

/**
 * Whether taking a test would load something the climber says is hurt.
 *
 * The same shape as `exerciseConflict` and `drillConflict`, and deliberately
 * so — an assessment *is* a prescription, and the most maximal one the app
 * ever asks for. `max_hang_20mm_7s` is added weight on a 7-second half-crimp
 * hang; `min_edge` is the smallest edge you can hold. Those are the sessions
 * people get hurt in, because a test is a maximal effort taken on purpose.
 *
 * Null when nothing collides, so a caller renders nothing without checking a
 * length. A metric that is a *record* rather than a test — a redpoint grade,
 * a count of outdoor days — names no movement, so it reads as no parts and
 * warns about nothing, which is the right answer without a taxonomy to
 * maintain.
 */
export function metricConflict(
  metric: Pick<Metric, 'label' | 'description'>,
  injured: readonly BodyPart[],
): LoadFinding | null {
  return firstConflict(scanText(joinMetric(metric)), injured);
}

/** Every part a drill loads, deduplicated. */
export function drillLoads(drill: Pick<Drill, 'name' | 'focus' | 'loads' | 'equipment'>): BodyPart[] {
  return [...new Set(drillFindings(drill).flatMap((f) => f.parts))];
}

export interface ProtocolSafety {
  /**
   * Rules that name a part the climber has flagged. The author's own words
   * about the injury the app already knows about.
   */
  urgent: string[];
  /** Everything else the author wrote, which is true every session. */
  standing: string[];
}

/**
 * A protocol's safety rules, split by whether they are about this climber.
 *
 * **An authored rule is not the same kind of statement as a derived one.**
 * `LOAD_RULES` is a keyword scan that says so in its own header — advisory,
 * over-flags, never blocking. `Protocol.safety` is the person who wrote the
 * program saying *"Skip entirely with any elbow symptom"*. Where both apply
 * to the same line the authored one is the one to show, which is why this
 * is separate from `exerciseConflict` rather than folded into it.
 *
 * The `standing` half is the reason this exists at all: three of the seven
 * rules in the catalogue name no body part — *"The highest injury-risk
 * protocol in any program here"*, *"Miss a rung twice in a row and the
 * session is over"*, *"If you pump out, you went too hard"* — so no injury
 * path could ever have reached them, however the ranking was written.
 */
export function protocolSafety(
  protocol: Pick<Protocol, 'safety'> | undefined,
  injured: readonly BodyPart[] = [],
): ProtocolSafety {
  const rules = protocol?.safety ?? [];
  if (injured.length === 0) return { urgent: [], standing: [...rules] };
  const urgent: string[] = [];
  const standing: string[] = [];
  for (const rule of rules) {
    const named = partsNamedIn(rule);
    (named.some((p) => injured.includes(p)) ? urgent : standing).push(rule);
  }
  return { urgent, standing };
}

/**
 * The hurt parts the program's author has **not** already spoken about
 * (PLAN.md M267).
 *
 * The logger silences its keyword scan on a line whose protocol carries an
 * authored rule about the climber's injury, because the author's own words
 * are the stronger statement and a guess repeated under them is noise. That
 * is right about the part the rule names and wrong about every other part,
 * and the two are not the same set: Max Hangs is authored *"Warm up
 * thoroughly: never load near-max fingers cold"* and scans as fingers,
 * pulley, elbow **and shoulder**. A climber carrying a finger injury and a
 * shoulder injury was told to warm up and told nothing at all about the
 * shoulder, because one matching rule silenced the whole line.
 *
 * Nine of the twenty-two exercises in the catalogue that carry a
 * safety-bearing protocol name fewer parts than their own text loads;
 * Campus Double Dynos silences a knee.
 *
 * So the scan is asked about what is left rather than skipped outright.
 * Where the rules cover everything this returns nothing, `firstConflict`
 * reads an empty list as no conflict, and the behaviour is exactly what it
 * was.
 */
export function unspokenFor(
  protocol: Pick<Protocol, 'safety'> | undefined,
  injured: readonly BodyPart[],
): BodyPart[] {
  const spoken = new Set(protocolSafety(protocol, injured).urgent.flatMap((rule) => partsNamedIn(rule)));
  return injured.filter((part) => !spoken.has(part));
}

/** The parts a sentence names outright. Empty when it names none. */
export function partsNamedIn(text: string): BodyPart[] {
  return (Object.keys(PART_WORDS) as BodyPart[]).filter((part) => PART_WORDS[part].test(text));
}

// ── Rules the author wrote down (PLAN.md M153) ────────────────────────────

/**
 * The words a body part is called by, for reading a sentence about one.
 *
 * A second table in this file and not a second file, because the one above
 * answers a different question: `LOAD_RULES` matches an **activity** and
 * says what it loads — *"campus"* means fingers, pulley, elbow and shoulder
 * whether or not those words appear. This matches the **part itself**, for
 * text that names one: *"Never campus with any existing finger or elbow
 * symptom"* is about the elbow because it says elbow.
 *
 * Running `LOAD_RULES` over that sentence would answer the wrong question
 * and answer it confidently — it matches `campus` and reports four parts,
 * three of which the author never mentioned.
 *
 * A finger rule covers the pulley, because a pulley strain is a finger
 * injury and nothing authored says "pulley".
 */
export const PART_WORDS: Record<BodyPart, RegExp> = {
  fingers: /\bfingers?\b|\bpulley\b|\btendons?\b/i,
  pulley: /\bfingers?\b|\bpulley\b/i,
  // A hand rule covers the thumb and the knuckles, which is what a climber
  // means by it, and *not* the fingers — a finger rule already exists and
  // an author who wrote "finger" did not write "hand" (PLAN.md M223).
  hand: /\bhands?\b|\bthumbs?\b|\bknuckles?\b|\bpalms?\b/i,
  forearm: /\bforearms?\b|\bflexors?\b|\bextensors?\b/i,
  wrist: /\bwrists?\b/i,
  elbow: /\belbows?\b/i,
  shoulder: /\bshoulders?\b|\brotator cuff\b/i,
  lat: /\blats?\b|\blatissimus\b/i,
  neck: /\bneck\b|\bcervical\b/i,
  back: /\bback\b|\bspine\b|\blower back\b/i,
  rib: /\bribs?\b|\bintercostals?\b/i,
  hip: /\bhips?\b/i,
  // Its own rule now. The hip rule used to answer for the groin, which
  // reported a hip injury on a sentence about adductors and no groin injury
  // on one about hips.
  groin: /\bgroin\b|\badductors?\b/i,
  hamstring: /\bhamstrings?\b/i,
  knee: /\bknees?\b|\bmeniscus\b/i,
  ankle: /\bankles?\b/i,
  achilles: /\bachilles\b|\bheel\b/i,
  foot: /\bfeet\b|\bfoot\b|\btoes?\b/i,
};
