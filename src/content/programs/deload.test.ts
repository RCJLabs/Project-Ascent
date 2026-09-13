import { describe, expect, it } from 'vitest';
import { PROGRAMS } from './index';
import { IRON_GRIP } from './catalogue';
import { DELOAD_STEP, deloadDose, deloadLightens, prescriptionFor } from '@/engine/plan';
import { phaseForWeek, type Program } from '@/content/types';

/**
 * A deload that is lighter, not just labelled (PLAN.md M128).
 *
 * `deloadWeeks` drove a calendar marker, a `deload: true` stamp and a
 * sentence explaining the dip in training load, and not one of those reduced
 * a set, a rep or a load. For The Cruiser, Two Days a Week and Ground Zero
 * there is no weekly drill either, so a deload week was byte-identical to
 * the week before it — the app printed "Deload week" over the same five sets
 * of maximal hangs.
 *
 * The last test here is the audit's claim, turned round: for every deload
 * week in the catalogue, the flag has to change something.
 */

const ex = (sets?: string) => ({ name: 'x', ...(sets === undefined ? {} : { sets }) });

describe('what a deload takes off', () => {
  it('drops a range to its bottom', () => {
    expect(deloadDose(ex('3-5'))).toEqual({ sets: '3' });
    expect(deloadDose(ex('2-3'))).toEqual({ sets: '2' });
  });

  it('takes one off a fixed count', () => {
    expect(deloadDose(ex('5'))).toEqual({ sets: '4' });
    expect(deloadDose(ex('3'))).toEqual({ sets: '2' });
  });

  it('never goes below two', () => {
    expect(deloadDose(ex('2'))).toBeNull();
    expect(deloadDose(ex('1'))).toBeNull();
  });

  it('leaves a count it cannot read alone', () => {
    // Guessing at 'AMRAP' or '1 per arm' is how a rule like this starts
    // prescribing nonsense.
    expect(deloadDose(ex('AMRAP'))).toBeNull();
    expect(deloadDose(ex('1 per arm'))).toBeNull();
    expect(deloadDose(ex())).toBeNull();
  });

  it('touches volume and nothing else', () => {
    // Dropping the load on a max-hang week and dropping it on a mobility
    // circuit are not the same decision, and this rule knows neither block.
    const full = { name: 'Max Hangs', sets: '5', hold: '10s', load: '90%', rest: '3 min', reps: '6' };
    expect(deloadDose(full)).toEqual({ sets: '4' });
  });

  it('says when there is nothing to take', () => {
    expect(deloadLightens({ rationale: 'x', exercises: [ex('2'), ex('1')] })).toBe(false);
    expect(deloadLightens({ rationale: 'x', exercises: [ex('2'), ex('4')] })).toBe(true);
    expect(
      deloadLightens({ rationale: 'x', exercises: [ex('2')], circuit: { rounds: '4' } }),
    ).toBe(true);
  });
});

