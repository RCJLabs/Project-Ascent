import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '..';
import { validateProgram } from '@/engine/customProgram';
import { layoutsFor, planFromLayout, sessionPriority, validateWeek } from '@/engine/scheduler';
import { adaptProgram, lengthsFor } from '@/engine/adapt';
import { getMetric } from '@/content/metrics';
import { DRAFT_PROGRAMS, TRIP_PREP, TWO_DAY_WEEK } from '.';

/**
 * A draft has to be shippable, and has to be unshipped (PLAN.md M58).
 *
 * These run the same checks the app runs on a program a climber writes, plus
 * the ones the catalogue's own tests would apply the moment one of these is
 * added to `PROGRAMS`. The point is that shipping is a two-line change and
 * not a debugging session.
 */

describe('the drafts are not shipped', () => {
  it('is in no catalogue, so nothing can recommend or start one', () => {
    for (const draft of DRAFT_PROGRAMS) {
      expect(PROGRAMS.map((p) => p.id), draft.id).not.toContain(draft.id);
    }
  });

  it('does not collide with a shipped id', () => {
    const shipped = new Set(PROGRAMS.map((p) => p.id));
    for (const draft of DRAFT_PROGRAMS) expect(shipped.has(draft.id), draft.id).toBe(false);
  });
});

describe('the drafts would be valid if they were', () => {
  it('passes the same validation a written program does', () => {
    for (const draft of DRAFT_PROGRAMS) {
      const errors = validateProgram(draft).filter((i) => i.level === 'error');
      expect(errors, draft.id).toEqual([]);
    }
  });

  it('names only metrics the app actually has', () => {
    for (const draft of DRAFT_PROGRAMS) {
      for (const id of draft.assessments) expect(getMetric(id), `${draft.id}/${id}`).toBeDefined();
    }
  });

  it('points its progression graph at programs that exist', () => {
    const ids = new Set(PROGRAMS.map((p) => p.id));
    for (const draft of DRAFT_PROGRAMS) {
      for (const next of draft.nextPrograms) expect(ids.has(next.id), `${draft.id} → ${next.id}`).toBe(true);
    }
  });

  it('prescribes every phase in every block', () => {
    for (const draft of DRAFT_PROGRAMS) {
      const phases = draft.phases.map((p) => p.id);
      for (const type of draft.sessionTypes) {
        for (const block of type.blocks ?? []) {
          expect(Object.keys(block.perPhase).sort(), `${draft.id}/${type.id}/${block.id}`).toEqual(
            [...phases].sort(),
          );
        }
      }
    }
  });

  // The rule M33 put on the catalogue: a block that prescribes the same dose
  // in every phase has to say why, and one that says why must not change.
  it('changes something at every phase boundary, or says why not', () => {
    for (const draft of DRAFT_PROGRAMS) {
      for (const type of draft.sessionTypes) {
        for (const block of type.blocks ?? []) {
          const doses = draft.phases.map((p) => JSON.stringify(block.perPhase[p.id]?.exercises ?? []));
          const where = `${draft.id}/${type.id}/${block.id}`;
          if (block.constantDose !== undefined) {
            // It declared itself constant, so it had better be constant.
            expect(new Set(doses).size, where).toBe(1);
            continue;
          }
          // Every boundary, not just the block as a whole: two identical
          // phases with a different third is still a phase that changes
          // nothing, and that is the shape M33 found twelve of.
          for (let i = 1; i < doses.length; i += 1) {
            expect(doses[i], `${where} at phase ${i + 1}`).not.toBe(doses[i - 1]);
          }
        }
      }
    }
  });

  it('runs on its own recommended layout without breaking its own rules', () => {
    for (const draft of DRAFT_PROGRAMS) {
      if (!draft.recommendedLayout) continue;
      const violations = validateWeek(draft, planFromLayout(draft.recommendedLayout));
      expect(violations.filter((v) => v.severity === 'error'), draft.id).toEqual([]);
    }
  });

  it('can be laid out on any number of days without breaking a hard rule', () => {
    for (const draft of DRAFT_PROGRAMS) {
      for (const days of [1, 2, 3, 4, 5]) {
        for (const layout of layoutsFor(draft, { daysPerWeek: days })) {
          const errors = validateWeek(draft, planFromLayout(layout)).filter((v) => v.severity === 'error');
          expect(errors, `${draft.id}@${days}/${layout.name}`).toEqual([]);
        }
      }
    }
  });

  it('adapts to every length it would offer', () => {
    for (const draft of DRAFT_PROGRAMS) {
      for (const weeks of lengthsFor(draft)) {
        const out = adaptProgram(draft, weeks);
        const errors = validateProgram(out).filter((i) => i.level === 'error');
        expect(errors, `${draft.id}@${weeks}`).toEqual([]);
      }
    }
  });
});

describe('what each draft is for', () => {
  // The hole it exists to fill: the app asks how many days a week and offers
  // two, and nothing shipped asks for fewer than three.
  it('gives a two-day climber a program that asks for two days', () => {
    const perWeek = TWO_DAY_WEEK.constraints.find((c) => c.kind === 'sessions-per-week');
    expect(perWeek).toMatchObject({ min: 2 });
    for (const program of PROGRAMS) {
      const shipped = program.constraints.find((c) => c.kind === 'sessions-per-week');
      if (shipped?.kind === 'sessions-per-week') expect(shipped.min, program.id).toBeGreaterThan(2);
    }
  });

  it('keeps the climbing day when a two-day week becomes one', () => {
    expect(sessionPriority(TWO_DAY_WEEK)[0]).toBe('climb');
    const [oneDay] = layoutsFor(TWO_DAY_WEEK, { daysPerWeek: 1 }).filter((l) => l.name !== 'Recommended');
    expect(Object.values(oneDay!.slots)).toEqual(['climb']);
  });

  it('is shorter than anything the catalogue ships', () => {
    expect(TRIP_PREP.weeks).toBe(4);
    for (const program of PROGRAMS) {
      if (program.kind === 'mode') continue;
      expect(program.weeks, program.id).toBeGreaterThan(TRIP_PREP.weeks);
    }
  });

  // A four-week block whose last week is a taper must not also carry a
  // deload: that would leave two weeks of training in it.
  it('tapers instead of deloading', () => {
    expect(TRIP_PREP.deloadWeeks).toEqual([]);
    const taper = TRIP_PREP.phases[TRIP_PREP.phases.length - 1]!;
    expect(taper.weekStart).toBe(TRIP_PREP.weeks);
    expect(taper.name).toBe('Taper');
  });
});
