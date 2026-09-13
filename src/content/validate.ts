/**
 * Content validation.
 *
 * Runs over the whole catalog in tests, so a broken drill reference or a
 * phase gap fails CI rather than rendering an empty card months later.
 * Every rule here is one the old app could only fail at runtime.
 */

import { FIELDS } from './fields';
import { secondsRange, sessionMinutes } from '@/engine/sessionLength';
import { getDrill } from './drills';
import { getMetric } from './metrics';
import { getProtocol } from './protocols';
import { PLANNED_PROGRAM_IDS } from './programs';
import { atLeastAsHard, type Program } from './types';

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
        } else if (drill.timerOverride && !drill.protocolId) {
          where(`drill '${drill.id}' sets a timer override but references no protocol`);
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

  // Every working day says how hard it is (PLAN.md M131). Optional in the
  // type so a half-built custom program is not invalid while it is being
  // written, required here so nothing ships without it: the scheduler's
  // back-to-back rule reads this, and a type with no intensity would be
  // silently exempt from a rule about recovery.
  for (const type of program.sessionTypes) {
    if (!type.isRest && type.intensity === undefined) {
      where(`session type '${type.id}' does not say how hard it is`);
    }
  }

  /**
   * No session type asks a question the app asks better elsewhere
   * (PLAN.md M142).
   *
   * *Time on the wall* sat beside the logger's own Duration input on the
   * same screen, and only the second one reached load, the review and the
   * archive. A rule rather than a comment, because the registry entries
   * stay — a stored answer needs its label — so nothing but this stops a
   * program declaring one again.
   */
  for (const type of program.sessionTypes) {
    for (const id of type.fields ?? []) {
      const retired = FIELDS[id]?.retired;
      if (retired !== undefined) {
        where(`session type '${type.id}' asks for '${FIELDS[id]!.label}'; that is ${retired}`);
      }
    }
  }

  /**
   * Every working session says how long it takes (PLAN.md M138).
   *
   * Either the prescription adds up to a length or the author states one,
   * and never both: an authored number cannot shorten on a deload week or
   * follow a per-week step, so it is allowed only where the dose says
   * nothing — the climbing days. A session with neither is the one a
   * climber cannot plan an evening around, which is the question this
   * whole estimate exists to answer.
   *
   * Modes are exempt and it is not an oversight. `general_training` is a
   * menu with no dose at all and `outdoor_climbing` has no blocks: a day
   * at the crag is as long as the day is, and inventing a number for it
   * would be the app pretending to know something nobody does.
   */
  if (program.kind === 'program') {
    for (const type of program.sessionTypes) {
      if (type.isRest) continue;
      if (type.duration !== undefined && secondsRange(type.duration) === null) {
        where(`session type '${type.id}' has a duration the clock cannot read ('${type.duration}')`);
        continue;
      }
      // Against every phase, because the dose changes shape between them
      // and a session that goes quiet in phase three is an unanswered card
      // for four weeks.
      for (const phase of program.phases) {
        const derived = sessionMinutes({
          type: { ...type, duration: undefined },
          program,
          week: phase.weekStart,
          trackId: program.tracks?.[0]?.id,
        });
        if (type.duration === undefined && derived === null) {
          where(`session type '${type.id}' says how long it takes in neither its dose nor a duration, in phase '${phase.id}'`);
        }
        if (type.duration !== undefined && derived !== null) {
          where(`session type '${type.id}' states a duration and its dose in phase '${phase.id}' already adds up to one`);
        }
      }
    }
  }

  // Constraints must reference real session types.
  for (const c of program.constraints) {
    const refs =
      c.kind === 'min-gap-hours'
        ? c.between
        : c.kind === 'max-per-week'
          ? [c.sessionTypeId]
          : c.kind === 'not-day-before'
            ? [c.sessionTypeId, c.before]
            : c.kind === 'order-in-week'
              ? [c.first, c.then]
              : [];
    for (const ref of refs) {
      if (!typeIds.has(ref)) where(`constraint '${c.kind}' references unknown session type '${ref}'`);
    }
    // A rule about days this hard, in a program that has none, is a rule
    // that can never fire — the same class of mistake as a constraint
    // naming a session type that does not exist.
    if (
      c.kind === 'no-back-to-back' &&
      !program.sessionTypes.some((t) => t.intensity && atLeastAsHard(t.intensity, c.intensity))
    ) {
      where(`constraint 'no-back-to-back' asks about '${c.intensity}' days and there are none`);
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
  // Helpful kit that is also required is a contradiction: the finder would
  // block on it and then explain how to work around it (PLAN.md M36).
  for (const kit of program.helpfulEquipment ?? []) {
    if (program.equipment.includes(kit)) {
      where(`'${kit}' is listed as both required and helpful equipment`);
    }
    if (kit === 'none') where(`'none' cannot be helpful equipment`);
  }
  if (new Set(program.helpfulEquipment ?? []).size !== (program.helpfulEquipment ?? []).length) {
    where('has duplicate helpful equipment');
  }

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
