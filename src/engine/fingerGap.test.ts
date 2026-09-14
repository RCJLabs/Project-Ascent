import { beforeAll, describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/content/programs/catalogue';
import { loadPrograms } from '@/content/programs';
import { newSession, type Session } from '@/db/sessions';
import { buildTips } from './coach';
import { deriveClimberState } from './derive';
import { addDays } from './dates';
import {
  DIRECT_FINGER_RULES,
  FINGER_GAP_HOURS,
  fingerGaps,
  loadsFingersDirectly,
} from './fingerGap';

/**
 * The 48-hour rule, for the climbers the program rules cannot reach
 * (PLAN.md M160).
 */

const TODAY = '2026-03-30';

const at = (date: string, extra: Partial<Session> = {}): Session => ({
  ...newSession(date, 0),
  completed: true,
  rpe: 7,
  durationMin: 60,
  ...extra,
});

/** A General Training hangboard session — the case with no constraint above it. */
const hang = (date: string) => at(date, { programId: 'general_training', sessionTypeId: 'hb' });
const named = (date: string, name: string) => at(date, { exercises: [{ name }] as never });

beforeAll(async () => {
  await loadPrograms();
});

describe('what counts as a finger session', () => {
  it('reads the session type the climber picked', () => {
    expect(loadsFingersDirectly(hang(TODAY))).toBe(true);
  });

  it.each([
    'Max Hangs',
    '7/3 Repeaters',
    'Density Hangs',
    'Minimum Edge',
    'Campus ladders',
    'One-arm hang',
  ])('reads %s off the exercise', (name) => {
    expect(loadsFingersDirectly(named(TODAY, name))).toBe(true);
  });

  /**
   * The trap M132 recorded and this exists to avoid: `tissueLoad` gives
   * fingers to every climbing session by definition, so a gap computed that
   * way is a climbing gap and would tell a climber to stop climbing.
   */
  it('is not every session with climbs on it', () => {
    const climbing = at(TODAY, {
      climbs: [{ id: 'c', grade: 'V4', scale: 'V', count: 3, result: 'send' }] as never,
    });
    expect(loadsFingersDirectly(climbing)).toBe(false);
  });

  it.each(['ARC traverse', 'Linked laps', '4x4 circuit', 'Sloper pinch block'])(
    'is not %s, which is the low end on purpose',
    (name) => {
      expect(loadsFingersDirectly(named(TODAY, name))).toBe(false);
    },
  );

  it('is not a rest day, whatever is written on it', () => {
    const rest = at(TODAY, {
      exercises: [{ name: 'Max Hangs' }] as never,
      restChecklist: { slept: true } as never,
      climbs: [],
    });
    expect(loadsFingersDirectly(rest)).toBe(false);
  });

  it('is not a session that was never completed', () => {
    expect(loadsFingersDirectly({ ...hang(TODAY), completed: false })).toBe(false);
  });

  it('names only the three rules that mean deliberate finger loading', () => {
    // `sustained` and `open-hand` also carry `fingers`, and are left out for
    // the reason in the header. Pinned so widening it is a decision.
    expect([...DIRECT_FINGER_RULES].sort()).toEqual(['campus', 'fingers', 'one-arm']);
  });
});

describe('the gap itself', () => {
  const every = (gaps: number[]) => gaps.map((i) => hang(addDays(TODAY, -i)));

  it('counts consecutive days as a breach', () => {
    const found = fingerGaps(every([0, 1, 7, 8, 14, 21]), TODAY)!;
    expect(found.breaches).toBe(2);
    expect(found.tightestHours).toBe(24);
  });

  it('counts two on one day as the tightest there is', () => {
    // Two on today, plus a back-to-back pair, so the count clears the
    // threshold and the tightest is the pair that shared a day.
    const twice = [...every([0, 7, 8, 14, 21]), hang(TODAY)];
    const found = fingerGaps(twice, TODAY)!;
    expect(found.breaches).toBe(2);
    expect(found.tightestHours).toBe(0);
  });

  it('says nothing about a climber who spaces them properly', () => {
    expect(fingerGaps(every([0, 3, 7, 10, 14, 17, 21]), TODAY)).toBeNull();
  });

  it('needs more than one bad week', () => {
    // One breach in eight weeks is a week that went badly.
    expect(fingerGaps(every([0, 1, 7, 14, 21, 28]), TODAY)).toBeNull();
  });

  it('needs enough finger sessions for two to be a pattern', () => {
    expect(fingerGaps(every([0, 1, 2]), TODAY)).toBeNull();
  });

  it('looks at how you are training now, not two years ago', () => {
    const old = [90, 91, 97, 98, 104, 111].map((i) => hang(addDays(TODAY, -i)));
    expect(fingerGaps(old, TODAY)).toBeNull();
  });

  it('ignores sessions dated after today', () => {
    const ahead = [...every([0, 1, 7, 8, 14]), hang(addDays(TODAY, 3)), hang(addDays(TODAY, 4))];
    const found = fingerGaps(ahead, TODAY)!;
    // Five behind, two ahead — a planned session is not one that happened.
    expect(found.sessions).toBe(5);
    expect(found.breaches).toBe(2);
  });
});

describe('the tip', () => {
  const tips = (sessions: Session[], extra = {}) =>
    buildTips({
      state: deriveClimberState(sessions, { today: TODAY }),
      sessions,
      today: TODAY,
      ...extra,
    });

  const bad = [0, 1, 7, 8, 14, 21, 28].map((i) => hang(addDays(TODAY, -i)));

  it('speaks to a climber the program rules cannot reach', () => {
    const tip = tips(bad).find((t) => t.id === 'finger-gap');
    expect(tip, 'a mode climber hangboarding back to back was told nothing').toBeTruthy();
    expect(tip!.headline).toContain(`${FINGER_GAP_HOURS}-hour gap`);
    expect(tip!.body).toContain('Climbing on the days between is fine');
  });

  /**
   * And stands down where the program's own constraint is already being
   * checked — `planVsLog` says it with the program's own note attached,
   * which is the better sentence of the two.
   */
  it('goes quiet when planVsLog already said it', () => {
    const findings = [{ kind: 'spacing' } as never];
    expect(tips(bad, { findings }).map((t) => t.id)).not.toContain('finger-gap');
  });

  /**
   * Only a *spacing* finding stands it down. `planVsLog` reports six kinds,
   * and the other five are about different things entirely — being silenced
   * by a note about menus or deloads would be the tip going quiet for no
   * reason at all.
   */
  it('still speaks beside a finding about something else', () => {
    const findings = [{ kind: 'deload' } as never, { kind: 'menus' } as never];
    expect(tips(bad, { findings }).map((t) => t.id)).toContain('finger-gap');
  });

  /**
   * Home shows exactly one tip, so where this sits in the order is the
   * difference between a safety warning being read and being three taps
   * away. Above a plateau, which is about grades rather than tendons.
   */
  it('outranks the observations that are not about getting hurt', () => {
    const tip = tips(bad).find((t) => t.id === 'finger-gap')!;
    const plateau = tips(bad, {
      diagnosis: { verdict: 'plateau', explanation: 'flat', reset: { steps: [] } } as never,
    });
    expect(plateau[0]!.id, 'a stalled grade was shown instead').toBe('finger-gap');
    expect(tip.weight).toBeGreaterThan(88);
  });

  it('does not fire on a climber who spaces them properly', () => {
    const good = [0, 3, 7, 10, 14, 17, 21].map((i) => hang(addDays(TODAY, -i)));
    expect(tips(good).map((t) => t.id)).not.toContain('finger-gap');
  });
});

describe('the app and its own content', () => {
  /**
   * The number is not invented here. If a program ever asks for something
   * other than 48 hours between finger work, this default is the thing to
   * revisit — so it is held against the catalogue rather than a comment.
   */
  it('uses the gap its own programs ask for', () => {
    const hours = CATALOGUE.flatMap((p) =>
      p.constraints.filter((c) => c.kind === 'min-gap-hours').map((c) => c.hours),
    );
    expect(hours.length).toBeGreaterThanOrEqual(10);
    expect([...new Set(hours)]).toEqual([FINGER_GAP_HOURS]);
  });

  /**
   * And the prose that says it in the program that could not check it.
   *
   * **M166 closed this.** General Training stated the rule in a block's
   * rationale and declared no constraint, so the scheduler could place two
   * hangboard days back to back and `planVsLog` had nothing to check — which
   * is why this rule had to reach that climber from the logging side at all.
   * Both halves are pinned now: the prose that says it, and the constraint
   * that finally backs it. The rule here still earns its place, for the other
   * two programs and for every written one.
   */
  it('backs the rationale General Training writes out in words', () => {
    const gt = CATALOGUE.find((p) => p.id === 'general_training')!;
    const prose = gt.sessionTypes
      .flatMap((t) => t.blocks ?? [])
      .flatMap((b) => Object.values(b.perPhase))
      .map((p) => p?.rationale ?? '')
      .join(' ');
    expect(prose).toContain(`${FINGER_GAP_HOURS} hours between hangboard sessions`);
    const gap = gt.constraints.find((c) => c.kind === 'min-gap-hours');
    expect(gap, 'the constraint M166 added is gone again').toBeTruthy();
    if (gap?.kind !== 'min-gap-hours') throw new Error('unreachable: checked above');
    expect(gap.hours).toBe(FINGER_GAP_HOURS);
    expect(gap.between).toEqual(['hb']);
  });
});
