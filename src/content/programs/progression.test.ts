import { describe, expect, it } from 'vitest';
import { PROGRAMS } from './index';
import type { Exercise, PhasePrescription, Program } from '@/content/types';

/**
 * Periodisation that is more than prose (PLAN.md M33).
 *
 * The audit found The Long Game prescribing identical strength work in weeks
 * 1-8 — Pull, Push, Core and Armor carrying the same sets, reps and load in
 * two consecutive phases, with only the rationales differing. Measuring it
 * across the catalogue found twelve of fifty-two blocks running one dose for
 * twelve weeks, several of them while their own rationale told the climber
 * to "add a SET — not weight". The instruction was there; it had just never
 * reached the fields the app reads.
 *
 * These tests are the thing that stops it coming back. A block either moves
 * across a phase boundary or says in writing why it doesn't, and a block
 * that says it doesn't move is checked against the data — a declaration that
 * stops being true is as much a defect as the stall it was covering.
 */

/**
 * Dose, and only dose. `rationale`, `notes` and `selection.note` are prose:
 * changing the words a block is described with is not progressing it, and
 * counting prose as progression is exactly how twelve identical weeks read
 * as a periodised program.
 */
function dose(e: Exercise): string {
  return JSON.stringify([e.name, e.track ?? '', e.sets ?? '', e.reps ?? '', e.hold ?? '', e.load ?? '', e.rest ?? '']);
}

function doseSig(p: PhasePrescription): string {
  return JSON.stringify([
    p.exercises.map(dose),
    p.selection?.pick ?? null,
    p.circuit
      ? [p.circuit.rounds, p.circuit.work ?? '', p.circuit.restBetween ?? '', p.circuit.restBetweenRounds ?? '']
      : null,
    p.mergedInto ?? null,
  ]);
}

const periodised = PROGRAMS.filter((p): p is Program => p.kind === 'program' && p.phases.length > 1);

interface BlockView {
  program: Program;
  sessionId: string;
  blockId: string;
  name: string;
  constantDose: string | undefined;
  /** One dose signature per phase, in phase order. Missing phases dropped. */
  sigs: string[];
  phaseCount: number;
}

const blocks: BlockView[] = periodised.flatMap((program) =>
  program.sessionTypes.flatMap((session) =>
    (session.blocks ?? []).map((block) => ({
      program,
      sessionId: session.id,
      blockId: block.id,
      name: block.name,
      constantDose: block.constantDose,
      sigs: program.phases.map((phase) => block.perPhase[phase.id]).filter(Boolean).map((p) => doseSig(p!)),
      phaseCount: program.phases.length,
    })),
  ),
);

/** A block prescribed in every phase at one unchanging dose. */
const isFlat = (b: BlockView) => b.sigs.length === b.phaseCount && new Set(b.sigs).size === 1;

const where = (b: BlockView) => `${b.program.id}/${b.sessionId}/${b.blockId} (${b.name})`;

