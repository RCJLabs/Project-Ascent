import { describe, expect, it } from 'vitest';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { addDays, today } from './dates';
import { deriveClimberState } from './derive';
import {
  BACKUP_INTERVAL_DAYS,
  BURN_RUNGS,
  DETRAINING_ACWR,
  LAYOFF_DAYS,
  STEEP_ACWR,
  OUTDOOR_GAP_DAYS,
  buildTips,
  visibleTips,
  type CoachInput,
} from './coach';

const TODAY = today();
const back = (n: number) => addDays(TODAY, -n);

function session(date: string, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#${patch.mode === 'outdoor' ? 1 : 0}`,
    date, planned: false, completed: true, rewarded: true, mode: 'indoor',
    rpe: 7, durationMin: 90, warmup: true, climbs: [],
    createdAt: `${date}T12:00:00.000Z`, updatedAt: `${date}T12:00:00.000Z`,
    ...patch,
  };
}

/** A steady, unremarkable history: enough to be read, nothing to flag. */
function steady(weeks = 8, patch: Partial<Session> = {}): Session[] {
  const out: Session[] = [];
  for (let w = weeks; w >= 0; w--) {
    for (const off of [0, 2, 4]) {
      const date = back(w * 7 - off);
      if (date > TODAY) continue;
      out.push(session(date, {
        climbs: [{ id: `c${w}${off}`, grade: 'V4', scale: 'V', count: 5, result: 'send', style: 'flash' }],
        drillId: 'd', drillDone: true,
        ...patch,
      }));
    }
  }
  return out;
}

function tips(input: Partial<CoachInput> & { sessions: Session[] }) {
  const state = deriveClimberState(input.sessions, { today: TODAY });
  return buildTips({ state, today: TODAY, ...input });
}
const ids = (list: { id: string }[]) => list.map((t) => t.id);

describe('an empty log', () => {
  it('asks for the one thing that would help', () => {
    const list = tips({ sessions: [] });
    expect(ids(list)).toContain('first-session');
    expect(list[0]!.id).toBe('first-session');
  });

  it('stops asking once there is a session', () => {
    expect(ids(tips({ sessions: [session(TODAY)] }))).not.toContain('first-session');
  });
});

describe('project escalation', () => {
  const project: Project = {
    id: 'p1', name: 'The Nose', grade: 'V7', scale: 'V', setting: 'indoor',
    status: 'active', beta: [], createdAt: back(60), updatedAt: back(1),
  };
  const burning = (count: number, highPoint?: number) => [
    session(back(3), {
      projectAttempts: [{ id: 'a1', projectId: 'p1', outcome: 'fell-high', count, ...(highPoint !== undefined ? { highPoint } : {}) }],
    }),
  ];

  it('says nothing below the first rung', () => {
    expect(ids(tips({ sessions: burning(BURN_RUNGS[0] - 1), projects: [project] }))).not.toContain('burns:p1');
  });

  it('speaks up at the first rung', () => {
    const tip = tips({ sessions: burning(BURN_RUNGS[0]), projects: [project] }).find((t) => t.id === 'burns:p1');
    expect(tip?.headline).toContain('5 burns on The Nose');
  });

  // Dismissing "ten burns" must not also hide the twentieth.
  it('returns at the next rung after being dismissed', () => {
    const at10 = tips({ sessions: burning(10), projects: [project] }).find((t) => t.id === 'burns:p1')!;
    const dismissed = { [at10.id]: at10.signature };
    expect(visibleTips([at10], dismissed)).toEqual([]);

    const at20 = tips({ sessions: burning(20), projects: [project] }).find((t) => t.id === 'burns:p1')!;
    expect(visibleTips([at20], dismissed)).toEqual([at20]);
  });

  it('says something different when no high point was recorded', () => {
    const worked = [session(back(3), { projectAttempts: [{ id: 'a1', projectId: 'p1', outcome: 'worked', count: 12 }] })];
    const tip = tips({ sessions: worked, projects: [project] }).find((t) => t.id === 'burns:p1');
    expect(tip?.body).toContain('No high point recorded');
  });

  it('reports the best high point, not the last', () => {
    const mixed = [
      session(back(9), { projectAttempts: [{ id: 'a1', projectId: 'p1', outcome: 'fell-high', count: 6, highPoint: 88 }] }),
      session(back(2), { projectAttempts: [{ id: 'a2', projectId: 'p1', outcome: 'fell-low', count: 4, highPoint: 20 }] }),
    ];
    expect(tips({ sessions: mixed, projects: [project] }).find((t) => t.id === 'burns:p1')?.body).toContain('88%');
  });

  it('ignores a project that has been sent', () => {
    const sent: Project = { ...project, status: 'sent' };
    expect(ids(tips({ sessions: burning(20), projects: [sent] }))).not.toContain('burns:p1');
  });

  // A list of loud projects is a to-do list, not advice.
  it('never names more than two at once', () => {
    const many = ['p1', 'p2', 'p3', 'p4'].map((id): Project => ({ ...project, id, name: id }));
    const burns = [session(back(3), {
      projectAttempts: many.map((p, i) => ({ id: `a${i}`, projectId: p.id, outcome: 'fell-high' as const, count: 22 })),
    })];
    expect(tips({ sessions: burns, projects: many }).filter((t) => t.id.startsWith('burns:'))).toHaveLength(2);
  });
});

