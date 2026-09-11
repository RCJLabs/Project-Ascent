import { adaptProgram } from '@/engine/adapt';
import type { Program, ProgramId, ProgramStage } from '../types';

/**
 * The full catalog the port is working toward (PLAN.md §4.1). Ids are
 * declared up front so a ported program's `nextPrograms` graph validates
 * against real destinations while the rest are still being converted.
 */
export const PLANNED_PROGRAM_IDS: readonly ProgramId[] = [
  'ground_zero',
  'base_camp',
  // The two M58 drafted and M95 shipped, once the coach had read them.
  'two_day_week',
  'gravity_defied',
  'lockdown',
  'iron_grip',
  'peak_performance',
  'the_long_game',
  'the_siege',
  'trip_prep',
  'the_cruiser',
  'general_training',
  'outdoor_climbing',
];

/**
 * The shipped programs, in catalog order.
 *
 * **Empty until `loadPrograms` has run** (PLAN.md M78). The bodies used to
 * be imported here statically, which put all eleven — a sixth of the entry
 * chunk — in front of the first paint of a screen that needed none of them.
 * They live in `./catalogue` now and arrive through one `import()`.
 *
 * The array is filled in place rather than replaced, so the twenty-odd
 * callers that hold a reference to it see the programs the moment they
 * land. Nothing reads it before the router mounts, because the router waits
 * for `loadPrograms` — see App.tsx — and every test file gets it filled by
 * `src/test/setup.ts` before its own module scope runs.
 */
export const PROGRAMS: Program[] = [];

const BY_ID = new Map<ProgramId, Program>();

let loading: Promise<void> | null = null;

/**
 * Fetch the bodies and register them. Idempotent: the second caller gets the
 * first caller's promise, so App and `hydrateAll` can both ask without
 * loading twice or racing the array.
 */
export function loadPrograms(): Promise<void> {
  loading ??= import('./catalogue').then(({ CATALOGUE }) => {
    PROGRAMS.splice(0, PROGRAMS.length, ...CATALOGUE);
    BY_ID.clear();
    for (const program of CATALOGUE) BY_ID.set(program.id, program);
  });
  return loading;
}

/** True once the shipped programs are in the registry. */
export function programsLoaded(): boolean {
  return BY_ID.size > 0;
}

/**
 * Programs the climber wrote, kept in the same lookup as the shipped ones.
 *
 * A custom program has to behave like any other everywhere — the logger, the
 * calendar, the review, the scheduler, the journal all call getProgram and
 * none of them should know or care where it came from. A registry populated
 * at hydration keeps those thirteen call sites untouched, including the one
 * inside a pure engine, which could not read a React store anyway.
 *
 * The store that owns these also holds them as state, so components
 * re-render; this map is the lookup, not the source of truth.
 */
const CUSTOM = new Map<ProgramId, Program>();

export function registerCustomPrograms(programs: readonly Program[]): void {
  CUSTOM.clear();
  for (const program of programs) CUSTOM.set(program.id, program);
}

/**
 * Lengths a climber is running a program over, when it is not the written
 * one (PLAN.md M56).
 *
 * Applied here rather than at the fourteen places that call `getProgram`,
 * for the same reason custom programs are registered here: an adaptation
 * that reaches thirteen screens and misses the fourteenth is worse than no
 * adaptation at all. Memoised because `getProgram` is called inside render.
 */
const ADAPTED = new Map<ProgramId, number>();
const ADAPTED_CACHE = new Map<string, Program>();

export function registerAdaptations(weeksById: Record<string, number>): void {
  ADAPTED.clear();
  ADAPTED_CACHE.clear();
  for (const [id, weeks] of Object.entries(weeksById)) {
    if (Number.isFinite(weeks) && weeks > 0) ADAPTED.set(id as ProgramId, Math.round(weeks));
  }
}

/** Custom first: a fork keeps its own id, but this is the safe precedence. */
export function getProgram(id: ProgramId): Program | undefined {
  const base = CUSTOM.get(id) ?? BY_ID.get(id);
  if (!base) return undefined;
  const weeks = ADAPTED.get(id);
  if (weeks === undefined || weeks === base.weeks) return base;
  const key = `${id}:${weeks}:${base.weeks}`;
  const cached = ADAPTED_CACHE.get(key);
  if (cached) return cached;
  const adapted = adaptProgram(base, weeks);
  ADAPTED_CACHE.set(key, adapted);
  return adapted;
}

/**
 * The program as written, whatever length it is being run over.
 *
 * The screen that *chooses* a length has to start from the written one, or
 * choosing six weeks and then twelve compresses a six-week program into
 * twelve and there is no way back to the block the author wrote.
 */
export function writtenProgram(id: ProgramId): Program | undefined {
  return CUSTOM.get(id) ?? BY_ID.get(id);
}

export function isCustomProgram(id: ProgramId): boolean {
  return CUSTOM.has(id);
}

/** Everything runnable, shipped and written alike — at the length it is
 *  actually being run, so a list cannot disagree with the program it opens. */
export function allPrograms(): Program[] {
  return [...PROGRAMS, ...CUSTOM.values()].map((p) => getProgram(p.id) ?? p);
}

export const STAGE_META: Record<ProgramStage, { label: string; blurb: string }> = {
  start: { label: 'Start Here', blurb: 'Build a body that can handle climbing.' },
  foundations: { label: 'Foundations', blurb: 'Learn to move well and climb consistently.' },
  style: { label: 'Pick Your Style', blurb: 'Target the thing holding you back.' },
  advanced: { label: 'Advanced', blurb: 'Peak for hard sends.' },
  ongoing: { label: 'Ongoing', blurb: 'Maintain, or just log what you climb.' },
};

export const STAGE_ORDER: ProgramStage[] = ['start', 'foundations', 'style', 'advanced', 'ongoing'];
