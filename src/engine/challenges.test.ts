import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import { AWARDS } from './economy';
import { addDays, startOfWeek } from './dates';
import { deriveClimberState } from './derive';
import {
  CHALLENGE_REWARD,
  boardRewardCeiling,
  dailyChallenge,
  deriveBoard,
  hash,
  offeredBounties,
  resolveBounty,
  weeklyChallenges,
  type AcceptedBounty,
} from './challenges';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, patch: Partial<Session> = {}): Session {
  return newSession(date, counter++, { completed: true, rpe: 7, durationMin: 60, ...patch });
}
function climb(grade: string, patch: Record<string, unknown> = {}) {
  return {
    id: `c${counter++}`,
    grade,
    scale: (grade.startsWith('V') ? 'V' : 'YDS') as 'V' | 'YDS',
    count: 1,
    result: 'send' as const,
    ...patch,
  };
}
const stateOf = (s: Session[]) => deriveClimberState(s, { today: TODAY });

/** A long, ordinary history so scaled targets have something to read. */
function history(weeks = 20): Session[] {
  const out: Session[] = [];
  for (let w = weeks; w >= 1; w--) {
    for (const d of [0, 2, 4]) {
      out.push(
        session(addDays(startOfWeek(TODAY), -7 * w + d), {
          warmup: true,
          drillDone: true,
          drillId: 'ig_density_hangs',
          sessionTypeId: 'fp',
          climbs: [climb('V3', { count: 5 }), climb('V4', { count: 2 })],
        }),
      );
    }
  }
  return out;
}

describe('determinism', () => {
  it('gives the same day the same board, and different days different ones', () => {
    const sessions = history();
    const state = stateOf(sessions);
    const a = dailyChallenge(sessions, state, TODAY);
    const b = dailyChallenge(sessions, state, TODAY);
    expect(b.id).toBe(a.id);

    const days = new Set(
      Array.from({ length: 12 }, (_, i) => dailyChallenge(sessions, state, addDays(TODAY, -i)).title),
    );
    expect(days.size).toBeGreaterThan(1);
  });

  it('hashes stably', () => {
    expect(hash('daily:2026-09-09')).toBe(hash('daily:2026-09-09'));
    expect(hash('a')).not.toBe(hash('b'));
  });
});

describe('the daily challenge', () => {
  it('asks a beginner to warm up at all, and a veteran to warm up for the hard ones', () => {
    const novice = [session(addDays(TODAY, -3))];
    const titles = new Set<string>();
    for (let i = 0; i < 14; i++) {
      titles.add(dailyChallenge(novice, stateOf(novice), addDays(TODAY, -i)).title);
    }
    expect([...titles].some((t) => t === 'Warm up')).toBe(true);

    const veteran = history(30);
    const hard = new Set<string>();
    for (let i = 0; i < 14; i++) {
      hard.add(dailyChallenge(veteran, stateOf(veteran), addDays(TODAY, -i)).title);
    }
    expect(hard.has('Warm up')).toBe(false);
  });

  it('resolves from the log, over today only', () => {
    // Force the rung by finding a day whose pick is the warmup task.
    const base = [session(addDays(TODAY, -30))];
    let day = TODAY;
    for (let i = 0; i < 30; i++) {
      const d = addDays(TODAY, -i);
      if (dailyChallenge(base, stateOf(base), d).title === 'Warm up') { day = d; break; }
    }
    const withWarmup = [...base, session(day, { warmup: true })];
    const yesterdayOnly = [...base, session(addDays(day, -1), { warmup: true })];
    expect(dailyChallenge(withWarmup, stateOf(withWarmup), day).done).toBe(true);
    expect(dailyChallenge(yesterdayOnly, stateOf(yesterdayOnly), day).done).toBe(false);
  });
});

describe('the weekly set', () => {
  const sessions = history();
  const state = stateOf(sessions);

  it('always offers exactly three, over the current week', () => {
    const weekly = weeklyChallenges(sessions, state, TODAY, 3);
    expect(weekly).toHaveLength(3);
    for (const c of weekly) {
      expect(c.from).toBe(startOfWeek(TODAY));
      expect(c.to).toBe(addDays(startOfWeek(TODAY), 6));
      expect(c.reward).toBe(CHALLENGE_REWARD.weekly);
    }
  });

  it('scales the volume target to the climber rather than a fixed number', () => {
    const light = [session(addDays(TODAY, -4), { climbs: [climb('V2')] })];
    const heavy = history(20);
    const lightTarget = weeklyChallenges(light, stateOf(light), TODAY)[0]!.target;
    const heavyTarget = weeklyChallenges(heavy, stateOf(heavy), TODAY)[0]!.target;
    expect(heavyTarget).toBeGreaterThan(lightTarget);
  });

  it('asks for the grade band the climber actually works, not their ceiling', () => {
    const volume = weeklyChallenges(sessions, state, TODAY)[0]!;
    // Best is V4, so the band opens at V2 — a target you can hit on a normal day.
    expect(volume.title).toContain('V2');
  });

  it('takes the consistency target from the program', () => {
    expect(weeklyChallenges(sessions, state, TODAY, 5)[1]!.title).toBe('5 sessions this week');
  });

  it('counts only sessions inside the week', () => {
    const inWeek = [...history(), session(startOfWeek(TODAY), { climbs: [climb('V5', { count: 40 })] })];
    const volume = weeklyChallenges(inWeek, stateOf(inWeek), TODAY)[0]!;
    expect(volume.done).toBe(true);
  });
});

