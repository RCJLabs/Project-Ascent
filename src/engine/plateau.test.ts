import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { getDrill } from '@/content/drills';
import type { MetricEntry } from '@/db/metrics';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { diagnose, RULES, type DiagnosisInput } from './plateau';

const TODAY = '2026-09-09';
let counter = 0;

interface Spec {
  date: string;
  grades?: { grade: string; count?: number; result?: 'send' | 'attempt' }[];
  rpe?: number;
  minutes?: number;
  drillId?: string;
}

function make({ date, grades = [], rpe = 7, minutes = 75, drillId }: Spec): Session {
  return newSession(date, counter++, {
    completed: true,
    rpe,
    durationMin: minutes,
    warmup: true,
    ...(drillId ? { drillId, drillDone: true } : {}),
    climbs: grades.map((g) => ({
      id: `c${counter++}`,
      grade: g.grade,
      scale: 'V' as const,
      count: g.count ?? 1,
      result: g.result ?? ('send' as const),
    })),
  });
}

/** Twelve weeks of three sessions a week, all topping out at `ceiling`. */
function steadyHistory(ceiling: string, weeks = 12, extra: Partial<Spec> = {}): Session[] {
  const sessions: Session[] = [];
  for (let w = weeks; w >= 1; w--) {
    for (const offset of [0, 3, 5]) {
      sessions.push(
        make({
          date: addDays(TODAY, -(w * 7) + offset),
          grades: [
            { grade: 'V3', count: 4 },
            { grade: ceiling, count: 2 },
            { grade: 'V6', count: 5, result: 'attempt' },
          ],
          ...extra,
        }),
      );
    }
  }
  return sessions;
}

function run(sessions: Session[], patch: Partial<DiagnosisInput> = {}) {
  const state = deriveClimberState(sessions, { today: TODAY });
  return diagnose({ state, sessions, today: TODAY, ...patch });
}

describe('insufficient data', () => {
  it('says so rather than guessing from three sessions', () => {
    const sessions = [
      make({ date: addDays(TODAY, -5), grades: [{ grade: 'V3' }] }),
      make({ date: addDays(TODAY, -3), grades: [{ grade: 'V3' }] }),
    ];
    const d = run(sessions);
    expect(d.verdict).toBe('insufficient-data');
    expect(d.evidence).toContainEqual({ label: 'Sessions logged', value: `2 of ${RULES.minSessions}` });
  });

  it('also refuses on a month of history that is only a few sessions', () => {
    const sessions = [
      make({ date: addDays(TODAY, -40), grades: [{ grade: 'V3' }] }),
      make({ date: addDays(TODAY, -5), grades: [{ grade: 'V3' }] }),
    ];
    expect(run(sessions).verdict).toBe('insufficient-data');
  });
});

describe('the recovery override', () => {
  it('outranks a breakthrough', () => {
    // A record two days ago would otherwise read as breaking through.
    const sessions = [...steadyHistory('V5'), make({ date: addDays(TODAY, -2), grades: [{ grade: 'V7' }] })];
    expect(run(sessions).verdict).toBe('breakthrough');
    expect(run(sessions, { injuries: ['shoulder'] }).verdict).toBe('recovery-compromised');
  });

  it('outranks a plateau', () => {
    const sessions = steadyHistory('V5');
    expect(run(sessions).verdict).toBe('plateau');
    expect(run(sessions, { injuries: ['pulley'] }).verdict).toBe('recovery-compromised');
  });

  it('fires on a load spike', () => {
    // A quiet baseline, then a very heavy final week.
    const sessions = steadyHistory('V5');
    for (const back of [0, 1, 3]) {
      sessions.push(make({ date: addDays(TODAY, -back), grades: [{ grade: 'V3' }], rpe: 10, minutes: 240 }));
    }
    const d = run(sessions);
    expect(d.verdict).toBe('recovery-compromised');
    expect(d.explanation).toContain('your baseline');
  });

  it('fires on five straight training days', () => {
    const sessions = steadyHistory('V5');
    for (let back = 0; back < RULES.consecutiveDays; back++) {
      sessions.push(make({ date: addDays(TODAY, -back), grades: [{ grade: 'V3' }], rpe: 6, minutes: 45 }));
    }
    const d = run(sessions);
    expect(d.verdict).toBe('recovery-compromised');
    expect(d.evidence).toContainEqual({
      label: 'Consecutive training days',
      value: String(RULES.consecutiveDays),
    });
  });

  it('leaves out a zero-day streak rather than printing it as evidence', () => {
    const d = run(steadyHistory('V5'), { injuries: ['wrist'] });
    expect(d.evidence.map((e) => e.label)).not.toContain('Consecutive training days');
  });

  it('names every reason it fired, not just the first', () => {
    const sessions = steadyHistory('V5');
    for (let back = 0; back < RULES.consecutiveDays; back++) {
      sessions.push(make({ date: addDays(TODAY, -back), grades: [{ grade: 'V3' }] }));
    }
    const d = run(sessions, { injuries: ['elbow'] });
    expect(d.explanation).toContain('elbow');
    expect(d.explanation).toContain('training days deep');
  });
});

