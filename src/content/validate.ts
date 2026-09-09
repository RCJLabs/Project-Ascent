/**
 * Content validation.
 *
 * Runs over the whole catalog in tests, so a broken drill reference or a
 * phase gap fails CI rather than rendering an empty card months later.
 * Every rule here is one the old app could only fail at runtime.
 */

import { getDrill } from './drills';
import { getMetric } from './metrics';
import { getProtocol } from './protocols';
import { PLANNED_PROGRAM_IDS } from './programs';
import type { Program } from './types';

export function validateProgram(program: Program): string[] {
  const errors: string[] = [];
  const where = (msg: string) => errors.push(`${program.id}: ${msg}`);

  if (program.weeks < 1) where('weeks must be at least 1');

  // Phases must tile 1..weeks exactly.
  const phases = [...program.phases].sort((a, b) => a.weekStart - b.weekStart);
  if (phases.length === 0) where('has no phases');
  let expected = 1;
  const phaseIds = new Set<string>();
  for (const phase of phases) {
    if (phaseIds.has(phase.id)) where(`duplicate phase id '${phase.id}'`);
    phaseIds.add(phase.id);
    if (phase.weekStart !== expected) {
      where(`phase '${phase.id}' starts at week ${phase.weekStart}, expected ${expected}`);
    }
    if (phase.weekEnd < phase.weekStart) where(`phase '${phase.id}' ends before it starts`);
    if (phase.goals.length === 0) where(`phase '${phase.id}' has no goals`);
    if (!phase.description.trim()) where(`phase '${phase.id}' has no description`);
    expected = phase.weekEnd + 1;
  }
  if (phases.length > 0 && expected - 1 !== program.weeks) {
    where(`phases cover ${expected - 1} weeks, program declares ${program.weeks}`);
  }

  // Tracks.
  const trackIds = new Set<string>();
  for (const track of program.tracks ?? []) {
    if (trackIds.has(track.id)) where(`duplicate track id '${track.id}'`);
    trackIds.add(track.id);
  }

  // Session types.
  const typeIds = new Set<string>();
  for (const type of program.sessionTypes) {
    if (typeIds.has(type.id)) where(`duplicate session type id '${type.id}'`);
    typeIds.add(type.id);

    const blockIds = new Set((type.blocks ?? []).map((b) => b.id));
    for (const block of type.blocks ?? []) {
      for (const phaseId of phaseIds) {
        if (!block.perPhase[phaseId]) {
          where(`block '${block.id}' in '${type.id}' is missing phase '${phaseId}'`);
        }
      }
      for (const [phaseId, entry] of Object.entries(block.perPhase)) {
        if (!phaseIds.has(phaseId)) {
          where(`block '${block.id}' references unknown phase '${phaseId}'`);
        }
        if (!entry.rationale.trim()) where(`block '${block.id}' phase '${phaseId}' has no rationale`);
        if (entry.exercises.length === 0 && !entry.mergedInto) {
          where(`block '${block.id}' phase '${phaseId}' has no exercises`);
        }
        if (entry.mergedInto) {
          if (!blockIds.has(entry.mergedInto)) {
            where(`block '${block.id}' phase '${phaseId}' merges into unknown block '${entry.mergedInto}'`);
          }
          if (entry.mergedInto === block.id) {
            where(`block '${block.id}' phase '${phaseId}' merges into itself`);
          }
        }
        if (entry.selection && entry.selection.pick > entry.exercises.length) {
          where(
            `block '${block.id}' phase '${phaseId}' asks for ${entry.selection.pick} of ${entry.exercises.length} exercises`,
          );
        }
        if (entry.selection && entry.selection.pick < 1) {
          where(`block '${block.id}' phase '${phaseId}' has a selection of fewer than one exercise`);
        }
        for (const ex of entry.exercises) {
          if (ex.protocolId && !getProtocol(ex.protocolId)) {
            where(`exercise '${ex.name}' references unknown protocol '${ex.protocolId}'`);
          }
          if (ex.track && !trackIds.has(ex.track)) {
            where(`exercise '${ex.name}' references undeclared track '${ex.track}'`);
          }
        }
      }
    }

    if (type.drillsByWeek) {
      for (let week = 1; week <= program.weeks; week++) {
        const drillId = type.drillsByWeek[week];
        if (!drillId) {
          where(`session type '${type.id}' has no drill for week ${week}`);
          continue;
        }
        const drill = getDrill(drillId);
        if (!drill) {
          where(`session type '${type.id}' week ${week} references unknown drill '${drillId}'`);
        } else if (drill.protocolId && !getProtocol(drill.protocolId)) {
          where(`drill '${drill.id}' references unknown protocol '${drill.protocolId}'`);
        }
      }
      for (const key of Object.keys(type.drillsByWeek)) {
        const week = Number(key);
        if (!Number.isInteger(week) || week < 1 || week > program.weeks) {
          where(`session type '${type.id}' has a drill for out-of-range week '${key}'`);
        }
      }
    }
  }

  if (!program.sessionTypes.some((t) => t.isRest)) {
    where('has no rest session type');
  }

  // Constraints must reference real session types.
  for (const c of program.constraints) {
    const refs =
      c.kind === 'min-gap-hours'
        ? c.between
        : c.kind === 'max-per-week'
          ? [c.sessionTypeId]
          : c.kind === 'not-before'
            ? [c.sessionTypeId, c.before]
            : [];
    for (const ref of refs) {
      if (!typeIds.has(ref)) where(`constraint '${c.kind}' references unknown session type '${ref}'`);
    }
    if (!c.note.trim()) where(`constraint '${c.kind}' has no display note`);
  }

  for (const week of program.deloadWeeks ?? []) {
    if (!Number.isInteger(week) || week < 1 || week > program.weeks) {
      where(`deload week ${week} is outside weeks 1-${program.weeks}`);
    }
  }
  if (new Set(program.deloadWeeks ?? []).size !== (program.deloadWeeks ?? []).length) {
    where('has duplicate deload weeks');
  }

  // Recommended layout.
  for (const [day, typeId] of Object.entries(program.recommendedLayout?.slots ?? {})) {
    if (typeId && !typeIds.has(typeId)) {
      where(`recommended layout day ${day} references unknown session type '${typeId}'`);
    }
  }

  // Assessments and progression graph.
  for (const metricId of program.assessments) {
    if (!getMetric(metricId)) where(`references unknown metric '${metricId}'`);
  }
  if (new Set(program.assessments).size !== program.assessments.length) {
    where('has duplicate assessment metrics');
  }
  for (const next of program.nextPrograms) {
    if (!PLANNED_PROGRAM_IDS.includes(next.id)) {
      where(`nextPrograms points at unknown program '${next.id}'`);
    }
    if (next.id === program.id) where('nextPrograms points at itself');
  }
  for (const prereq of program.prerequisites?.metrics ?? []) {
    if (!getMetric(prereq.metricId)) {
      where(`prerequisite references unknown metric '${prereq.metricId}'`);
    }
  }

  return errors;
}

export function validateCatalog(programs: Program[]): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const program of programs) {
    if (seen.has(program.id)) errors.push(`duplicate program id '${program.id}'`);
    seen.add(program.id);
    if (!PLANNED_PROGRAM_IDS.includes(program.id)) {
      errors.push(`program '${program.id}' is not in PLANNED_PROGRAM_IDS`);
    }
    errors.push(...validateProgram(program));
  }
  return errors;
}