describe('bounties', () => {
  const sessions = history();
  const state = stateOf(sessions);

  it('targets one notch above where the sends actually sit', () => {
    // Most sends are V3, so the grade bounty asks for V4 — not V5, the ceiling.
    const grade = offeredBounties(sessions, state, TODAY)[0]!;
    expect(grade.title).toBe('Send 3 at V4');
    expect(grade.detail).toContain('V3');
  });

  it('follows the discipline the climber actually trains', () => {
    const ropes = [
      session(addDays(TODAY, -5), { climbs: [climb('5.11a', { count: 20 })] }),
      session(addDays(TODAY, -3), { climbs: [climb('5.11b', { count: 10 })] }),
    ];
    const offer = offeredBounties(ropes, stateOf(ropes), TODAY)[0]!;
    expect(offer.title).toMatch(/5\.\d/);
  });

  it('picks the drill category the logs show least, never recovery or assessment', () => {
    const offer = offeredBounties(sessions, state, TODAY)[1]!;
    expect(offer.measure.kind).toBe('drill-category');
    if (offer.measure.kind === 'drill-category') {
      expect(['recovery', 'assessment']).not.toContain(offer.measure.category);
    }
  });

  it('does not offer a bounty already accepted', () => {
    const spec = offeredBounties(sessions, state, TODAY)[0]!;
    const accepted: AcceptedBounty[] = [{ id: 'b1', spec, acceptedAt: `${TODAY}T12:00:00.000Z` }];
    const board = deriveBoard({ sessions, state, accepted, today: TODAY });
    expect(board.offers.map((o) => o.key)).not.toContain(spec.key);
  });

  it('ignores everything climbed before it was accepted', () => {
    const spec = offeredBounties(sessions, state, TODAY)[0]!;
    const acceptedAt = '2026-09-09T18:00:00.000Z';
    const bounty: AcceptedBounty = { id: 'b1', spec, acceptedAt };

    const earlier = session(addDays(TODAY, -5), { climbs: [climb('V4', { count: 40 })] });
    earlier.createdAt = '2026-09-04T10:00:00.000Z';
    expect(resolveBounty(bounty, [...sessions, earlier], TODAY).progress).toBe(0);

    const after = session(TODAY, { climbs: [climb('V4', { count: 3 })] });
    after.createdAt = '2026-09-09T19:00:00.000Z';
    expect(resolveBounty(bounty, [...sessions, earlier, after], TODAY).done).toBe(true);
  });

  it('does not count work already logged on the day it was accepted', () => {
    // The exploit a date-only snapshot allows: send three V4s in the morning,
    // then take the bounty that asks for three V4s.
    const spec = offeredBounties(sessions, state, TODAY)[0]!;
    const morning = session(TODAY, { climbs: [climb('V4', { count: 3 })] });
    morning.createdAt = '2026-09-09T09:00:00.000Z';
    const bounty: AcceptedBounty = { id: 'b1', spec, acceptedAt: '2026-09-09T18:00:00.000Z' };
    expect(resolveBounty(bounty, [...sessions, morning], TODAY).progress).toBe(0);
  });
});

describe('the board', () => {
  const sessions = history();
  const state = stateOf(sessions);

  it('is one board: a daily, three weekly, and the bounties you accepted', () => {
    const board = deriveBoard({ sessions, state, today: TODAY });
    expect(board.weekly).toHaveLength(3);
    expect(board.bounties).toEqual([]);
    expect(board.offers.length).toBeGreaterThan(0);
  });

  it('adds up what is finished and unclaimed', () => {
    const board = deriveBoard({ sessions, state, today: TODAY });
    const doneRewards = [board.daily, ...board.weekly].filter((c) => c.done).reduce((s, c) => s + c.reward, 0);
    expect(board.claimable).toBeCloseTo(doneRewards);
  });

  it('stops counting a challenge once it is claimed', () => {
    const first = deriveBoard({ sessions, state, today: TODAY });
    const doneIds = [first.daily, ...first.weekly].filter((c) => c.done).map((c) => c.id);
    const after = deriveBoard({ sessions, state, today: TODAY, claimed: doneIds });
    expect(after.claimable).toBe(0);
  });

  it('cannot out-pay real training, by construction', () => {
    // A perfect week of the entire board is still worth under three sessions.
    expect(boardRewardCeiling()).toBeLessThan(AWARDS.session * 3);
    for (const reward of Object.values(CHALLENGE_REWARD)) {
      expect(reward).toBeLessThan(AWARDS.session);
    }
  });

  it('works for a climber with nothing logged', () => {
    const empty = deriveBoard({ sessions: [], state: stateOf([]), today: TODAY });
    expect(empty.daily.done).toBe(false);
    expect(empty.weekly).toHaveLength(3);
    expect(empty.claimable).toBe(0);
    expect(empty.offers.length).toBeGreaterThan(0);
  });
});
