/**
 * Writing your own program (PLAN.md §4.2, M7).
 *
 * A custom program is a `Program` like any other — same type, same lookup,
 * same everything downstream. That is the whole design: the moment a written
 * program is a second-class shape, every consumer needs a branch, and the
 * branches are where the prototype rotted (AUDIT.md §8).
 *
 * What this module owns is the part content authoring gets for free by being
 * written by hand: **validity**. A shipped program is correct because a human
 * checked it. A written one is edited a field at a time, so it spends most of
 * its life incomplete, and the app has to be able to say precisely what is
 * still wrong without refusing to hold the half-finished thing.
 */

import { PLANNED_PROGRAM_IDS } from '@/content/programs';
import type {
  Constraint,
  DayOfWeek,
  Equipment,
  Phase,
  Program,
  ProgramId,
  SessionType,
} from '@/content/types';

export const CUSTOM_PREFIX = 'custom_';
/**
 * What a program's length is allowed to be, said in the error when it is not.
 *
 * A year at the top because nothing anyone plans for is longer, and a plan
 * that long is already a sequence of blocks rather than one program. One at
 * the bottom because a single week is still a week of training; zero is not
 * a program, it is an empty object with a name.
 */
export const MAX_WEEKS = 52;
export const MIN_WEEKS = 1;

export function isCustomId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

export function newProgramId(): ProgramId {
  // The timestamp keeps ids roughly sortable and readable in a database
  // inspector; the random half is what makes them unique. It used to be four
  // base-36 characters — 36^4, which over two hundred ids made in the same
  // millisecond collides about 1.2% of the time, and the test that draws two
  // hundred failed about that often (PLAN.md M44). `randomUUID` is available
  // everywhere this app runs, and the id is opaque, so there is nothing to
  // trade off.
  return `${CUSTOM_PREFIX}${Date.now().toString(36)}-${crypto.randomUUID()}` as ProgramId;
}

/** A skeleton that is coherent from the first render: one phase, one week. */
export function blankProgram(name = 'My program'): Program {
  return {
    id: newProgramId(),
    name,
    subtitle: '',
    kind: 'program',
    stage: 'style',
    discipline: 'both',
    gradeRange: { scale: 'V', min: 'V0', max: 'V17', label: 'Any grade' },
    weeks: 8,
    equipment: ['wall'],
    intro: { pitch: '', rhythm: [], graduation: '' },
    phases: [{ id: 'phase1', name: 'Block 1', weekStart: 1, weekEnd: 8, description: '', goals: [] }],
    sessionTypes: [],
    constraints: [],
    assessments: [],
    nextPrograms: [],
  };
}

/** A copy of an existing program, renamed and re-identified. */
export function forkProgram(source: Program, name?: string): Program {
  return {
    ...structuredClone(source),
    id: newProgramId(),
    name: name ?? `${source.name} (mine)`,
    // A fork is not the thing it came from: its graduation graph and its
    // prerequisites belonged to the original's place in the catalog.
    nextPrograms: [],
    ...(source.prerequisites ? { prerequisites: undefined } : {}),
  };
}

/**
 * Three, not two (PLAN.md M167).
 *
 * `error` stops a program running and `warning` is a nit a coach would
 * raise. A safety note is neither: it never blocks — a coach writing a
 * deliberately brutal block for themselves is allowed to — but showing
 * *"nothing prescribed for Anvil"* and *"no rest day in the week"* with the
 * same grey icon is how the second one stops being read.
 */
export type IssueLevel = 'error' | 'safety' | 'warning';

/** Worst first. Errors block, safety is about the climber, warnings are tidying. */
export const ISSUE_RANK: Record<IssueLevel, number> = { error: 0, safety: 1, warning: 2 };

export interface Issue {
  level: IssueLevel;
  /** Which part of the builder to send the climber to. */
  field: 'identity' | 'weeks' | 'phases' | 'sessions' | 'layout' | 'constraints' | 'tracks' | 'next';
  message: string;
}

/**
 * Everything wrong with a program, worst first.
 *
 * Errors stop it being run; warnings are things a coach would raise but that
 * do not make the program incoherent. The distinction matters because a
 * builder that refuses to save until perfect is a builder nobody finishes.
 */
export function validateProgram(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, field: Issue['field'], message: string) =>
    issues.push({ level, field, message });

  if (program.name.trim() === '') add('error', 'identity', 'The program needs a name.');
  if (program.weeks < MIN_WEEKS || program.weeks > MAX_WEEKS) {
    add('error', 'weeks', `Length must be between ${MIN_WEEKS} and ${MAX_WEEKS} weeks.`);
  }
  if (program.equipment.length === 0) {
    add('error', 'identity', 'Pick at least one thing this program trains on, or the finder cannot place it.');
  }

  issues.push(...phaseIssues(program));
  issues.push(...sessionIssues(program));
  issues.push(...layoutIssues(program));
  issues.push(...constraintIssues(program));
  issues.push(...trackIssues(program));
  issues.push(...nextIssues(program));

  if (program.subtitle.trim() === '') add('warning', 'identity', 'No subtitle — the catalog card will look bare.');
  if (program.intro.pitch.trim() === '') {
    add('warning', 'identity', 'No description. Future you will want to know what this was for.');
  }

  return issues.sort((a, b) => (a.level === b.level ? 0 : a.level === 'error' ? -1 : 1));
}

