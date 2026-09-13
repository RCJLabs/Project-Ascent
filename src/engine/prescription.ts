/**
 * Authoring what a session actually asks you to do (M7, slice 2).
 *
 * `SessionType.blocks` is the deepest part of the content model: a block
 * carries a separate prescription for every phase, because that is what
 * periodisation means — the same "Hangboard" block is repeaters in one block
 * of weeks and max hangs in the next.
 *
 * Two things follow from that shape, and both are handled here rather than
 * in the UI:
 *
 * **Most phases are not different.** A three-phase program does not want its
 * exercise list typed three times, so copying a phase's prescription onto
 * another is a first-class operation, and a new block starts with the same
 * prescription in every phase rather than with holes.
 *
 * **A missing phase is a hole, not a default.** `perPhase` is keyed by phase
 * id; a block with no entry for a phase silently prescribes nothing for
 * those weeks. That is a real authoring mistake, so it is reported.
 */

import type {
  CircuitFormat,
  Dose,
  Exercise,
  ExerciseBlock,
  Phase,
  PhasePrescription,
  Program,
  SelectionRule,
  SessionType,
  WeekStep,
} from '@/content/types';
import type { Issue } from './customProgram';

/** The dose fields a week may move, in the order the editor shows them. */
export const DOSE_FIELDS: readonly (keyof Dose)[] = ['sets', 'reps', 'hold', 'load', 'rest'];

/** How many weeks a phase runs. */
export function phaseLength(phase: Pick<Phase, 'weekStart' | 'weekEnd'>): number {
  return phase.weekEnd - phase.weekStart + 1;
}

/**
 * What a prescription asks, with the prose left out (PLAN.md M33, M136).
 *
 * Dose and only dose: `rationale`, `notes` and `selection.note` are words,
 * and changing the words a block is described with is not progressing it.
 * The same signature the catalogue's periodisation test reads, so a block
 * the builder calls flat is one that test would call flat.
 */
export function doseSignature(p: PhasePrescription): string {
  return JSON.stringify([
    p.exercises.map((e) => [e.name, e.track ?? '', e.sets ?? '', e.reps ?? '', e.hold ?? '', e.load ?? '', e.rest ?? '']),
    p.selection?.pick ?? null,
    p.circuit
      ? [p.circuit.rounds, p.circuit.work ?? '', p.circuit.restBetween ?? '', p.circuit.restBetweenRounds ?? '']
      : null,
    p.mergedInto ?? null,
    p.perWeek ?? null,
  ]);
}

/**
 * True when the block prescribes one dose for every block of weeks it
 * covers — the case M33 requires a written reason for. A block with nothing
 * written anywhere is empty rather than flat, and is reported as empty.
 */
export function flatAcrossPhases(block: ExerciseBlock, phases: readonly Phase[]): boolean {
  if (phases.length < 2) return false;
  const entries = phases.map((phase) => phasePrescription(block, phase.id));
  if (!entries.some((p) => p.exercises.length > 0 || p.mergedInto)) return false;
  const sigs = entries.map(doseSignature);
  return sigs.every((sig) => sig === sigs[0]);
}

// ── Week by week ──────────────────────────────────────────────────────────

/** The steps with this one written in for its week, in week order. */
export function withStep(steps: readonly WeekStep[] | undefined, step: WeekStep): WeekStep[] {
  return [...(steps ?? []).filter((s) => s.week !== step.week), step].sort((a, b) => a.week - b.week);
}

/** The steps without the one for `week`; undefined once none are left. */
export function withoutStep(steps: readonly WeekStep[] | undefined, week: number): WeekStep[] | undefined {
  const kept = (steps ?? []).filter((s) => s.week !== week);
  return kept.length > 0 ? kept : undefined;
}

/**
 * One dose field on one exercise in a step. An empty value clears the
 * field, an exercise with nothing left is dropped, and a step with no
 * changes left loses its `dose` — so what the author cleared is gone
 * rather than stored as an empty string the planner would apply.
 */
export function withStepDose(step: WeekStep, name: string, field: keyof Dose, value: string): WeekStep {
  const current = { ...(step.dose?.[name] ?? {}) };
  if (value.trim() === '') delete current[field];
  else current[field] = value;
  const dose = { ...(step.dose ?? {}) };
  if (Object.keys(current).length === 0) delete dose[name];
  else dose[name] = current;
  const { dose: _dropped, ...rest } = step;
  return Object.keys(dose).length > 0 ? { ...rest, dose } : rest;
}

/** The first week of the phase that has no step yet, or null when every week has one. */
export function nextStepWeek(steps: readonly WeekStep[] | undefined, length: number): number | null {
  const taken = new Set((steps ?? []).map((s) => s.week));
  for (let week = 2; week <= length; week += 1) if (!taken.has(week)) return week;
  return null;
}

export function blankPrescription(): PhasePrescription {
  return { rationale: '', exercises: [] };
}

export function blankExercise(name = ''): Exercise {
  return { name };
}

