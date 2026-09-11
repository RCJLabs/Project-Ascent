import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '.';
import { TRIP_PREP, TWO_DAY_WEEK } from './catalogue';
import { validateProgram } from '@/engine/customProgram';
import { layoutsFor, planFromLayout, sessionPriority, validateWeek } from '@/engine/scheduler';
import { adaptProgram, lengthsFor } from '@/engine/adapt';
import { getMetric } from '@/content/metrics';
import { guideFor } from '@/content/guides';

/**
 * The two programs M58 drafted and M95 shipped.
 *
 * They were written, validated and deliberately kept out of `PROGRAMS`
 * until the person who coaches had read them — a program in the catalogue
 * is a coaching prescription, not a structure that validates. These are the
 * checks that were written while they were drafts, kept and inverted: they
 * now hold the two things each program exists to be, and the holes in the
 * catalogue they were written to fill.
 */

const NEW = [TWO_DAY_WEEK, TRIP_PREP];

describe('both are shipped', () => {
  it('is in the catalogue, so the finder can recommend one', () => {
    for (const draft of NEW) {
      expect(PROGRAMS.map((p) => p.id), draft.id).toContain(draft.id);
    }
  });

  it('has the guide a shipped program needs', () => {
    for (const draft of NEW) expect(guideFor(draft.id), draft.id).toBeDefined();
  });

  it('uses an id no other program uses', () => {
    const ids = PROGRAMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the drafts would be valid if they were', () => {
  it('passes the same validation a written program does', () => {
    for (const draft of NEW) {
      const errors = validateProgram(draft).filter((i) => i.level === 'error');
      expect(errors, draft.id).toEqual([]);
    }
  });

  it('names only metrics the app actually has', () => {
    for (const draft of NEW) {
      for (const id of draft.assessments) expect(getMetric(id), `${draft.id}/${id}`).toBeDefined();
    }
  });

  it('points its progression graph at programs that exist', () => {
    const ids = new Set(PROGRAMS.map((p) => p.id));
    for (const draft of NEW) {
      for (const next of draft.nextPrograms) expect(ids.has(next.id), `${draft.id} → ${next.id}`).toBe(true);
    }
  });

  it('prescribes every phase in every block', () => {
    for (const draft of NEW) {
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
    for (const draft of NEW) {
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
    for (const draft of NEW) {
      if (!draft.recommendedLayout) continue;
      const violations = validateWeek(draft, planFromLayout(draft.recommendedLayout));
      expect(violations.filter((v) => v.severity === 'error'), draft.id).toEqual([]);
    }
  });

  it('can be laid out on any number of days without breaking a hard rule', () => {
    for (const draft of NEW) {
      for (const days of [1, 2, 3, 4, 5]) {
        for (const layout of layoutsFor(draft, { daysPerWeek: days })) {
          const errors = validateWeek(draft, planFromLayout(layout)).filter((v) => v.severity === 'error');
          expect(errors, `${draft.id}@${days}/${layout.name}`).toEqual([]);
        }
      }
    }
  });

  it('adapts to every length it would offer', () => {
    for (const draft of NEW) {
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
    // The hole it was written to fill: onboarding offers two days a week,
    // and before this the lowest anything asked for was three, so every
    // recommendation a two-day climber saw carried a caution.
    const lowest = Math.min(
      ...PROGRAMS.flatMap((p) => {
        const rule = p.constraints.find((c) => c.kind === 'sessions-per-week');
        return rule?.kind === 'sessions-per-week' ? [rule.min] : [];
      }),
    );
    expect(lowest).toBe(2);
  });

  /**
   * The coach's call (PLAN.md M95). The first draft spent one of the two
   * days on strength, so a two-day climber climbed once a week for twelve
   * weeks; both committed days climb now, and the strength work rides with
   * them.
   */
  it('spends both committed days on climbing', () => {
    const committed = TWO_DAY_WEEK.sessionTypes.filter((t) => (t.priority ?? 99) <= 2);
    expect(committed.map((t) => t.id)).toEqual(['climb', 'build']);
    for (const type of committed) {
      expect(type.blocks?.[0]?.name, type.id).toBe('Climbing');
    }
    // And the work that used to own a day still happens once a week.
    const blocks = committed.flatMap((t) => (t.blocks ?? []).map((b) => b.id));
    for (const id of ['fingers', 'pull', 'protect']) {
      expect(blocks.filter((b) => b === id), id).toHaveLength(1);
    }
  });

  it('keeps the climbing day when a two-day week becomes one', () => {
    expect(sessionPriority(TWO_DAY_WEEK)[0]).toBe('climb');
    const [oneDay] = layoutsFor(TWO_DAY_WEEK, { daysPerWeek: 1 }).filter((l) => l.name !== 'Recommended');
    expect(Object.values(oneDay!.slots)).toEqual(['climb']);
  });

  it('is the shortest block the catalogue ships', () => {
    expect(TRIP_PREP.weeks).toBe(4);
    for (const program of PROGRAMS) {
      if (program.kind === 'mode' || program.id === TRIP_PREP.id) continue;
      expect(program.weeks, program.id).toBeGreaterThan(TRIP_PREP.weeks);
    }
  });

  /**
   * The coach's call (PLAN.md M95). A four-week block resolves its test
   * weeks to weeks 1 and 4 — and week 4 is the taper, which exists to keep
   * a climber *off* a maximum effort. So it measures nothing.
   */
  it('asks for no test, because its last week is a taper', () => {
    expect(TRIP_PREP.assessments).toEqual([]);
  });

  // Above beginner, on the coach's call: a taper only means something when
  // there is a season's worth of form to protect.
  it('starts above beginner', () => {
    expect(TRIP_PREP.gradeRange.min).toBe('V3');
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