describe('breakthrough', () => {
  it('fires on a record inside three weeks', () => {
    const sessions = [
      ...steadyHistory('V5'),
      make({ date: addDays(TODAY, -10), grades: [{ grade: 'V7' }] }),
    ];
    const d = run(sessions);
    expect(d.verdict).toBe('breakthrough');
    expect(d.explanation).toContain('V7');
    expect(d.reset).toBeUndefined();
  });

  it('stops counting once the record is old', () => {
    const sessions = [
      ...steadyHistory('V5'),
      make({ date: addDays(TODAY, -(RULES.prIsRecentDays + 1)), grades: [{ grade: 'V7' }] }),
    ];
    expect(run(sessions).verdict).toBe('optimal');
  });
});

describe('plateau', () => {
  const sessions = steadyHistory('V5');

  it('needs both a flat line and real volume', () => {
    expect(run(sessions).verdict).toBe('plateau');

    // Same flat line, barely training: not a plateau, and no reset offered.
    const quiet = [
      ...steadyHistory('V5', 12).filter((s) => s.date < addDays(TODAY, -30)),
      make({ date: addDays(TODAY, -20), grades: [{ grade: 'V3' }] }),
    ];
    const d = run(quiet);
    expect(d.verdict).toBe('optimal');
    expect(d.headline).toBe('Ticking over');
    expect(d.reset).toBeUndefined();
  });

  it('locates the grade you keep failing on', () => {
    const d = run(sessions);
    expect(d.evidence).toContainEqual({ label: 'V6 conversion', value: '0 sent from 180 tries' });
  });

  it('always carries a reset protocol, and it is seven days long', () => {
    const reset = run(sessions).reset!;
    expect(reset).toBeDefined();
    expect(reset.steps.map((s) => s.days)).toEqual(['Days 1–2', 'Days 3–5', 'Day 6', 'Day 7']);
    expect(reset.steps[0]!.detail).toContain('rest');
  });
});

describe('the reset protocol', () => {
  it('picks a drill from the category the logs show least, and names it', () => {
    // Every drill logged is a technique drill, so technique must not be the
    // suggestion.
    const techniqueDrill = getDrill('bc_silent_feet') ?? null;
    const sessions = steadyHistory('V5', 12, techniqueDrill ? { drillId: techniqueDrill.id } : {});
    const reset = run(sessions, { equipment: ['wall', 'gym'] }).reset!;
    const novel = reset.steps[2]!;
    expect(novel.title).toMatch(/^One novel stimulus: /);
    if (techniqueDrill) expect(novel.detail).not.toContain('Movement quality, footwork');
  });

  it('explains that a category is entirely untrained when it is', () => {
    const reset = run(steadyHistory('V5')).reset!;
    expect(reset.steps[2]!.detail).toContain('no drill from this category at all');
  });

  it('retests the program benchmark that has gone longest without a number', () => {
    const program = getProgram('iron_grip')!;
    const metrics: MetricEntry[] = program.assessments
      .filter((id) => id !== 'dead_hang')
      .map((id) => ({ metricId: id, date: addDays(TODAY, -3), value: 10 }));
    const reset = run(steadyHistory('V5'), { program, metrics }).reset!;
    expect(reset.steps[3]!.title).toBe('One retest: Dead Hang');
    expect(reset.steps[3]!.detail).toContain('never taken a baseline');
  });

  it('prefers the oldest measured benchmark when all have baselines', () => {
    const program = getProgram('iron_grip')!;
    const metrics: MetricEntry[] = program.assessments.map((id) => ({
      metricId: id,
      date: addDays(TODAY, id === 'max_pullups' ? -120 : -3),
      value: 10,
    }));
    const reset = run(steadyHistory('V5'), { program, metrics }).reset!;
    expect(reset.steps[3]!.title).toBe('One retest: Max Pull-Ups');
    expect(reset.steps[3]!.detail).toContain('17 weeks ago');
  });

  it('falls back to a grade retest with no program battery', () => {
    const reset = run(steadyHistory('V5')).reset!;
    expect(reset.steps[3]!.title).toBe('One retest: V6');
    expect(reset.steps[3]!.detail).toContain('Three fresh attempts');
  });
});

describe('optimal', () => {
  it('reads as building when the volume is there', () => {
    const sessions = [
      ...steadyHistory('V5'),
      make({ date: addDays(TODAY, -30), grades: [{ grade: 'V7' }] }),
    ];
    const d = run(sessions);
    expect(d.verdict).toBe('optimal');
    expect(d.headline).toBe('Building');
  });
});

describe('every verdict', () => {
  const cases: Session[][] = [
    [make({ date: addDays(TODAY, -2), grades: [{ grade: 'V3' }] })],
    steadyHistory('V5'),
    [...steadyHistory('V5'), make({ date: addDays(TODAY, -5), grades: [{ grade: 'V7' }] })],
  ];

  it('always states a headline, an explanation and at least one number', () => {
    for (const sessions of [...cases, cases[1]!]) {
      for (const injuries of [[], ['wrist' as const]]) {
        const d = run(sessions, { injuries });
        expect(d.headline.length).toBeGreaterThan(0);
        expect(d.explanation.length).toBeGreaterThan(20);
        expect(d.evidence.length).toBeGreaterThan(0);
        for (const item of d.evidence) expect(item.value).not.toBe('');
      }
    }
  });

  it('only ever attaches a reset to a plateau', () => {
    for (const sessions of cases) {
      for (const injuries of [[], ['wrist' as const]]) {
        const d = run(sessions, { injuries });
        expect(d.reset === undefined).toBe(d.verdict !== 'plateau');
      }
    }
  });
});
