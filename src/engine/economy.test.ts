import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import {
  AWARDS,
  GAME_ACTION_CAP,
  LEVEL_UNIT,
  RANKS,
  drillStreakMultiplier,
  effortMultiplier,
  levelFor,
  levelProgress,
  levelWidth,
  nextRank,
  rankFor,
  sessionReward,
  unitsToXp,
  xpForLevel,
} from './economy';

describe('levels', () => {
  it('round-trips: the XP for a level lands exactly on it', () => {
    for (const level of [0, 1, 5, 20, 50, 99, 100]) {
      expect(levelFor(xpForLevel(level))).toBe(level);
      expect(levelFor(xpForLevel(level) - 1)).toBe(Math.max(0, level - 1));
    }
  });

  it('never goes negative on nonsense input', () => {
    expect(levelFor(-500)).toBe(0);
    expect(xpForLevel(-3)).toBe(0);
  });

  it('widens each level, which is what makes the curve decelerate', () => {
    expect(levelWidth(0)).toBeLessThan(levelWidth(10));
    expect(levelWidth(10)).toBeLessThan(levelWidth(50));
    expect(xpForLevel(100)).toBe(1_000_000);
  });

  it('reports progress through the current level', () => {
    const p = levelProgress(xpForLevel(10) + 500);
    expect(p.level).toBe(10);
    expect(p.into).toBe(500);
    expect(p.width).toBe(levelWidth(10));
    expect(p.toNext).toBe(p.width - 500);
    expect(p.fraction).toBeCloseTo(500 / p.width);
  });
});

