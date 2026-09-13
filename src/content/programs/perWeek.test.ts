import { describe, expect, it } from 'vitest';
import { PROGRAMS } from './index';
import { IRON_GRIP } from './catalogue';
import { prescriptionFor, weekInPhase } from '@/engine/plan';
import type { Phase, PhasePrescription, Program, SessionType } from '@/content/types';

/**
 * A dose that moves inside a phase (PLAN.md M127).
 *
 * `perPhase` was the only dose the model had, and its only reader took a
 * phase and never a week — so a climber saw byte-identical sets, reps, hold
 * and load for four weeks running. The catalogue knew and worked around it
 * in prose the app could not read: Iron Grip's Hammer phase lists "Progress
 * added load weekly" as a goal beside a static load, and The Siege's
 * rationale says to add 2-5lb a week when the last set felt solid.
 *
 * Two halves, tested as two things. The content rules below keep the
 * authored rows honest — a week that exists, an exercise that exists, a
 * change that changes something. The engine rules keep the reader honest:
 * the same prescription has to come back unchanged when nobody asked for a
 * week, because six screens still call it that way.
 */

interface Row {
  where: string;
  phaseLength: number;
  entry: PhasePrescription;
}

const rows: Row[] = PROGRAMS.filter((p): p is Program => p.kind === 'program').flatMap((program) =>
  program.sessionTypes.flatMap((session: SessionType) =>
    (session.blocks ?? []).flatMap((block) =>
      program.phases.flatMap((phase: Phase) => {
        const entry = block.perPhase[phase.id];
        return entry
          ? [{
              where: `${program.id}/${session.id}/${block.id}/${phase.id}`,
              phaseLength: phase.weekEnd - phase.weekStart + 1,
              entry,
            }]
          : [];
      }),
    ),
  ),
);

const withSteps = rows.filter((r) => r.entry.perWeek !== undefined);