describe('time away from rock', () => {
  it('says nothing to someone who has never been outdoors', () => {
    expect(ids(tips({ sessions: steady() }))).not.toContain('outdoor-reentry');
  });

  it('waits until the gap is real', () => {
    const recent = [...steady(), session(back(OUTDOOR_GAP_DAYS - 1), { mode: 'outdoor' })];
    expect(ids(tips({ sessions: recent }))).not.toContain('outdoor-reentry');
  });

  it('speaks up past the gap, and grows with it', () => {
    const stale = [...steady(), session(back(120), { mode: 'outdoor' })];
    const tip = tips({ sessions: stale }).find((t) => t.id === 'outdoor-reentry');
    expect(tip?.headline).toContain('120 days');
    expect(tip?.signature).toBe('90');

    const older = [...steady(), session(back(400), { mode: 'outdoor' })];
    expect(tips({ sessions: older }).find((t) => t.id === 'outdoor-reentry')?.signature).toBe('180');
  });
});

describe('load drifting down', () => {
  it('flags a ratio below the floor', () => {
    // Twelve steady weeks, then one thin week: enough training days left in
    // the month for the ratio to compute, but well under the baseline.
    const thin = [...steady(12).filter((s) => s.date < back(9)), session(back(2))];
    const state = deriveClimberState(thin, { today: TODAY });
    expect(state.load.acwr).not.toBeNull();
    expect(state.load.acwr!).toBeLessThan(DETRAINING_ACWR);

    const tip = tips({ sessions: thin }).find((t) => t.id === 'detraining');
    expect(tip?.headline).toBe('Training has dropped off');
    expect(tip?.tone).toBe('caution');
  });

  // The density guard in derive.ts needs six training days in the last month,
  // so a real layoff makes the ratio null — silent exactly when it matters
  // most. The gap is read directly for that reason.
  it('still speaks when the layoff has silenced the ratio', () => {
    const stopped = steady(12).filter((s) => s.date < back(20));
    expect(deriveClimberState(stopped, { today: TODAY }).load.acwr).toBeNull();

    const tip = tips({ sessions: stopped }).find((t) => t.id === 'detraining');
    expect(tip?.headline).toContain('days since you trained');
    expect(tip?.signature).toBe('fortnight');
  });

  it('grows its signature with the layoff, so a dismissal does not last forever', () => {
    const long = steady(20).filter((s) => s.date < back(70));
    expect(tips({ sessions: long }).find((t) => t.id === 'detraining')?.signature).toBe('long');
  });

  it('does not count logged rest days as training', () => {
    const rested = [
      ...steady(12).filter((s) => s.date < back(LAYOFF_DAYS + 4)),
      session(back(1), { climbs: [], restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true } }),
    ];
    expect(ids(tips({ sessions: rested }))).toContain('detraining');
  });

  /**
   * The direction that hurts people (PLAN.md M46).
   *
   * ACWR was computed, the bands were named, the chart painted optimal,
   * caution and danger, and the XP brake withheld the effort bonus above
   * 1.3. The coach — the app's only proactive voice, which speaks about
   * plateaus, backups, stale benchmarks and losing fitness — said nothing at
   * all when the ratio climbed.
   */
  describe('a load spike', () => {
    /** Two steady months, then a week at several times the baseline. */
    const ramp = (perDay: number): Session[] => {
      const base = steady(10).filter((s) => s.date < back(7));
      const spike: Session[] = [];
      for (let d = 6; d >= 0; d--) {
        for (let i = 0; i < perDay; i++) {
          spike.push(session(back(d), { id: `${back(d)}#s${i}`, rpe: 9, durationMin: 150 }));
        }
      }
      return [...base, ...spike];
    };

    it('says so, and names the number', () => {
      const sessions = ramp(2);
      const state = deriveClimberState(sessions, { today: TODAY });
      expect(state.load.zone, 'the fixture is not actually a spike').toBe('danger');

      const tip = tips({ sessions }).find((t) => t.id === 'load-spike');
      expect(tip, 'the coach is silent on the one direction that injures people').toBeDefined();
      expect(tip!.tone).toBe('caution');
      expect(tip!.body).toContain(state.load.acwr!.toFixed(2));
    });

    it('separates ramping quickly from a spike, so a dismissal does not cover both', () => {
      const spike = tips({ sessions: ramp(2) }).find((t) => t.id === 'load-spike');
      expect(spike!.signature).toMatch(/^danger/);
    });

    it('speaks again when a dismissed spike keeps climbing', () => {
      // A dismissal is "I have read this", not "I have handled it".
      const steep = ramp(4);
      const state = deriveClimberState(steep, { today: TODAY });
      expect(state.load.acwr!, 'the fixture is not steep enough to test this').toBeGreaterThan(STEEP_ACWR);
      const tip = tips({ sessions: steep }).find((t) => t.id === 'load-spike')!;
      expect(tip.signature).toBe('danger-steep');
      expect(visibleTips([tip], { 'load-spike': 'danger' })).toHaveLength(1);
    });

    it('outranks the tips that are only interesting', () => {
      // A backup nudge and a streak compliment are not the thing to lead
      // with in the week someone is most likely to get hurt.
      const list = tips({ sessions: ramp(2) });
      const spike = list.findIndex((t) => t.id === 'load-spike');
      expect(spike).toBeGreaterThanOrEqual(0);
      expect(spike, 'a spike should be near the top of the list').toBeLessThan(2);
    });

    it('stays quiet inside a planned deload', () => {
      // A deload week is a deliberate change of load, and the ratio moving
      // is the point of it.
      const sessions = ramp(2).map((s) => ({ ...s, deload: true }));
      expect(ids(tips({ sessions }))).not.toContain('load-spike');
    });

    it('stays quiet when the ratio is fine', () => {
      expect(ids(tips({ sessions: steady(12) }))).not.toContain('load-spike');
    });
  });

  it('stays quiet while the ratio is healthy', () => {
    const state = deriveClimberState(steady(12), { today: TODAY });
    expect(state.load.acwr).toBeGreaterThanOrEqual(DETRAINING_ACWR);
    expect(ids(tips({ sessions: steady(12) }))).not.toContain('detraining');
  });

  it('never fires during a planned deload, which explains the dip', () => {
    const dropped = steady(12).filter((s) => s.date < back(14));
    const state = deriveClimberState(dropped, { today: TODAY, deloadDates: new Set([TODAY]) });
    expect(buildTips({ state, sessions: dropped, today: TODAY }).map((t) => t.id)).not.toContain('detraining');
  });
});