describe('periodisation', () => {
  it('scans the whole catalogue', () => {
    // The floor that matters: this suite went from finding twelve stalls to
    // finding four, and a scan that quietly stopped reaching the programs
    // would look exactly like success.
    expect(periodised.length).toBeGreaterThan(7);
    expect(blocks.length).toBeGreaterThan(45);
  });

  it('never prescribes the same dose in every phase without saying why', () => {
    const silent = blocks.filter((b) => isFlat(b) && b.constantDose === undefined);
    expect(silent.map(where), 'a block that never changes must declare why').toEqual([]);
  });

  it('does not let a block claim to be constant when it is not', () => {
    // The other half. A declaration left behind by a later edit is a lie in
    // the content, and the only thing worse than an undocumented stall.
    const wrong = blocks.filter((b) => b.constantDose !== undefined && !isFlat(b));
    expect(wrong.map(where), 'this block declares a constant dose but changes').toEqual([]);
  });

  it('makes every declaration say something', () => {
    for (const b of blocks.filter((x) => x.constantDose !== undefined)) {
      expect(b.constantDose!.length, `${where(b)} declares a reason too short to be one`).toBeGreaterThan(60);
    }
  });

  it('changes something at every phase boundary of every session', () => {
    // The audit's actual finding: entering The Engine, a Long Game climber
    // did exactly what they did in The Base, because all four blocks of the
    // strength session were identical across that boundary.
    const stalls: string[] = [];
    for (const program of periodised) {
      for (const session of program.sessionTypes) {
        const list = session.blocks ?? [];
        if (list.length === 0) continue;
        for (let i = 1; i < program.phases.length; i += 1) {
          const before = program.phases[i - 1]!;
          const after = program.phases[i]!;
          const moved = list.some((block) => {
            const a = block.perPhase[before.id];
            const b = block.perPhase[after.id];
            if (a && b) return doseSig(a) !== doseSig(b);
            return Boolean(a) !== Boolean(b);
          });
          // A session made entirely of blocks that each declare themselves
          // constant is allowed to stall — that is what the declaration is
          // for. One undeclared block in it is not.
          const allDeclared = list.every((block) => block.constantDose !== undefined);
          if (!moved && !allDeclared) {
            stalls.push(`${program.id}/${session.id}: ${before.name} -> ${after.name}`);
          }
        }
      }
    }
    expect(stalls, 'nothing in this session changes dose across the boundary').toEqual([]);
  });

  it('leaves no phase of a program where the whole week is unchanged', () => {
    // Weaker than the per-session rule and worth keeping separate: a drill
    // swap in one session can carry a boundary that every block stalls on,
    // and that is a real progression even though no dose moved.
    const dead: string[] = [];
    for (const program of periodised) {
      for (let i = 1; i < program.phases.length; i += 1) {
        const before = program.phases[i - 1]!;
        const after = program.phases[i]!;
        const moved = program.sessionTypes.some((session) => {
          const byBlock = (session.blocks ?? []).some((block) => {
            const a = block.perPhase[before.id];
            const b = block.perPhase[after.id];
            if (a && b) return doseSig(a) !== doseSig(b);
            return Boolean(a) !== Boolean(b);
          });
          const byDrill =
            session.drillsByWeek !== undefined &&
            session.drillsByWeek[before.weekEnd] !== session.drillsByWeek[after.weekStart];
          return byBlock || byDrill;
        });
        if (!moved) dead.push(`${program.id}: ${before.name} -> ${after.name}`);
      }
    }
    expect(dead, 'this phase boundary changes nothing anywhere in the program').toEqual([]);
  });
});

/**
 * One name, one row (PLAN.md M98).
 *
 * The numbers a climber logs are keyed by the exercise's name, which is the
 * right key for a history — Weighted Pull-Ups in Iron Grip and in The Siege
 * are the same exercise and deserve one line. It is the wrong key inside a
 * single session if two blocks of the same session prescribe the same name,
 * because then one set of numbers would stand for two different pieces of
 * work.
 *
 * Measured before the milestone was built: zero of sixty-five (session type
 * × phase) pairs repeat a name. This holds the catalogue to that. A custom
 * program that repeats one shares a row, exactly as the tick always did —
 * an honest limitation rather than a silent one.
 */
describe('exercise names inside one session', () => {
  it('never repeats within a session type and phase', () => {
    const clashes: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        const phases = new Set(
          (type.blocks ?? []).flatMap((block) => Object.keys(block.perPhase)),
        );
        for (const phase of phases) {
          const names = (type.blocks ?? []).flatMap(
            (block) => block.perPhase[phase]?.exercises.map((e) => e.name) ?? [],
          );
          const repeated = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
          for (const name of repeated) clashes.push(`${program.id}/${type.id}/${phase}: ${name}`);
        }
      }
    }
    expect(clashes).toEqual([]);
  });
});
