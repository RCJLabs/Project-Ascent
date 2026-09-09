import { describe, expect, it } from 'vitest';
import type { GameXpEntry } from '@/db/game';
import { newProject, type Project } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';
import { AWARDS, GAME_ACTION_CAP, LEVEL_UNIT, MULTIPLIERS, levelFor, unitsToXp } from './economy';
import { CURRENCY_RATE, deriveXp } from './xp';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 6, durationMin: 60, ...patch });
}
function climb(grade: string, patch: Partial<Session['climbs'][number]> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count: 1,
    result: 'send' as const,
    ...patch,
  };
}

describe('deriving XP instead of banking it', () => {
  it('is idempotent by construction — the same log always gives the same total', () => {
    const sessions = [session(addDays(TODAY, -5)), session(addDays(TODAY, -2))];
    const a = deriveXp({ sessions });
    const b = deriveXp({ sessions });
    expect(b.total).toBe(a.total);
    // The property the prototype needed a `rewarded` flag to fake: there is
    // no payment to repeat, so replaying cannot double-count.
    expect(deriveXp({ sessions: [...sessions] }).total).toBe(a.total);
  });

  it('corrects itself when a session is edited or removed', () => {
    const first = session(addDays(TODAY, -5));
    const second = session(addDays(TODAY, -2));
    const both = deriveXp({ sessions: [first, second] }).total;
    expect(deriveXp({ sessions: [first] }).total).toBeLessThan(both);

    const warmed = { ...second, warmup: true };
    expect(deriveXp({ sessions: [first, warmed] }).total).toBeGreaterThan(both);
  });

  it('ignores sessions that are not complete', () => {
    expect(deriveXp({ sessions: [session(TODAY, { completed: false })] }).total).toBe(0);
  });

  it('is empty, not broken, with nothing logged', () => {
    const state = deriveXp({});
    expect(state).toMatchObject({ total: 0, real: 0, game: 0, earned: 0 });
    expect(state.rank.title).toBe('Newcomer');
    expect(state.progress.level).toBe(0);
  });
});

describe('session XP', () => {
  it('breaks a session into the lines that produced it', () => {
    const s = session(TODAY, { rpe: 8, warmup: true, climbs: [climb('V4')] });
    const state = deriveXp({ sessions: [s] });
    const detail = state.bySession[s.id]!;
    // The V4 is also a first-ever send, so the record line belongs here too.
    expect(detail.lines.map((l) => l.label)).toEqual([
      'Session completed',
      'Warmed up',
      '1× V4',
      'First V4',
    ]);
    expect(detail.xp).toBe(detail.lines.reduce((sum, l) => sum + l.xp, 0));
    expect(state.total).toBe(detail.xp);
  });

  it('applies the session multiplier to session lines but not to a record', () => {
    const s = session(TODAY, { rpe: 10, climbs: [climb('V4')] });
    const detail = deriveXp({ sessions: [s] })!.bySession[s.id]!;
    const record = detail.lines.find((l) => l.label === 'First V4')!;
    expect(record.xp).toBe(unitsToXp(AWARDS.personalRecord));
    const base = detail.lines.find((l) => l.label === 'Session completed')!;
    expect(base.xp).toBe(Math.round(unitsToXp(AWARDS.session) * 1.5));
  });

  it('brakes the effort bonus using the load you carried that day, not today', () => {
    // Three quiet weeks, then one enormous week: the last session is priced
    // against a spiked ACWR, the earlier ones are not.
    const quiet = Array.from({ length: 12 }, (_, i) =>
      session(addDays(TODAY, -(30 - i * 2)), { rpe: 8, durationMin: 45 }),
    );
    const spike = [0, 1, 2, 3].map((back) =>
      session(addDays(TODAY, -back), { rpe: 8, durationMin: 240 }),
    );
    const state = deriveXp({ sessions: [...quiet, ...spike] });
    expect(state.bySession[quiet[0]!.id]!.reward.effort).toBe(1.2);
    expect(state.bySession[spike[0]!.id]!.reward.effort).toBe(1);
    expect(state.bySession[spike[0]!.id]!.reward.effortBraked).toBe(true);
  });
});

