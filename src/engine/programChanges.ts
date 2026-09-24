/**
 * What a copy of a program changed from the one it was copied from
 * (PLAN.md M333).
 *
 * A coach answers an athlete's block by copying what they ran and changing
 * what the numbers say to change — and the athlete then received a whole
 * program with nothing saying which parts were the coach's. The changes
 * *are* the reply. So this reads the two programs side by side and says
 * what moved, in the words a coach would use: *"Repeaters: sets 6 → 4"*,
 * *"Thursday: Finger Protocol → rest"*, *"12 weeks → 10"*.
 *
 * ## What it compares, and what it does not
 *
 * The training: length, deloads, the week's layout, phases, the sessions
 * and what is in them down to each exercise's dose, the benchmarks, the
 * rules, tracks, kit and grades — and whether the program's own words were
 * rewritten, because that is where a coach leaves a note.
 *
 * Not the name, which a copy always changes (*"Iron Grip (revised)"*), and
 * not every sentence of prose: an exercise's coaching notes and a phase's
 * rationale are the program's explanation of itself, and a list that
 * reported each reworded line would bury the one set that changed. Things
 * are matched by id where they have one and by name where they do not, so
 * a renamed exercise reads as one gone and one new — which is what it is to
 * the climber doing it.
 */

import { getMetric } from '@/content/metrics';
import type {
  Constraint,
  Exercise,
  ExerciseBlock,
  Phase,
  PhasePrescription,
  Program,
  SessionType,
} from '@/content/types';
import { EQUIPMENT_LABELS } from './customProgram';
import { DOSE_FIELDS } from './prescription';
import { DAY_NAMES } from './scheduler';

export interface ChangeGroup {
  /** Where in the program: "Length", "The week", or a session's name. */
  title: string;
  lines: string[];
}

const list = (items: readonly (string | number)[]): string => (items.length > 0 ? items.join(', ') : 'none');

const weekRange = (phase: Phase): string =>
  phase.weekStart === phase.weekEnd ? `week ${phase.weekStart}` : `weeks ${phase.weekStart}–${phase.weekEnd}`;

/** Added and removed, by a key, keeping each side's order. */
function added<T>(from: readonly T[], to: readonly T[], key: (item: T) => string): T[] {
  const had = new Set(from.map(key));
  return to.filter((item) => !had.has(key(item)));
}

function lengthChanges(from: Program, to: Program): string[] {
  const lines: string[] = [];
  if (from.weeks !== to.weeks) lines.push(`${from.weeks} weeks → ${to.weeks}`);
  const a = from.deloadWeeks ?? [];
  const b = to.deloadWeeks ?? [];
  if (a.join() !== b.join()) lines.push(`Deload weeks: ${list(a)} → ${list(b)}`);
  return lines;
}

function weekChanges(from: Program, to: Program): string[] {
  const name = (program: Program, id: string | undefined): string =>
    id === undefined ? 'rest' : (program.sessionTypes.find((t) => t.id === id)?.name ?? id);
  const a = from.recommendedLayout?.slots ?? {};
  const b = to.recommendedLayout?.slots ?? {};
  const lines: string[] = [];
  // Monday first, as a climber reads a week.
  for (const day of [1, 2, 3, 4, 5, 6, 0] as const) {
    const before = name(from, a[day]);
    const after = name(to, b[day]);
    if (before !== after) lines.push(`${DAY_NAMES[day]}: ${before} → ${after}`);
  }
  return lines;
}

function phaseChanges(from: Program, to: Program): string[] {
  const lines: string[] = [];
  for (const gone of added(to.phases, from.phases, (p) => p.id)) lines.push(`Dropped ${gone.name}`);
  for (const phase of to.phases) {
    const before = from.phases.find((p) => p.id === phase.id);
    if (!before) {
      lines.push(`New phase: ${phase.name}, ${weekRange(phase)}`);
      continue;
    }
    if (before.name !== phase.name) lines.push(`${before.name} is now called ${phase.name}`);
    if (weekRange(before) !== weekRange(phase)) {
      lines.push(`${phase.name}: ${weekRange(before)} → ${weekRange(phase)}`);
    }
    if (before.goals.join('\n') !== phase.goals.join('\n')) lines.push(`${phase.name}: its goals were rewritten`);
  }
  return lines;
}