describe('gaps in the training', () => {
  it('names a gap only once there is enough history for it to be a choice', () => {
    const few = steady(1, { restChecklist: undefined });
    expect(ids(tips({ sessions: few }))).not.toContain('domain:rest');
  });

  it('names no rest days over a long log', () => {
    expect(ids(tips({ sessions: steady(10) }))).toContain('domain:rest');
  });

  // Five things you are not doing reads as an indictment, and nobody acts
  // on an indictment.
  it('names one gap at a time', () => {
    const bare = steady(12).map((s) => ({ ...s, drillDone: false, climbs: [] }));
    expect(tips({ sessions: bare }).filter((t) => t.id.startsWith('domain:'))).toHaveLength(1);
  });
});

describe('late sessions', () => {
  const at = (date: string, hour: number) =>
    session(date, { startedAt: new Date(`${date}T${String(hour).padStart(2, '0')}:30:00`).toISOString() });

  it('needs enough timed sessions to see a pattern', () => {
    const two = [at(back(1), 22), at(back(3), 22)];
    expect(ids(tips({ sessions: two }))).not.toContain('late-sessions');
  });

  it('flags a run of them', () => {
    const late = [at(back(1), 22), at(back(3), 21), at(back(5), 23), at(back(7), 18)];
    expect(ids(tips({ sessions: late }))).toContain('late-sessions');
  });

  it('leaves a daytime climber alone', () => {
    const day = [at(back(1), 18), at(back(3), 12), at(back(5), 17), at(back(7), 9)];
    expect(ids(tips({ sessions: day }))).not.toContain('late-sessions');
  });

  it('ignores sessions that were never timed', () => {
    expect(ids(tips({ sessions: steady() }))).not.toContain('late-sessions');
  });
});

describe('backups', () => {
  it('waits until there is something worth losing', () => {
    expect(ids(tips({ sessions: steady(1) }))).not.toContain('backup');
  });

  it('says so when there has never been one', () => {
    const tip = tips({ sessions: steady(10) }).find((t) => t.id === 'backup');
    expect(tip?.headline).toContain('never exported');
    expect(tip?.signature).toBe('never');
  });

  it('goes quiet after a recent export and returns after the interval', () => {
    const fresh = tips({ sessions: steady(10), lastExportAt: back(3) });
    expect(ids(fresh)).not.toContain('backup');

    const old = tips({ sessions: steady(10), lastExportAt: back(BACKUP_INTERVAL_DAYS + 1) });
    expect(ids(old)).toContain('backup');
  });
});

describe('the board as a whole', () => {
  it('puts the loudest first', () => {
    const list = tips({ sessions: steady(10) });
    expect(list.map((t) => t.weight)).toEqual([...list.map((t) => t.weight)].sort((a, b) => b - a));
  });

  it('carries an action wherever there is something to do', () => {
    for (const tip of tips({ sessions: steady(10) })) {
      if (tip.tone !== 'good' && tip.id !== 'late-sessions') expect(tip.action).toBeDefined();
    }
  });

  it('has no id colliding with a weekly review note', () => {
    // The review owns the week; this owns the standing picture. An id in
    // both would mean the same words twice on two screens.
    const reviewIds = ['injury', 'spike', 'no-rest', 'record', 'project', 'burning', 'warmup', 'streak-note', 'blank', 'short', 'drills', 'steady'];
    for (const tip of tips({ sessions: steady(10) })) expect(reviewIds).not.toContain(tip.id);
  });
});