/** Phases must tile 1..weeks exactly: no gap, no overlap, nothing outside. */
function phaseIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, message: string) => issues.push({ level, field: 'phases', message });

  if (program.phases.length === 0) {
    add('error', 'A program needs at least one phase.');
    return issues;
  }
  const ids = new Set<string>();
  for (const phase of program.phases) {
    if (ids.has(phase.id)) add('error', `Two phases share the id "${phase.id}".`);
    ids.add(phase.id);
    if (phase.name.trim() === '') add('warning', 'A phase has no name.');
    if (phase.weekEnd < phase.weekStart) {
      add('error', `${phase.name || phase.id} ends before it starts.`);
    }
  }

  const sorted = [...program.phases].sort((a, b) => a.weekStart - b.weekStart);
  let expected = 1;
  for (const phase of sorted) {
    if (phase.weekStart > expected) {
      add('error', `Nothing covers week ${expected}${phase.weekStart - 1 > expected ? `–${phase.weekStart - 1}` : ''}.`);
    } else if (phase.weekStart < expected) {
      add('error', `${phase.name || phase.id} overlaps the phase before it at week ${phase.weekStart}.`);
    }
    expected = Math.max(expected, phase.weekEnd + 1);
  }
  if (expected <= program.weeks) {
    add('error', `Nothing covers week ${expected}${program.weeks > expected ? `–${program.weeks}` : ''}.`);
  }
  if (expected > program.weeks + 1) {
    add('error', `A phase runs past week ${program.weeks}, which is where the program ends.`);
  }

  for (const week of program.deloadWeeks ?? []) {
    if (week < 1 || week > program.weeks) add('error', `Deload week ${week} is outside the program.`);
  }
  return issues;
}

function sessionIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const add = (level: IssueLevel, message: string) => issues.push({ level, field: 'sessions', message });

  if (program.sessionTypes.length === 0) {
    add('error', 'A program needs at least one session type — something to actually do.');
    return issues;
  }
  const ids = new Set<string>();
  for (const type of program.sessionTypes) {
    if (ids.has(type.id)) add('error', `Two session types share the id "${type.id}".`);
    ids.add(type.id);
    if (type.name.trim() === '') add('error', 'A session type has no name.');
    // A warning and not an error: the program runs perfectly well without
    // it, and what it costs is precise — the planner's hard-day rule cannot
    // see this session, so it will happily put it the day after a limit day.
    if (!type.isRest && type.intensity === undefined) {
      add('warning', `${type.name || type.id} does not say how hard it is, so the planner cannot space it.`);
    }
  }
  if (program.sessionTypes.every((t) => t.isRest)) {
    add('error', 'Every session type is a rest day. Add something to train.');
  }
  return issues;
}

function layoutIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const layout = program.recommendedLayout;
  if (!layout) {
    return [{ level: 'warning', field: 'layout', message: 'No recommended week, so the planner starts blank.' }];
  }
  const known = new Set(program.sessionTypes.map((t) => t.id));
  const days = Object.entries(layout.slots) as [string, string][];
  for (const [day, typeId] of days) {
    if (!known.has(typeId)) {
      issues.push({
        level: 'error',
        field: 'layout',
        message: `The recommended week puts "${typeId}" on day ${day}, but no such session type exists.`,
      });
    }
  }
  if (days.length === 0) {
    issues.push({ level: 'warning', field: 'layout', message: 'The recommended week is empty.' });
  }
  return issues;
}

function constraintIssues(program: Program): Issue[] {
  const known = new Set(program.sessionTypes.map((t) => t.id));
  const issues: Issue[] = [];
  const missing = (id: string, where: string) => {
    if (!known.has(id)) {
      issues.push({
        level: 'error',
        field: 'constraints',
        message: `A ${where} rule names "${id}", which is not a session type here.`,
      });
    }
  };
  for (const c of program.constraints) {
    switch (c.kind) {
      case 'sessions-per-week':
        if (c.min > c.max) {
          issues.push({ level: 'error', field: 'constraints', message: 'Sessions per week: the minimum is above the maximum.' });
        }
        break;
      case 'min-gap-hours':
        for (const id of c.between) missing(id, 'minimum gap');
        if (c.between.length === 0) {
          issues.push({ level: 'warning', field: 'constraints', message: 'A gap rule names no session types, so it can never fire.' });
        }
        break;
      case 'max-per-week':
        missing(c.sessionTypeId, 'maximum per week');
        break;
      case 'order-in-week':
        missing(c.first, 'ordering');
        missing(c.then, 'ordering');
        break;
      case 'not-day-before':
        missing(c.sessionTypeId, 'spacing');
        missing(c.before, 'spacing');
        break;
    }
  }
  return issues;
}

