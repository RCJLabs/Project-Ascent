/**
 * Cooldown generator (PLAN.md M112).
 *
 * The warmup's counterpart at the other end of the session, and deliberately
 * a smaller machine than the warmup is.
 *
 * `warmup.ts` is a four-stage funnel — equipment, injury, recency, fill. This
 * has **three**, and the differences are the milestone:
 *
 * - **No equipment stage.** Every cooldown is floor work, a wall or a door
 *   frame. A filter over a library where every row says the same thing is a
 *   stage no test could ever kill.
 * - **Weighted by what *this session* loaded**, which the warmup has no
 *   equivalent of and could not have: a warmup runs before there is anything
 *   to read. `sessionParts` is the measure, extracted from `tissueLoad` so
 *   the chart and the cooldown cannot disagree about what a session worked.
 * - **No recency stage.** A cooldown that settles into a routine is a
 *   cooldown, not a failure of variety, and the guide asks for "light
 *   stretches" rather than novel ones. The seed re-rolls ties instead, so a
 *   climber who wants a different set gets one without the engine pretending
 *   repetition is a problem.
 *
 * The injury rule is `warmup.ts`'s, unchanged: leave out anything that works
 * an injured part, and if that empties the pool, say so and hand back the
 * unfiltered set rather than nothing. It is never the other way round — this
 * does not prescribe anything *for* an injury, because `returnToClimbing.ts`
 * sets the rule that nothing in this app does.
 */

import { COOLDOWN_EXERCISES, type CooldownExercise } from '@/content/cooldowns';
import type { BodyPart } from '@/content/warmups';

export interface CooldownRequest {
  /** What the session just loaded — from `sessionParts`. Weighted toward. */
  loaded?: BodyPart[];
  /** Body parts currently injured. Worked parts are left out entirely. */
  injuries?: BodyPart[];
  /** Minimum total length. The guide asks for three to five minutes. */
  targetSeconds?: number;
  /** Re-rolls the order within a rank. Same seed, same cooldown. */
  seed?: number;
  /** Override the library. Only used to test the fallback path. */
  library?: CooldownExercise[];
}

export interface CooldownPlan {
  exercises: CooldownExercise[];
  totalSeconds: number;
  /** Left out because they work an injured part, with the part named. */
  excluded: { exercise: CooldownExercise; part: BodyPart }[];
  /** Parts the session loaded that this cooldown actually reaches. */
  covered: BodyPart[];
  /** Set when the injury filter had to be relaxed to produce anything. */
  injuryFilterRelaxed: boolean;
}

/**
 * Three minutes, the bottom of the guide's range.
 *
 * The bottom rather than the middle because a cooldown that overshoots is one
 * a tired climber abandons, and the fill stage only ever runs over.
 */
export const DEFAULT_COOLDOWN_SECONDS = 180;

/** Deterministic shuffle, so a given seed always produces the same order. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function worksInjured(exercise: CooldownExercise, injuries: readonly BodyPart[]): BodyPart | null {
  return injuries.find((part) => exercise.targets.includes(part)) ?? null;
}

/** How much of what the session loaded this one reaches. */
function relevance(exercise: CooldownExercise, loaded: readonly BodyPart[]): number {
  return exercise.targets.filter((part) => loaded.includes(part)).length;
}

export function generateCooldown(request: CooldownRequest = {}): CooldownPlan {
  const library = request.library ?? COOLDOWN_EXERCISES;
  const loaded = request.loaded ?? [];
  const injuries = request.injuries ?? [];
  const target = request.targetSeconds ?? DEFAULT_COOLDOWN_SECONDS;

  const excluded: CooldownPlan['excluded'] = [];
  const safe: CooldownExercise[] = [];
  for (const exercise of library) {
    const part = worksInjured(exercise, injuries);
    if (part === null) safe.push(exercise);
    else excluded.push({ exercise, part });
  }

  // Everything available works something that is hurt. An empty cooldown
  // tells the climber nothing; a caveated one tells them to go gently.
  const injuryFilterRelaxed = safe.length === 0 && library.length > 0;
  const pool = injuryFilterRelaxed ? [...library] : safe;

  // Shuffle first, then sort by relevance: a stable sort keeps the shuffled
  // order inside each rank, so the seed re-rolls ties and nothing else.
  const ranked = shuffle(pool, request.seed ?? 1).sort(
    (a, b) => relevance(b, loaded) - relevance(a, loaded),
  );

  const exercises: CooldownExercise[] = [];
  let totalSeconds = 0;
  for (const exercise of ranked) {
    if (totalSeconds >= target) break;
    exercises.push(exercise);
    totalSeconds += exercise.seconds;
  }

  const covered = loaded.filter((part) => exercises.some((e) => e.targets.includes(part)));

  return {
    exercises,
    totalSeconds,
    excluded,
    covered,
    injuryFilterRelaxed,
  };
}

/**
 * What the cooldown is for, in one line, or null when there is nothing to say.
 *
 * Null rather than a generic sentence: "a cooldown for your session" is a
 * caption, not information, and a card that always says something teaches
 * the climber to stop reading it.
 */
export function describeCooldown(plan: CooldownPlan): string | null {
  // No separate guard for an empty cooldown: it covers nothing by
  // construction, so this is already the line that catches it.
  if (plan.covered.length === 0) return null;
  const parts = [...plan.covered];
  const last = parts.pop() as BodyPart;
  const list = parts.length > 0 ? `${parts.join(', ')} and ${last}` : last;
  return `Weighted toward your ${list} — what this session actually worked.`;
}