/** A block that already covers every phase, so no week is left prescribing nothing. */
export function newBlock(name: string, phases: readonly Phase[], existing: readonly ExerciseBlock[]): ExerciseBlock {
  const perPhase: Record<string, PhasePrescription> = {};
  for (const phase of phases) perPhase[phase.id] = blankPrescription();
  return { id: blockId(name, existing), name: name.trim() || 'Block', perPhase };
}

export function blockId(name: string, existing: readonly ExerciseBlock[]): string {
  const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'block';
  const taken = new Set(existing.map((b) => b.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n++;
  return `${base}${n}`;
}

/** The prescription for a phase, or an empty one — never undefined. */
export function phasePrescription(block: ExerciseBlock, phaseId: string): PhasePrescription {
  return block.perPhase[phaseId] ?? blankPrescription();
}

export function setPrescription(
  block: ExerciseBlock,
  phaseId: string,
  patch: Partial<PhasePrescription>,
): ExerciseBlock {
  return {
    ...block,
    perPhase: { ...block.perPhase, [phaseId]: { ...phasePrescription(block, phaseId), ...patch } },
  };
}

/** Copy one phase's prescription onto another. Deep, so later edits diverge. */
export function copyPhase(block: ExerciseBlock, fromPhase: string, toPhase: string): ExerciseBlock {
  if (fromPhase === toPhase) return block;
  const source = phasePrescription(block, fromPhase);
  return { ...block, perPhase: { ...block.perPhase, [toPhase]: structuredClone(source) } };
}

/** Copy one phase's prescription onto every other phase at once. */
export function copyPhaseToAll(block: ExerciseBlock, fromPhase: string, phases: readonly Phase[]): ExerciseBlock {
  let next = block;
  for (const phase of phases) next = copyPhase(next, fromPhase, phase.id);
  return next;
}

/**
 * Keep `perPhase` in step with the program's phases.
 *
 * Phases can be added and removed after blocks are written. A new phase gets
 * a copy of the nearest earlier one — a coach adding a fourth block of weeks
 * usually means "like the third, then I will change it" — and entries for
 * deleted phases are dropped so they cannot resurrect if an id is reused.
 */
export function reconcilePhases(block: ExerciseBlock, phases: readonly Phase[]): ExerciseBlock {
  const ordered = [...phases].sort((a, b) => a.weekStart - b.weekStart);
  const perPhase: Record<string, PhasePrescription> = {};
  let previous: PhasePrescription | null = null;
  for (const phase of ordered) {
    const existing = block.perPhase[phase.id];
    const value: PhasePrescription = existing ?? (previous ? structuredClone(previous) : blankPrescription());
    perPhase[phase.id] = value;
    previous = value;
  }
  return { ...block, perPhase };
}

/** Apply the reconciliation across a whole program. */
export function reconcileProgramPhases(program: Program): Program {
  return {
    ...program,
    sessionTypes: program.sessionTypes.map((type) =>
      type.blocks
        ? { ...type, blocks: type.blocks.map((b) => reconcilePhases(b, program.phases)) }
        : type,
    ),
  };
}

/** Drill assignments that fall outside the program's weeks are dropped. */
export function trimDrills(type: SessionType, weeks: number): SessionType {
  if (!type.drillsByWeek) return type;
  const kept: Record<number, string> = {};
  for (const [week, drill] of Object.entries(type.drillsByWeek)) {
    if (Number(week) >= 1 && Number(week) <= weeks) kept[Number(week)] = drill;
  }
  return { ...type, drillsByWeek: kept };
}

/**
 * What is wrong with a session type's contents.
 *
 * Reported as warnings rather than errors: a program whose sessions have no
 * written prescription is thin, not broken — plenty of real training is
 * "climb hard for ninety minutes" — and refusing to run it would make the
 * builder useless for exactly the simple programs people start with.
 */
export function contentIssues(program: Program): Issue[] {
  const issues: Issue[] = [];
  const warn = (message: string) => issues.push({ level: 'warning', field: 'sessions', message });
  const phaseNames = new Map(program.phases.map((p) => [p.id, p.name || p.id]));
  const trackIds = new Set((program.tracks ?? []).map((t) => t.id));

  for (const type of program.sessionTypes) {
    if (type.isRest) continue;
    const blockIds = new Set((type.blocks ?? []).map((b) => b.id));
    for (const block of type.blocks ?? []) {
      if (block.name.trim() === '') {
        warn(`A block in ${type.name} has no name.`);
      }
      for (const phase of program.phases) {
        const p = block.perPhase[phase.id];
        const empty = !p || (p.exercises.length === 0 && !p.mergedInto);
        if (empty) {
          warn(`${type.name} · ${block.name}: nothing prescribed for ${phaseNames.get(phase.id)}.`);
        }
        if (!p) continue;
        // The rest of what a block can say, checked the way the catalogue's
        // content tests check it (PLAN.md M136). Warnings, all of them: a
        // step numbered past the phase never applies and a circuit with no
        // rounds runs as a list, which is thin rather than broken.
        const at = `${type.name} · ${block.name} (${phaseNames.get(phase.id)})`;
        if (p.circuit && p.circuit.rounds.trim() === '') warn(`${at} is a circuit with no number of rounds.`);
        if (p.mergedInto === block.id) warn(`${at} is folded into itself.`);
        else if (p.mergedInto && !blockIds.has(p.mergedInto)) {
          warn(`${at} is folded into "${p.mergedInto}", which is not a block in ${type.name}.`);
        }
        for (const e of p.exercises) {
          if (e.track && !trackIds.has(e.track)) {
            warn(`${at}: ${e.name || 'an exercise'} is on track "${e.track}", which this program does not declare.`);
          }
        }
        const length = phaseLength(phase);
        const weeks = new Set<number>();
        for (const w of p.perWeek ?? []) {
          if (w.week < 2 || w.week > length) {
            warn(`${at} has a step for week ${w.week}, and the phase runs ${length} week${length === 1 ? '' : 's'} — it never applies.`);
          }
          if (weeks.has(w.week)) warn(`${at} has two steps for week ${w.week}.`);
          weeks.add(w.week);
          if (w.step.trim() === '') warn(`${at} week ${w.week} changes the dose without a line saying what it asks.`);
          for (const [name, dose] of Object.entries(w.dose ?? {})) {
            const base = p.exercises.find((e) => e.name === name);
            if (!base) warn(`${at} week ${w.week} moves "${name}", which is not in the block that phase.`);
            else if (!Object.entries(dose).some(([k, v]) => base[k as keyof Dose] !== v)) {
              warn(`${at} week ${w.week} restates ${name} and changes nothing.`);
            }
          }
        }
      }
      // A block that never changes says why, and a block that says so does
      // not change: the M33 rule the catalogue is held to, for the author.
      if (program.phases.length > 1) {
        const flat = flatAcrossPhases(block, program.phases);
        if (flat && !block.constantDose) {
          warn(`${type.name} · ${block.name} prescribes the same dose in every block of weeks. Say why, or change one.`);
        }
        if (!flat && block.constantDose) warn(`${type.name} · ${block.name} says its dose never changes, and it does.`);
      }
      for (const [phaseId, p] of Object.entries(block.perPhase)) {
        if (p.selection && p.selection.pick > p.exercises.length) {
          issues.push({
            level: 'warning',
            field: 'sessions',
            message: `${type.name} · ${block.name} asks for ${p.selection.pick} of ${p.exercises.length} in ${phaseNames.get(phaseId) ?? phaseId}.`,
          });
        }
      }
    }
    for (const [week, drill] of Object.entries(type.drillsByWeek ?? {})) {
      if (Number(week) < 1 || Number(week) > program.weeks) {
        issues.push({
          level: 'error',
          field: 'sessions',
          message: `${type.name} has a drill on week ${week}, outside the program.`,
        });
      }
      if (!drill) {
        issues.push({ level: 'warning', field: 'sessions', message: `${type.name} week ${week} has an empty drill.` });
      }
    }
  }
  return issues;
}

/** A one-line summary of a block's prescription, for a collapsed list. */
export function describeBlock(block: ExerciseBlock, phaseId: string): string {
  const p = phasePrescription(block, phaseId);
  if (p.mergedInto) return `Folded into ${p.mergedInto}`;
  if (p.exercises.length === 0) return 'Nothing prescribed';
  const names = p.exercises.map((e) => e.name.trim() || 'Unnamed').slice(0, 3).join(', ');
  const more = p.exercises.length > 3 ? ` +${p.exercises.length - 3}` : '';
  const pick = p.selection ? `Pick ${p.selection.pick} · ` : '';
  return `${pick}${names}${more}`;
}

/**
 * How a prescription is meant to be run: "Pick 1 of 6 · 30s each · 3 rounds"
 * (PLAN.md M90).
 *
 * Empty when the block is a plain list of everything, which is most of
 * them — a caller renders nothing rather than a line saying nothing.
 *
 * `poolSize` is what the climber is actually looking at, not what the block
 * declares. The two differ when a track filter has removed rows, and "Pick 1
 * of 6" above four rows is worse than no line at all.
 */
export function prescriptionLine(
  selection: SelectionRule | undefined,
  circuit: CircuitFormat | undefined,
  poolSize: number,
): string {
  const parts: string[] = [];
  if (selection) parts.push(`Pick ${selection.pick} of ${poolSize}`);
  if (!circuit) return parts.join(' · ');
  if (circuit.work) parts.push(`${circuit.work} each`);
  if (circuit.restBetween) parts.push(`${circuit.restBetween} rest`);
  parts.push(`${circuit.rounds} ${circuit.rounds === '1' ? 'round' : 'rounds'}`);
  if (circuit.restBetweenRounds) parts.push(`${circuit.restBetweenRounds} between rounds`);
  return parts.join(' · ');
}