describe('the planner lightens the week', () => {
  const session = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
  const anvil = IRON_GRIP.phases[0]!;
  const pull = (week: number, deload: boolean) =>
    prescriptionFor(session, anvil, undefined, week, deload).find((b) => b.blockId === 'pull')!;

  it('leaves an ordinary week exactly as written', () => {
    const b = pull(2, false);
    expect(b.entry.exercises[0]!.sets).toBe('3');
    expect(b.step).toBeUndefined();
  });

  it('takes a set off, and says it did', () => {
    const b = pull(4, true);
    expect(b.entry.exercises[0]!.sets).toBe('2');
    expect(b.step).toBe(DELOAD_STEP);
  });

  it('lets the block that wrote its own deload keep it', () => {
    // Iron Grip's finger protocol authored week 4 in M127. The derived rule
    // must not overwrite an author who said what the week should be.
    const fingers = prescriptionFor(session, anvil, undefined, 4, true).find(
      (b) => b.blockId === 'finger_protocol',
    )!;
    expect(fingers.step).toMatch(/Deload\. Three sets on the same edge/);
    expect(fingers.entry.exercises[0]!.sets).toBe('3');
  });

  it('claims nothing on a block with nothing to give', () => {
    const thin = {
      ...session,
      blocks: [{ id: 'thin', name: 'Thin', perPhase: { [anvil.id]: { rationale: 'x', exercises: [ex('2')] } } }],
    };
    const b = prescriptionFor(thin, anvil, undefined, 4, true)[0]!;
    expect(b.step).toBeUndefined();
    expect(b.entry.exercises[0]!.sets).toBe('2');
  });

  it('stands down where the author spoke, even when they named no numbers', () => {
    // A step with no dose is still the author saying what the week is. The
    // rule must not lighten underneath it and hand back a note the block
    // never wrote — "a set off" beside "keep all four" is two programs.
    const spoken = {
      ...session,
      blocks: [{
        id: 's',
        name: 'S',
        perPhase: {
          [anvil.id]: {
            rationale: 'x',
            exercises: [ex('4')],
            perWeek: [{ week: 4, step: 'Keep all four sets; this deload is in the intensity, not the volume.' }],
          },
        },
      }],
    };
    const b = prescriptionFor(spoken, anvil, undefined, 4, true)[0]!;
    expect(b.entry.exercises[0]!.sets).toBe('4');
    expect(b.step).toMatch(/Keep all four sets/);
  });

  it('takes a round off a circuit', () => {
    const circuit = {
      ...session,
      blocks: [{
        id: 'c',
        name: 'C',
        perPhase: { [anvil.id]: { rationale: 'x', exercises: [ex('2')], circuit: { rounds: '4' } } },
      }],
    };
    const b = prescriptionFor(circuit, anvil, undefined, 4, true)[0]!;
    expect(b.entry.circuit!.rounds).toBe('3');
    expect(b.step).toBe(DELOAD_STEP);
  });
});

describe('every deload week in the catalogue', () => {
  const withDeloads = PROGRAMS.filter(
    (p): p is Program => p.kind === 'program' && (p.deloadWeeks ?? []).length > 0,
  );

  const sig = (program: Program, week: number, deload: boolean): string => {
    const phase = phaseForWeek(program, week);
    if (!phase) return `no phase ${week}`;
    return JSON.stringify(
      program.sessionTypes
        .filter((t) => (t.blocks ?? []).length > 0)
        .map((t) => prescriptionFor(t, phase, undefined, week, deload)),
    );
  };

  it('scans the programs that have them', () => {
    // Ten programs and nineteen deload weeks at M128. Floors, with their own
    // slack checked: a floor of zero passes forever and catches a sweep that
    // quietly stopped reaching the catalogue — the trap `perf.test.ts` names
    // about its budget.
    const PROGRAM_FLOOR = 9;
    const WEEK_FLOOR = 19;
    const weeks = withDeloads.flatMap((p) => p.deloadWeeks ?? []).length;
    expect(withDeloads.length).toBeGreaterThanOrEqual(PROGRAM_FLOOR);
    expect(weeks).toBeGreaterThanOrEqual(WEEK_FLOOR);
    expect(withDeloads.length - PROGRAM_FLOOR, 'the program floor has room to hide in').toBeLessThan(3);
    expect(weeks - WEEK_FLOOR, 'the week floor has room to hide in').toBeLessThan(3);
  });

  it('is lighter than the same week would be without the flag', () => {
    // The audit's claim, turned round. Before M128 both sides of this were
    // the same string for every program in the catalogue.
    const same: string[] = [];
    for (const program of withDeloads) {
      for (const week of program.deloadWeeks ?? []) {
        if (sig(program, week, true) === sig(program, week, false)) {
          same.push(`${program.id} week ${week}`);
        }
      }
    }
    expect(same, 'this deload week prescribes exactly what an ordinary one would').toEqual([]);
  });

  it('is not the week before it, either', () => {
    const same: string[] = [];
    for (const program of withDeloads) {
      const deloads = new Set(program.deloadWeeks ?? []);
      for (const week of deloads) {
        if (week <= 1) continue;
        if (sig(program, week, true) === sig(program, week - 1, deloads.has(week - 1))) {
          same.push(`${program.id} week ${week}`);
        }
      }
    }
    expect(same, 'this deload week is identical to the week before it').toEqual([]);
  });
});