/** `sets 6 → 4, load +10 lbs → +15 lbs`, or nothing when the dose is the same. */
function doseChange(a: Exercise, b: Exercise): string {
  return DOSE_FIELDS.filter((field) => (a[field] ?? '') !== (b[field] ?? ''))
    .map((field) => `${field} ${a[field] || 'none'} → ${b[field] || 'none'}`)
    .join(', ');
}

/** One block in one phase: exercises gone, new and re-dosed. */
function prescriptionChanges(a: PhasePrescription | undefined, b: PhasePrescription | undefined): string[] {
  const before = a?.exercises ?? [];
  const after = b?.exercises ?? [];
  const lines: string[] = [];
  for (const gone of added(after, before, (e) => e.name)) lines.push(`Dropped ${gone.name}`);
  for (const exercise of after) {
    const was = before.find((e) => e.name === exercise.name);
    if (!was) {
      const dose = DOSE_FIELDS.map((f) => exercise[f]).filter(Boolean).join(' · ');
      lines.push(`Added ${exercise.name}${dose ? ` (${dose})` : ''}`);
      continue;
    }
    const dose = doseChange(was, exercise);
    if (dose) lines.push(`${exercise.name}: ${dose}`);
  }
  if (JSON.stringify(a?.perWeek ?? []) !== JSON.stringify(b?.perWeek ?? [])) {
    lines.push('Its week-by-week steps changed');
  }
  return lines;
}

/**
 * A block's changes across the phases, said once where they are the same in
 * every phase — a coach who takes a set off the repeaters takes it off in
 * all of them, and three identical lines would read as three changes.
 */
function blockChanges(to: Program, a: ExerciseBlock, b: ExerciseBlock): string[] {
  const phases = to.phases.filter((p) => a.perPhase[p.id] || b.perPhase[p.id]);
  const where = new Map<string, string[]>();
  for (const phase of phases) {
    const lines = prescriptionChanges(a.perPhase[phase.id], b.perPhase[phase.id]);
    for (const line of lines) where.set(line, [...(where.get(line) ?? []), phase.name]);
  }
  const lines: string[] = [];
  if (a.constantDose !== b.constantDose && (a.constantDose || b.constantDose)) {
    lines.push(`${b.name}: ${a.constantDose || 'no fixed dose'} → ${b.constantDose || 'no fixed dose'}`);
  }
  // What changed first, then where: *"Weighted Pull-Ups: sets 3 → 2 — Pull,
  // The Anvil"*. Phase names carry their own brackets, so a bracketed suffix
  // nested them.
  for (const [line, inPhases] of where) {
    const everywhere = inPhases.length === phases.length || phases.length <= 1;
    lines.push(`${line} — ${[b.name, ...(everywhere ? [] : inPhases)].join(', ')}`);
  }
  return lines;
}

function sessionChanges(to: Program, a: SessionType, b: SessionType): string[] {
  const lines: string[] = [];
  if (a.name !== b.name) lines.push(`Was called ${a.name}`);
  if ((a.duration ?? '') !== (b.duration ?? '')) lines.push(`Length: ${a.duration || 'not set'} → ${b.duration || 'not set'}`);
  if (Boolean(a.isRest) !== Boolean(b.isRest)) lines.push(b.isRest ? 'Now a rest day' : 'No longer a rest day');
  const blocksA = a.blocks ?? [];
  const blocksB = b.blocks ?? [];
  for (const gone of added(blocksB, blocksA, (x) => x.id)) lines.push(`Dropped ${gone.name}`);
  for (const block of blocksB) {
    const was = blocksA.find((x) => x.id === block.id);
    if (!was) lines.push(`Added ${block.name}`);
    else lines.push(...blockChanges(to, was, block));
  }
  if (JSON.stringify(a.drillsByWeek ?? {}) !== JSON.stringify(b.drillsByWeek ?? {})) {
    lines.push('Its drills changed');
  }
  return lines;
}

