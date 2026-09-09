import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import { getMetric } from '@/content/metrics';
import { METRICS } from '@/content/metrics';
import type { MetricEntry } from '@/db/metrics';
import type { MetricId } from '@/content/types';
import {
  allMetrics,
  assessmentBattery,
  assessmentStatus,
  changeOf,
  formatEntry,
  isChartable,
  parseMetricInput,
  seriesFor,
  STALE_DAYS,
} from './assessments';
import { addDays } from './dates';

const TODAY = '2026-09-09';

function entry(metricId: MetricId, date: string, value: number, display?: string): MetricEntry {
  return { metricId, date, value, ...(display ? { display } : {}) };
}

describe('parseMetricInput', () => {
  it('reads a number', () => {
    expect(parseMetricInput(getMetric('max_pullups')!, ' 14 ')).toEqual({ ok: true, value: 14 });
  });

  it('rejects nonsense in a number field', () => {
    expect(parseMetricInput(getMetric('max_pullups')!, 'loads')).toMatchObject({ ok: false });
  });

  it('accepts a negative number — added weight can be assistance', () => {
    expect(parseMetricInput(getMetric('weighted_pullup_3rm')!, '-20')).toEqual({ ok: true, value: -20 });
  });

  it('stores a grade as its ladder position, with the canonical spelling', () => {
    expect(parseMetricInput(getMetric('max_boulder_grade')!, 'v7')).toEqual({
      ok: true,
      value: 7,
      display: 'V7',
    });
  });

  it('rejects a grade from the wrong ladder', () => {
    const result = parseMetricInput(getMetric('max_boulder_grade')!, '5.12a');
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining('V ladder') });
  });

  it('reads pass/fail loosely, since it is typed mid-session', () => {
    for (const yes of ['pass', 'P', 'yes', '1', 'true']) {
      expect(parseMetricInput(getMetric('wall_angel')!, yes)).toMatchObject({ value: 1, display: 'Pass' });
    }
    for (const no of ['fail', 'n', '0']) {
      expect(parseMetricInput(getMetric('wall_angel')!, no)).toMatchObject({ value: 0, display: 'Fail' });
    }
    expect(parseMetricInput(getMetric('wall_angel')!, 'sort of')).toMatchObject({ ok: false });
  });

  it('keeps a text metric verbatim and gives it no numeric meaning', () => {
    expect(parseMetricInput(getMetric('core_lever')!, 'advanced tuck / 8s')).toEqual({
      ok: true,
      value: 0,
      display: 'advanced tuck / 8s',
    });
    expect(isChartable(getMetric('core_lever')!)).toBe(false);
  });

  it('refuses an empty entry', () => {
    expect(parseMetricInput(getMetric('max_pullups')!, '   ')).toMatchObject({ ok: false });
  });
});

describe('formatEntry', () => {
  it('appends the unit to a bare number and trims noise', () => {
    expect(formatEntry(getMetric('core_plank')!, entry('core_plank', TODAY, 90))).toBe('90 sec');
    expect(formatEntry(getMetric('core_plank')!, entry('core_plank', TODAY, 90.25))).toBe('90.3 sec');
  });

  it('prefers the stored display when there is one', () => {
    expect(formatEntry(getMetric('max_boulder_grade')!, entry('max_boulder_grade', TODAY, 7, 'V7'))).toBe('V7');
  });
});

describe('changeOf', () => {
  const pullups = getMetric('max_pullups')!;

  it('needs two results', () => {
    expect(changeOf(pullups, [entry('max_pullups', TODAY, 10)])).toBeNull();
  });

  it('reports gain with a percentage', () => {
    const change = changeOf(pullups, [entry('max_pullups', '2026-08-01', 10), entry('max_pullups', TODAY, 13)]);
    expect(change).toMatchObject({ delta: 3, improved: true, label: '+3 reps' });
    expect(change!.percent).toBeCloseTo(30);
  });

  it('knows that lower is better for min edge', () => {
    const minEdge = getMetric('min_edge')!;
    const change = changeOf(minEdge, [entry('min_edge', '2026-08-01', 14), entry('min_edge', TODAY, 12)]);
    expect(change).toMatchObject({ improved: true, label: '−2 mm' });
  });

  it('counts grades in ladder steps, not percentages', () => {
    const change = changeOf(getMetric('max_boulder_grade')!, [
      entry('max_boulder_grade', '2026-08-01', 5, 'V5'),
      entry('max_boulder_grade', TODAY, 7, 'V7'),
    ]);
    expect(change).toMatchObject({ improved: true, percent: null, label: '+2 grades' });
  });

  it('says nothing improved when nothing moved', () => {
    const change = changeOf(pullups, [entry('max_pullups', '2026-08-01', 10), entry('max_pullups', TODAY, 10)]);
    expect(change).toMatchObject({ delta: 0, improved: null, label: 'no change' });
  });

  it('withholds a percentage rather than dividing by zero', () => {
    const change = changeOf(pullups, [entry('max_pullups', '2026-08-01', 0), entry('max_pullups', TODAY, 4)]);
    expect(change!.percent).toBeNull();
    expect(change!.improved).toBe(true);
  });

  it('has no opinion about a text metric', () => {
    expect(
      changeOf(getMetric('core_lever')!, [
        entry('core_lever', '2026-08-01', 0, 'tuck'),
        entry('core_lever', TODAY, 0, 'advanced tuck'),
      ]),
    ).toBeNull();
  });
});