/**
 * Two ways through one program (PLAN.md M136). A second track with the
 * same id would be one track twice, which the exercises could not tell
 * apart, so that is the one error; a nameless one is a chip with nothing
 * on it.
 */
function trackIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const track of program.tracks ?? []) {
    if (ids.has(track.id)) {
      issues.push({ level: 'error', field: 'tracks', message: `Two tracks share the id "${track.id}".` });
    }
    ids.add(track.id);
    if (track.name.trim() === '') issues.push({ level: 'warning', field: 'tracks', message: 'A track has no name.' });
  }
  return issues;
}

/**
 * What comes after (PLAN.md M136). Only the catalogue can be named: a
 * shipped id is the same on every install, and a successor the block-end
 * page cannot find is dropped there without a word, which is why it is
 * said here.
 */
function nextIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  for (const next of program.nextPrograms) {
    if (!PLANNED_PROGRAM_IDS.includes(next.id)) {
      issues.push({ level: 'warning', field: 'next', message: `"${next.id}" is named as what comes after, and is not a program in the catalogue.` });
    }
    if (next.reason.trim() === '') {
      issues.push({ level: 'warning', field: 'next', message: `What comes after gives no reason for "${next.id}".` });
    }
  }
  return issues;
}

/** A program with no errors can be started. Warnings are advice. */
export function canRun(program: Program): boolean {
  return !validateProgram(program).some((i) => i.level === 'error');
}

// ── Editing helpers ───────────────────────────────────────────────────────

/**
 * Re-tile phases across a new program length, keeping their proportions.
 *
 * Changing the length of a program is the one edit that can invalidate every
 * phase at once, so it repairs them rather than reporting them broken.
 */
export function retile(phases: Phase[], weeks: number): Phase[] {
  if (phases.length === 0) return phases;
  const n = Math.min(phases.length, weeks);
  const kept = phases.slice(0, n);
  const per = Math.floor(weeks / n);
  let start = 1;
  return kept.map((phase, i) => {
    const end = i === n - 1 ? weeks : start + per - 1;
    const next = { ...phase, weekStart: start, weekEnd: end };
    start = end + 1;
    return next;
  });
}

/** A phase id that will not collide with the ones already there. */
export function nextPhaseId(phases: readonly Phase[]): string {
  let n = phases.length + 1;
  const taken = new Set(phases.map((p) => p.id));
  while (taken.has(`phase${n}`)) n++;
  return `phase${n}`;
}

/** A session-type id derived from its name, unique within the program. */
export function sessionTypeId(name: string, existing: readonly SessionType[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'session';
  const taken = new Set(existing.map((t) => t.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** Drop everything that referred to a session type being removed. */
export function removeSessionType(program: Program, typeId: string): Program {
  const slots = { ...(program.recommendedLayout?.slots ?? {}) };
  for (const [day, id] of Object.entries(slots)) {
    if (id === typeId) delete slots[Number(day) as DayOfWeek];
  }
  return {
    ...program,
    sessionTypes: program.sessionTypes.filter((t) => t.id !== typeId),
    constraints: program.constraints.filter((c) => !mentions(c, typeId)),
    ...(program.recommendedLayout
      ? { recommendedLayout: { ...program.recommendedLayout, slots } }
      : {}),
  };
}

/** Drop a track, and take every exercise that was on it off it. */
export function removeTrack(program: Program, trackId: string): Program {
  const tracks = (program.tracks ?? []).filter((t) => t.id !== trackId);
  return {
    ...program,
    ...(tracks.length > 0 ? { tracks } : { tracks: undefined }),
    sessionTypes: program.sessionTypes.map((type) =>
      type.blocks
        ? {
            ...type,
            blocks: type.blocks.map((block) => ({
              ...block,
              perPhase: Object.fromEntries(
                Object.entries(block.perPhase).map(([phaseId, p]) => [
                  phaseId,
                  {
                    ...p,
                    exercises: p.exercises.map((e) => {
                      if (e.track !== trackId) return e;
                      const { track: _off, ...rest } = e;
                      return rest;
                    }),
                  },
                ]),
              ),
            })),
          }
        : type,
    ),
  };
}

/** A track id from its name, unique within the program. */
export function trackIdFor(name: string, existing: readonly { id: string }[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'track';
  const taken = new Set(existing.map((t) => t.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

function mentions(c: Constraint, typeId: string): boolean {
  switch (c.kind) {
    case 'min-gap-hours':
      return c.between.includes(typeId);
    case 'max-per-week':
      return c.sessionTypeId === typeId;
    case 'order-in-week':
      return c.first === typeId || c.then === typeId;
    case 'not-day-before':
      return c.sessionTypeId === typeId || c.before === typeId;
    case 'sessions-per-week':
    case 'no-back-to-back':
      return false;
  }
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'Nothing at all',
  wall: 'Climbing wall',
  hangboard: 'Hangboard',
  campus: 'Campus board',
  gym: 'Weights & bands',
  weight: 'Something to add weight with',
};