describe('records', () => {
  it('pays only for a grade harder than anything sent before', () => {
    const hard = session(addDays(TODAY, -10), { climbs: [climb('V6')] });
    const easy = session(addDays(TODAY, -2), { climbs: [climb('V2')] });
    const state = deriveXp({ sessions: [hard, easy] });
    expect(state.bySession[hard.id]!.lines.some((l) => l.label === 'First V6')).toBe(true);
    // A V2 climbed after a V6 is not a record, whatever the timeline says.
    expect(state.bySession[easy.id]!.lines.some((l) => l.label.startsWith('First'))).toBe(false);
  });

  it('keeps the two ladders separate', () => {
    const boulder = session(addDays(TODAY, -10), { climbs: [climb('V6')] });
    const route = session(addDays(TODAY, -2), { climbs: [climb('5.10a')] });
    const state = deriveXp({ sessions: [boulder, route] });
    expect(state.bySession[route.id]!.lines.some((l) => l.label === 'First 5.10a')).toBe(true);
  });

  it('reads sessions in date order however they arrive', () => {
    const hard = session(addDays(TODAY, -2), { climbs: [climb('V6')] });
    const easy = session(addDays(TODAY, -10), { climbs: [climb('V2')] });
    const state = deriveXp({ sessions: [hard, easy] });
    expect(state.bySession[easy.id]!.lines.some((l) => l.label === 'First V2')).toBe(true);
    expect(state.bySession[hard.id]!.lines.some((l) => l.label === 'First V6')).toBe(true);
  });
});

describe('the drill streak', () => {
  it('builds across consecutive sessions and resets when one is missed', () => {
    const withDrill = (back: number, done: boolean) =>
      session(addDays(TODAY, -back), { drillDone: done, drillId: 'x' });
    const run = [withDrill(9, true), withDrill(7, true), withDrill(5, true), withDrill(3, false), withDrill(1, true)];
    const state = deriveXp({ sessions: run });
    expect(state.bySession[run[2]!.id]!.reward.drill).toBe(1.1);
    expect(state.bySession[run[3]!.id]!.reward.drill).toBe(1);
    expect(state.bySession[run[4]!.id]!.reward.drill).toBe(1);
  });

  it('is not broken by a rest day in the middle', () => {
    const drill = (back: number) => session(addDays(TODAY, -back), { drillDone: true, drillId: 'x' });
    const rest = session(addDays(TODAY, -4), {
      restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true },
    });
    const run = [drill(9), drill(7), rest, drill(2)];
    expect(deriveXp({ sessions: run }).bySession[run[3]!.id]!.reward.drill).toBe(1.1);
  });
});

describe('project sends', () => {
  function project(patch: Partial<Project> = {}): Project {
    return newProject({
      name: 'The Prow',
      grade: 'V8',
      scale: 'V',
      id: 'p1',
      status: 'sent',
      sentDate: addDays(TODAY, -3),
      ...patch,
    });
  }

  it('pays on the day it was sent', () => {
    const state = deriveXp({ projects: [project()] });
    expect(state.total).toBe(unitsToXp(AWARDS.projectSend));
    expect(state.events[0]).toMatchObject({ kind: 'project', label: 'Project sent: The Prow', date: addDays(TODAY, -3) });
  });

  it('pays outdoor sends more', () => {
    const indoor = deriveXp({ projects: [project()] }).total;
    const outdoor = deriveXp({ projects: [project({ setting: 'outdoor' })] }).total;
    expect(outdoor).toBe(Math.round(indoor * MULTIPLIERS.projectSendOutdoor));
  });

  it('ignores a project that has not been sent', () => {
    expect(deriveXp({ projects: [newProject({ name: 'x', grade: 'V4', scale: 'V' })] }).total).toBe(0);
  });
});

