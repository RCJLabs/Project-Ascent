/**
 * Warmup generator (PLAN.md §5.1).
 *
 * A four-stage funnel: filter by equipment, filter out anything that loads
 * an injury, prefer what you have not done recently, then fill to length.
 *
 * The injury stage is the point of the whole thing. It also has to fail
 * safely: if excluding injured tissue empties the pool, the generator says
 * so and hands back the unfiltered set rather than returning nothing —
 * an empty warmup is more dangerous than a caveated one.
 */

import {
  WARMUP_EXERCISES,
  type BodyPart,
  type WarmupCategory,
  type WarmupExercise,
} from '@/content/warmups';
import type { Equipment, SessionType } from '@/content/types';

export interface WarmupRequest {
  equipment: Equipment[];
  /** Body parts currently injured. */
  injuries?: BodyPart[];
  /** Ids used in recent warmups, freshest first — kept varied, not banned. */
  recent?: string[];
  /** Focus area, usually derived from the session type. */
  focus?: WarmupCategory;
  /** Whether the session happens on a wall. */
  climbing?: boolean;
  /** Minimum total warmup length. */
  targetSeconds?: number;
  /** Deterministic ordering for tests. */
  seed?: number;
  /** Override the exercise library. Only used to test the fallback path. */
  library?: WarmupExercise[];
}

export interface WarmupPlan {
  exercises: WarmupExercise[];
  totalSeconds: number;
  /** Exercises left out because they load an injury, with the part named. */
  excluded: { exercise: WarmupExercise; part: BodyPart }[];
  /** Set when the injury filter had to be relaxed to produce anything. */
  injuryFilterRelaxed: boolean;
}

export const DEFAULT_TARGET_SECONDS = 420;

/** Deterministic shuffle, so a given seed always produces the same warmup. */
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

function hasEquipment(exercise: WarmupExercise, available: Set<Equipment>): boolean {
  return exercise.equipment.every((e) => e === 'none' || available.has(e));
}

function injuredBy(exercise: WarmupExercise, injuries: BodyPart[]): BodyPart | null {
  return injuries.find((part) => exercise.loads.includes(part)) ?? null;
}

/**
 * Which warmup focus a session type calls for.
 *
 * Phase names are checked first because they carry the most specific
 * signal — Iron Grip's "The Hammer (Max Hangs)" means fingers regardless of
 * what the session id says. Then the session id, then a keyword scan so
 * custom session types still resolve to something sensible.
 */
export function focusFor(sessionType?: SessionType, phaseName?: string): WarmupCategory | undefined {
  const phase = (phaseName ?? '').toLowerCase();
  if (/hang|crimp|finger|campus|repeater/.test(phase)) return 'fingers';
  if (/dyno|power|explosive/.test(phase)) return 'shoulder';

  const byId: Record<string, WarmupCategory> = {
    fp: 'fingers',
    hb: 'fingers',
    sa: 'fingers',
    sb: 'core',
    str: 'shoulder',
    mob: 'hips',
    eng: 'shoulder',
    end: 'pulse',
    pe: 'pulse',
  };
  if (sessionType && byId[sessionType.id]) return byId[sessionType.id];

  const text = `${sessionType?.name ?? ''} ${sessionType?.description ?? ''}`.toLowerCase();
  if (/finger|hang|crimp|campus/.test(text)) return 'fingers';
  if (/mobility|hip|flexib/.test(text)) return 'hips';
  if (/core|tension/.test(text)) return 'core';
  if (/endurance|arc|circuit/.test(text)) return 'pulse';
  if (/strength|push|pull|shoulder/.test(text)) return 'shoulder';
  return undefined;
}

export function generateWarmup(request: WarmupRequest): WarmupPlan {
  const target = request.targetSeconds ?? DEFAULT_TARGET_SECONDS;
  const injuries = request.injuries ?? [];
  const recent = new Set(request.recent ?? []);
  const available = new Set(request.equipment);
  const seed = request.seed ?? Math.floor(Math.random() * 1_000_000);

  // 1. Equipment.
  const equipped = (request.library ?? WARMUP_EXERCISES).filter((e) => hasEquipment(e, available));

  // 2. Injuries.
  const excluded: { exercise: WarmupExercise; part: BodyPart }[] = [];
  let safe = equipped.filter((e) => {
    const part = injuredBy(e, injuries);
    if (part) {
      excluded.push({ exercise: e, part });
      return false;
    }
    return true;
  });

  // Fail safe: never hand back nothing because everything was excluded.
  // Unreachable with the shipped library, which always contains warmups that
  // load no tissue at all — but a future edit could remove those, and an
  // empty warmup is more dangerous than a caveated one.
  let injuryFilterRelaxed = false;
  const offWallSafe = safe.filter((e) => e.category !== 'climbing');
  if (offWallSafe.length === 0) {
    safe = equipped;
    injuryFilterRelaxed = true;
  }

  // 3. Novelty — fresh before stale, shuffled within each group.
  const rank = (e: WarmupExercise) => (recent.has(e.id) ? 1 : 0);
  const pool = shuffle(safe, seed).sort((a, b) => rank(a) - rank(b));

  // 4. Fill to length: always a pulse raiser, then the focus area, then the
  // rest, and finally one climbing item when there is a wall involved.
  const chosen: WarmupExercise[] = [];
  const take = (e: WarmupExercise) => {
    if (!chosen.includes(e)) chosen.push(e);
  };

  const offWall = pool.filter((e) => e.category !== 'climbing');
  const onWall = pool.filter((e) => e.category === 'climbing');

  const pulse = offWall.find((e) => e.category === 'pulse');
  if (pulse) take(pulse);

  if (request.focus) {
    for (const e of offWall.filter((x) => x.category === request.focus)) {
      if (chosen.reduce((s, c) => s + c.seconds, 0) >= target) break;
      take(e);
    }
  }

  for (const e of offWall) {
    if (chosen.reduce((s, c) => s + c.seconds, 0) >= target) break;
    take(e);
  }

  if (request.climbing && onWall[0]) take(onWall[0]);

  return {
    exercises: chosen,
    totalSeconds: chosen.reduce((s, c) => s + c.seconds, 0),
    excluded,
    injuryFilterRelaxed,
  };
}