describe('assessmentStatus', () => {
  it('calls an untested metric a baseline', () => {
    const s = assessmentStatus('max_pullups', [], { today: TODAY })!;
    expect(s).toMatchObject({ due: 'baseline', latest: null, daysSince: null });
  });

  it('leaves a recent result alone', () => {
    const s = assessmentStatus('max_pullups', [entry('max_pullups', addDays(TODAY, -10), 12)], { today: TODAY })!;
    expect(s.due).toBeNull();
    expect(s.daysSince).toBe(10);
  });

  it('calls a result stale after eight weeks off-program', () => {
    const old = addDays(TODAY, -STALE_DAYS);
    expect(assessmentStatus('max_pullups', [entry('max_pullups', old, 12)], { today: TODAY })!.due).toBe('stale');
    const fresher = addDays(TODAY, -(STALE_DAYS - 1));
    expect(assessmentStatus('max_pullups', [entry('max_pullups', fresher, 12)], { today: TODAY })!.due).toBeNull();
  });

  it('asks for a retest when the program moved into a new phase', () => {
    const program = getProgram('iron_grip')!;
    const secondPhase = program.phases[1]!;
    // Start the program so that today sits inside its second phase.
    const startDate = addDays(TODAY, -((secondPhase.weekStart - 1) * 7 + 3));
    const beforePhase = addDays(startDate, (secondPhase.weekStart - 1) * 7 - 2);

    const s = assessmentStatus('max_pullups', [entry('max_pullups', beforePhase, 12)], {
      program,
      startDate,
      today: TODAY,
    })!;
    expect(s.due).toBe('phase');
    expect(s.dueLabel).toContain(secondPhase.name);

    // A result inside the phase is current, even though it is the same week.
    const insidePhase = addDays(startDate, (secondPhase.weekStart - 1) * 7 + 1);
    expect(
      assessmentStatus('max_pullups', [entry('max_pullups', insidePhase, 12)], {
        program,
        startDate,
        today: TODAY,
      })!.due,
    ).toBeNull();
  });

  it('returns nothing for an id that is not in the registry', () => {
    expect(assessmentStatus('not_a_metric' as MetricId, [], { today: TODAY })).toBeNull();
  });
});

describe('assessmentBattery', () => {
  const program = getProgram('iron_grip')!;

  it('lists the active program battery even with no history', () => {
    const battery = assessmentBattery([], { program, today: TODAY });
    expect(battery.map((s) => s.metric.id).sort()).toEqual([...program.assessments].sort());
    expect(battery.every((s) => s.due === 'baseline')).toBe(true);
  });

  it('keeps metrics you have measured before, even off-program', () => {
    const battery = assessmentBattery([entry('toe_touch', addDays(TODAY, -5), 2)], { program, today: TODAY });
    expect(battery.map((s) => s.metric.id)).toContain('toe_touch');
    expect(program.assessments).not.toContain('toe_touch');
  });

  it('puts what is due first, and program metrics ahead of strays', () => {
    const fresh = addDays(TODAY, -2);
    const entries = [
      ...program.assessments.map((id) => entry(id, fresh, 1)),
      entry('toe_touch', addDays(TODAY, -100), 2),
    ];
    const battery = assessmentBattery(entries, { program, today: TODAY });
    expect(battery[0]!.metric.id).toBe('toe_touch');
    expect(battery[0]!.due).toBe('stale');
    expect(battery.slice(1).every((s) => s.due === null)).toBe(true);
  });

  it('works with no program at all', () => {
    const battery = assessmentBattery([entry('max_pullups', addDays(TODAY, -5), 12)], { today: TODAY });
    expect(battery).toHaveLength(1);
  });
});

describe('the registry itself', () => {
  it('exposes every metric, alphabetically, with grade metrics carrying a ladder', () => {
    const all = allMetrics();
    expect(all).toHaveLength(Object.keys(METRICS).length);
    expect(all.map((m) => m.label)).toEqual([...all.map((m) => m.label)].sort((a, b) => a.localeCompare(b)));
    for (const m of all) {
      if (m.kind === 'grade') expect(m.scale, `${m.id} needs a scale`).toBeDefined();
      expect(m.id).toBe(METRICS[m.id]!.id);
    }
  });

  it('every metric a program asks for exists', () => {
    for (const id of Object.values(METRICS)) expect(getMetric(id.id)).toBeDefined();
  });
});

describe('seriesFor', () => {
  it('filters to one metric and sorts oldest first', () => {
    const entries = [
      entry('max_pullups', '2026-09-01', 12),
      entry('core_plank', '2026-08-01', 90),
      entry('max_pullups', '2026-08-01', 10),
    ];
    expect(seriesFor(entries, 'max_pullups').map((e) => e.value)).toEqual([10, 12]);
  });
});

describe('the phase rule only applies to the program battery', () => {
  const program = getProgram('iron_grip')!;
  const secondPhase = program.phases[1]!;
  const startDate = addDays(TODAY, -((secondPhase.weekStart - 1) * 7 + 3));
  const beforePhase = addDays(startDate, (secondPhase.weekStart - 1) * 7 - 2);

  it('nags for a metric the program asks for', () => {
    expect(program.assessments).toContain('max_pullups');
    const s = assessmentStatus('max_pullups', [entry('max_pullups', beforePhase, 12)], {
      program,
      startDate,
      today: TODAY,
    })!;
    expect(s.due).toBe('phase');
  });

  it('leaves a benchmark of your own alone until it is genuinely stale', () => {
    expect(program.assessments).not.toContain('min_edge');
    const recent = assessmentStatus('min_edge', [entry('min_edge', beforePhase, 12)], {
      program,
      startDate,
      today: TODAY,
    })!;
    expect(recent.due).toBeNull();

    const ancient = assessmentStatus('min_edge', [entry('min_edge', addDays(TODAY, -STALE_DAYS), 12)], {
      program,
      startDate,
      today: TODAY,
    })!;
    expect(ancient.due).toBe('stale');
  });
});