describe('the game lane', () => {
  const entry = (patch: Partial<GameXpEntry> = {}): GameXpEntry => ({
    id: 'g1',
    date: TODAY,
    label: 'Ascent run',
    units: 0.05,
    origin: 'ascent',
    ...patch,
  });

  it('is counted separately from real climbing', () => {
    const state = deriveXp({ sessions: [session(TODAY)], gameXp: [entry()] });
    expect(state.game).toBe(unitsToXp(0.05));
    expect(state.real).toBe(state.total - state.game);
    expect(state.events.some((e) => e.source === 'game')).toBe(true);
  });

  it('clamps an over-generous entry to the cap rather than trusting the writer', () => {
    const state = deriveXp({ gameXp: [entry({ units: 5 })] });
    expect(state.game).toBe(unitsToXp(GAME_ACTION_CAP));
  });

  it('can never out-earn a plain session', () => {
    const gamed = deriveXp({ gameXp: [entry({ units: 99 })] }).total;
    const climbed = deriveXp({ sessions: [session(TODAY)] }).total;
    expect(gamed).toBeLessThan(climbed);
  });
});

describe('levels, ranks and currency', () => {
  it('marks the event that crossed a level', () => {
    const sessions = Array.from({ length: 3 }, (_, i) =>
      session(addDays(TODAY, -10 + i), { climbs: [climb('V4', { count: 5 })] }),
    );
    const state = deriveXp({ sessions });
    const crossings = state.events.filter((e) => e.levelUp !== undefined);
    expect(crossings.length).toBeGreaterThan(0);
    // `events` is newest first, so the most recent crossing is at the head
    // and must be the level currently held.
    expect(crossings[0]!.levelUp).toBe(state.progress.level);
    const reached = crossings.map((c) => c.levelUp!);
    expect(reached).toEqual([...reached].sort((a, b) => b - a));
    expect(state.progress.level).toBe(levelFor(state.total));
  });

  it('earns currency at a quarter of total XP', () => {
    const state = deriveXp({ sessions: [session(TODAY)] });
    expect(state.earned).toBe(Math.floor(state.total * CURRENCY_RATE));
  });

  it('reaches a plausible level after a year of steady training', () => {
    // Three sessions a week, ten sends around V4 — the pacing LEVEL_UNIT is
    // calibrated against. If this moves, the whole curve moved.
    const sessions: Session[] = [];
    for (let week = 52; week >= 1; week--) {
      for (const offset of [0, 2, 4]) {
        sessions.push(
          session(addDays(TODAY, -(week * 7) + offset), {
            rpe: 7,
            durationMin: 90,
            warmup: true,
            drillDone: true,
            drillId: 'x',
            climbs: [climb('V3', { count: 5 }), climb('V4', { count: 4 }), climb('V5')],
          }),
        );
      }
    }
    const level = deriveXp({ sessions }).progress.level;
    expect(level).toBeGreaterThan(35);
    expect(level).toBeLessThan(55);
    expect(LEVEL_UNIT).toBe(2000);
  });
});

describe('the event log', () => {
  it('is newest first and covers every source', () => {
    const state = deriveXp({
      sessions: [session(addDays(TODAY, -9))],
      projects: [
        newProject({ name: 'p', grade: 'V5', scale: 'V', status: 'sent', sentDate: addDays(TODAY, -4) }),
      ],
      gameXp: [{ id: 'g', date: addDays(TODAY, -1), label: 'Run', units: 0.02, origin: 'ascent' }],
    });
    expect(state.events.map((e) => e.kind)).toEqual(['game', 'project', 'session']);
    expect(state.events.map((e) => e.date)).toEqual([
      addDays(TODAY, -1),
      addDays(TODAY, -4),
      addDays(TODAY, -9),
    ]);
  });
});