describe('the authored week steps', () => {
  it('scans the whole catalogue', () => {
    // A scan that quietly stopped reaching the programs would look exactly
    // like a catalogue with no faults in it.
    expect(rows.length).toBeGreaterThan(90);
  });

  it('is used, so the schema cannot quietly become dead', () => {
    // Three prescriptions carry one at M127: Iron Grip's Anvil and Hammer,
    // and The Siege's Decode. The floor is what stops the mechanism being
    // built, shipped and never authored against.
    const FLOOR = 3;
    expect(withSteps.length).toBeGreaterThanOrEqual(FLOOR);
    // And the floor has to sit at what is actually authored, or lowering it
    // passes forever and catches nothing — the trap `perf.test.ts` names
    // about its budget, which is a ceiling of the same shape.
    expect(withSteps.length - FLOOR, 'the floor has room to hide in').toBeLessThan(3);
  });

  it('never numbers a week the phase does not have', () => {
    const bad: string[] = [];
    for (const r of withSteps) {
      for (const w of r.entry.perWeek!) {
        if (w.week < 2 || w.week > r.phaseLength) bad.push(`${r.where} week ${w.week} of ${r.phaseLength}`);
      }
    }
    // Week 1 is the phase's own dose. A row for it would be a second way to
    // say the same thing, and the two would drift.
    expect(bad, 'a step numbered outside 2..phase length').toEqual([]);
  });

  it('numbers each week once, in order', () => {
    const bad: string[] = [];
    for (const r of withSteps) {
      const weeks = r.entry.perWeek!.map((w) => w.week);
      if (new Set(weeks).size !== weeks.length) bad.push(`${r.where} repeats a week`);
      if (weeks.join() !== [...weeks].sort((a, b) => a - b).join()) bad.push(`${r.where} is out of order`);
    }
    expect(bad).toEqual([]);
  });

  it('only moves exercises the phase actually prescribes', () => {
    // The merge is by name, so a typo would silently prescribe nothing.
    const bad: string[] = [];
    for (const r of withSteps) {
      const names = new Set(r.entry.exercises.map((e) => e.name));
      for (const w of r.entry.perWeek!) {
        for (const name of Object.keys(w.dose ?? {})) {
          if (!names.has(name)) bad.push(`${r.where} week ${w.week} names "${name}"`);
        }
      }
    }
    expect(bad, 'a week step names an exercise the phase does not have').toEqual([]);
  });

  it('never writes a dose that changes nothing', () => {
    // A row repeating the phase's own numbers is a no-op dressed as
    // progression, which is the thing this milestone exists to stop.
    const bad: string[] = [];
    for (const r of withSteps) {
      for (const w of r.entry.perWeek!) {
        for (const [name, dose] of Object.entries(w.dose ?? {})) {
          const base = r.entry.exercises.find((e) => e.name === name);
          const moved = Object.entries(dose).some(([k, v]) => base?.[k as keyof typeof base] !== v);
          if (!moved) bad.push(`${r.where} week ${w.week} restates ${name}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('makes every step say something', () => {
    for (const r of withSteps) {
      for (const w of r.entry.perWeek!) {
        expect(w.step.length, `${r.where} week ${w.week} says too little to be a step`).toBeGreaterThan(40);
      }
    }
  });

  it('carries steps that move nothing a field can hold, which is the point', () => {
    // Half of what a program says about progression is a rule about the
    // climber — "add 2.5lb if last week felt solid" — and faking it as a
    // number would put a figure in the app that nobody measured. A step
    // with no dose has to stay legal, and something has to use it.
    const ruleOnly = withSteps.flatMap((r) => (r.entry.perWeek ?? []).filter((w) => w.dose === undefined));
    expect(ruleOnly.length).toBeGreaterThan(0);
  });
});

describe('the planner reads the week', () => {
  const session = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
  const anvil = IRON_GRIP.phases[0]!;
  const hammer = IRON_GRIP.phases[1]!;
  const fingers = (week?: number | null) =>
    prescriptionFor(session, anvil, undefined, week).find((b) => b.blockId === 'finger_protocol')!;

  it('maps a program week onto its phase', () => {
    expect(weekInPhase(anvil, 1)).toBe(1);
    expect(weekInPhase(anvil, 4)).toBe(4);
    expect(weekInPhase(hammer, 5)).toBe(1);
    expect(weekInPhase(hammer, 8)).toBe(4);
  });

  it('says so rather than clamping a week outside the phase', () => {
    expect(weekInPhase(hammer, 4)).toBeNull();
    expect(weekInPhase(hammer, 9)).toBeNull();
  });

  it('hands back the phase dose when nobody asked for a week', () => {
    // Six screens call it this way, and they must keep getting what they got.
    const b = fingers();
    expect(b.step).toBeUndefined();
    expect(b.entry.exercises[0]!.sets).toBe('3-5');
  });

  it('hands back the phase dose on a week with no step of its own', () => {
    const b = fingers(1);
    expect(b.step).toBeUndefined();
    expect(b.entry.exercises[0]!.sets).toBe('3-5');
  });

  it('merges the week over the phase, and says what changed', () => {
    const b = fingers(3);
    expect(b.entry.exercises[0]!.sets).toBe('5');
    // Everything the week did not name is the phase's still.
    expect(b.entry.exercises[0]!.load).toBe('60-70% max added weight');
    expect(b.step).toMatch(/top of the volume ramp/i);
  });

  it('carries a step that changes no number at all', () => {
    const b = fingers(2);
    expect(b.step).toMatch(/one increment/);
    expect(b.entry.exercises[0]!.sets).toBe('3-5');
  });

  it('carries a rule-only step in the phase whose goal is weekly progress', () => {
    // The Hammer's goal line is "Progress added load weekly" and its load is
    // a percentage of a max the content has never measured, so week 2 is a
    // rule and nothing else. Asserted on the phase that needs it rather than
    // only counting rule-only steps across the catalogue.
    const hammer2 = prescriptionFor(session, hammer, undefined, 6).find((b) => b.blockId === 'finger_protocol')!;
    expect(hammer2.step).toMatch(/held the full ten seconds/);
    const base = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!.blocks![0]!.perPhase[hammer.id]!;
    expect(hammer2.entry.exercises[0]!.sets).toBe(base.exercises[0]!.sets);
    expect(hammer2.entry.exercises[0]!.load).toBe(base.exercises[0]!.load);
  });

  it('leaves the phase alone when the week belongs to another one', () => {
    // Week 6 is in The Hammer; asked against The Anvil it is nobody's week.
    const b = fingers(6);
    expect(b.step).toBeUndefined();
    expect(b.entry.exercises[0]!.sets).toBe('3-5');
  });

  it('does not mutate the catalogue while merging', () => {
    fingers(3);
    expect(IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!.blocks![0]!.perPhase[anvil.id]!.exercises[0]!.sets).toBe('3-5');
  });
});