function describeRule(program: Program, rule: Constraint): string {
  const name = (id: string) => program.sessionTypes.find((t) => t.id === id)?.name ?? id;
  switch (rule.kind) {
    case 'sessions-per-week':
      return rule.min === rule.max ? `${rule.min} sessions a week` : `${rule.min}–${rule.max} sessions a week`;
    case 'min-gap-hours':
      return `${rule.hours} hours between ${rule.between.map(name).join(' and ')}`;
    case 'max-per-week':
      return `${name(rule.sessionTypeId)} at most ${rule.count} a week`;
    case 'order-in-week':
      return `${name(rule.first)} before ${name(rule.then)}`;
    case 'not-day-before':
      return `No ${name(rule.sessionTypeId)} the day before ${name(rule.before)}`;
    case 'no-back-to-back':
      return `No two ${rule.intensity} days in a row`;
  }
}

/**
 * Rules gone and new — and a rule of one kind swapped for another of the
 * same kind read as the one change it is: *"48 hours → 72 hours between
 * Finger Protocol"*, not a rule dropped and an unrelated one added.
 */
function ruleChanges(from: Program, to: Program): string[] {
  const text = (program: Program) => (rule: Constraint) => ({ kind: rule.kind, text: describeRule(program, rule) });
  const a = from.constraints.map(text(from));
  const b = to.constraints.map(text(to));
  const gone = a.filter((r) => !b.some((x) => x.text === r.text));
  const fresh = b.filter((r) => !a.some((x) => x.text === r.text));
  const lines: string[] = [];
  for (const rule of gone) {
    const i = fresh.findIndex((r) => r.kind === rule.kind);
    if (i === -1) {
      lines.push(`Dropped: ${rule.text}`);
      continue;
    }
    lines.push(`${rule.text} → ${fresh[i]!.text}`);
    fresh.splice(i, 1);
  }
  for (const rule of fresh) lines.push(`New: ${rule.text}`);
  return lines;
}

function namedListChanges(from: readonly string[], to: readonly string[], label: (id: string) => string): string[] {
  return [
    ...from.filter((x) => !to.includes(x)).map((x) => `Dropped ${label(x)}`),
    ...to.filter((x) => !from.includes(x)).map((x) => `Added ${label(x)}`),
  ];
}

/**
 * Everything that differs, grouped where it lives, in the order a climber
 * would look: how long, which days, which phases, then each session.
 * Empty when the copy is still the original.
 */
export function programChanges(from: Program, to: Program): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (title: string, lines: string[]) => {
    if (lines.length > 0) groups.push({ title, lines });
  };

  add('Length', lengthChanges(from, to));
  add('The week', weekChanges(from, to));
  add('Phases', phaseChanges(from, to));

  const gone = added(to.sessionTypes, from.sessionTypes, (t) => t.id);
  const fresh = added(from.sessionTypes, to.sessionTypes, (t) => t.id);
  add('Sessions', [...gone.map((t) => `Dropped ${t.name}`), ...fresh.map((t) => `Added ${t.name}`)]);
  for (const type of to.sessionTypes) {
    const was = from.sessionTypes.find((t) => t.id === type.id);
    if (was) add(type.name, sessionChanges(to, was, type));
  }

  add(
    'Benchmarks',
    namedListChanges(from.assessments, to.assessments, (id) => getMetric(id)?.label ?? id),
  );
  add('Rules', ruleChanges(from, to));
  add(
    'Tracks',
    namedListChanges(
      (from.tracks ?? []).map((t) => t.name),
      (to.tracks ?? []).map((t) => t.name),
      (name) => name,
    ),
  );
  add(
    'Kit',
    namedListChanges(from.equipment, to.equipment, (kit) => EQUIPMENT_LABELS[kit as keyof typeof EQUIPMENT_LABELS] ?? kit),
  );

  const grades = (p: Program) => `${p.gradeRange.min}–${p.gradeRange.max}`;
  add('Grades', grades(from) !== grades(to) ? [`${grades(from)} → ${grades(to)}`] : []);

  const words = (p: Program) => [p.subtitle, p.intro.pitch, ...p.intro.rhythm, p.intro.graduation].join('\n');
  add('In its own words', words(from) !== words(to) ? ['Rewritten — read it under What it is'] : []);

  return groups;
}

/** How many separate changes, for a heading. */
export const countChanges = (groups: readonly ChangeGroup[]): number =>
  groups.reduce((n, g) => n + g.lines.length, 0);