describe('ranks', () => {
  it('are ordered, unique and end at GOAT on level 100', () => {
    const levels = RANKS.map((r) => r.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
    expect(new Set(RANKS.map((r) => r.title)).size).toBe(RANKS.length);
    expect(RANKS).toHaveLength(24);
    expect(RANKS.at(-1)).toEqual({ level: 100, title: 'GOAT' });
    expect(RANKS[0]!.level).toBe(0);
  });

  it('holds the rank you reached until the next one', () => {
    expect(rankFor(0).title).toBe('Newcomer');
    expect(rankFor(1).title).toBe('Newcomer');
    expect(rankFor(2).title).toBe('Gym Regular');
    expect(rankFor(999).title).toBe('GOAT');
  });

  it('points at the next one, and at nothing past the top', () => {
    expect(nextRank(0)!.title).toBe('Gym Regular');
    expect(nextRank(100)).toBeNull();
  });
});

describe('the effort brake', () => {
  it('pays for hard efforts at a sane load', () => {
    expect(effortMultiplier(6, 'optimal')).toBe(1);
    expect(effortMultiplier(7, 'optimal')).toBe(1.15);
    expect(effortMultiplier(9, 'optimal')).toBe(1.2);
    expect(effortMultiplier(10, 'optimal')).toBe(1.5);
  });

  it('withholds the bonus once load is already climbing', () => {
    for (const rpe of [7, 8, 9, 10]) {
      expect(effortMultiplier(rpe, 'caution')).toBe(1);
      expect(effortMultiplier(rpe, 'danger')).toBe(1);
    }
  });

  it('still pays normally when there is not enough history to judge', () => {
    expect(effortMultiplier(9, 'unknown')).toBe(1.2);
  });
});

describe('drill streak', () => {
  it('steps at three, five and eight', () => {
    expect([0, 2].map(drillStreakMultiplier)).toEqual([1, 1]);
    expect(drillStreakMultiplier(3)).toBe(1.1);
    expect(drillStreakMultiplier(5)).toBe(1.15);
    expect(drillStreakMultiplier(8)).toBe(1.2);
    expect(drillStreakMultiplier(40)).toBe(1.2);
  });
});

describe('the game lane can never beat climbing', () => {
  it('caps a game action at half a session, and every real award clears it', () => {
    expect(GAME_ACTION_CAP).toBeLessThanOrEqual(AWARDS.session / 2);
    for (const real of [AWARDS.session, AWARDS.personalRecord, AWARDS.projectSend]) {
      expect(real).toBeGreaterThan(GAME_ACTION_CAP);
    }
  });

  it('prices a full level at the pacing constant', () => {
    expect(unitsToXp(1)).toBe(LEVEL_UNIT);
  });
});

let counter = 0;
function session(patch: Partial<Session> = {}): Session {
  return newSession('2026-09-09', counter++, { completed: true, ...patch });
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

describe('sessionReward', () => {
  it('itemises a training session', () => {
    const reward = sessionReward(
      session({ rpe: 8, warmup: true, drillDone: true, climbs: [climb('V5', { count: 2 })] }),
      { zone: 'optimal', drillStreak: 3 },
    );
    expect(reward.awards.map((a) => a.id)).toEqual(['session', 'warmup', 'drill', expect.stringMatching(/^send-/)]);
    expect(reward.effort).toBe(1.2);
    expect(reward.drill).toBe(1.1);
    expect(reward.outdoor).toBe(1);
    expect(reward.multiplier).toBeCloseTo(1.32);
  });

  it('pays a rest day as a rest day, not a session', () => {
    const reward = sessionReward(
      session({ restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true } }),
      { zone: 'optimal', drillStreak: 0 },
    );
    expect(reward.awards).toHaveLength(1);
    expect(reward.awards[0]).toMatchObject({ id: 'rest', units: AWARDS.restDay });
  });

  it('scales a send by grade, and route grades by their V-equivalent', () => {
    const v = (grade: string) =>
      sessionReward(session({ climbs: [climb(grade)] }), { zone: 'optimal', drillStreak: 0 }).awards.at(-1)!.units;
    expect(v('V0')).toBeCloseTo(AWARDS.sendBase);
    expect(v('V8')).toBeCloseTo(AWARDS.sendBase + AWARDS.sendPerGrade * 8);
    // 5.13a is worth a V5, not a V0 and not a V13.
    expect(v('5.13a')).toBeCloseTo(v('V5'));
    expect(v('5.7')).toBeCloseTo(v('V0'));
  });

  it('multiplies the count into one line rather than repeating it', () => {
    const one = sessionReward(session({ climbs: [climb('V4')] }), { zone: 'optimal', drillStreak: 0 });
    const four = sessionReward(session({ climbs: [climb('V4', { count: 4 })] }), {
      zone: 'optimal',
      drillStreak: 0,
    });
    expect(four.awards).toHaveLength(2);
    expect(four.awards.at(-1)!.units).toBeCloseTo(one.awards.at(-1)!.units * 4);
  });

  it('rewards style on the send it belongs to, not the whole session', () => {
    const plain = sessionReward(session({ climbs: [climb('V5')] }), { zone: 'optimal', drillStreak: 0 });
    const flashed = sessionReward(session({ climbs: [climb('V5', { style: 'flash' })] }), {
      zone: 'optimal',
      drillStreak: 0,
    });
    const onsighted = sessionReward(session({ climbs: [climb('5.12a', { style: 'onsight' })] }), {
      zone: 'optimal',
      drillStreak: 0,
    });
    expect(plain.awards.at(-1)!.own).toBeUndefined();
    expect(flashed.awards.at(-1)!.own).toBe(1.5);
    expect(onsighted.awards.at(-1)!.own).toBe(2);
    expect(flashed.multiplier).toBe(plain.multiplier);
  });

  it('ignores attempts and unknown grades', () => {
    const reward = sessionReward(
      session({ climbs: [climb('V5', { result: 'attempt' }), climb('V99')] }),
      { zone: 'optimal', drillStreak: 0 },
    );
    expect(reward.awards.map((a) => a.id)).toEqual(['session']);
  });

  it('adds a record award, and says when the effort bonus was withheld', () => {
    const reward = sessionReward(session({ rpe: 9, climbs: [climb('V7')] }), {
      zone: 'danger',
      drillStreak: 0,
      records: [{ scale: 'V', grade: 'V7' }],
    });
    expect(reward.awards.map((a) => a.id)).toContain('pr-V-V7');
    expect(reward.effort).toBe(1);
    expect(reward.effortBraked).toBe(true);
  });

  it('does not claim a bonus was withheld from an easy session', () => {
    const reward = sessionReward(session({ rpe: 4 }), { zone: 'danger', drillStreak: 0 });
    expect(reward.effortBraked).toBe(false);
  });

  it('pays outdoor sessions more', () => {
    const reward = sessionReward(session({ mode: 'outdoor' }), { zone: 'optimal', drillStreak: 0 });
    expect(reward.outdoor).toBe(1.1);
  });
});
