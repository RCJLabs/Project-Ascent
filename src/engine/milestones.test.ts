import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { DEFAULT_DISPLAY } from './grades';
import {
  announcementFor,
  headlineMilestone,
  recordsInReward,
  sessionMilestones,
  type MilestoneInput,
} from './milestones';

const session = (patch: Partial<Session> = {}): Session =>
  ({
    id: '2026-09-10#a',
    date: '2026-09-10',
    planned: false,
    completed: true,
    rewarded: false,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: '2026-09-10T18:00:00.000Z',
    updatedAt: '2026-09-10T18:00:00.000Z',
    ...patch,
  }) as Session;

const input = (patch: Partial<MilestoneInput> = {}): MilestoneInput => ({
  session: session(),
  records: [],
  earlierSessions: 40,
  earlierOutdoor: 5,
  levelBefore: 12,
  levelAfter: 12,
  rankBefore: 'Boulderer',
  rankAfter: 'Boulderer',
  projectsSent: [],
  display: DEFAULT_DISPLAY,
  ...patch,
});

const kinds = (patch: Partial<MilestoneInput> = {}) =>
  sessionMilestones(input(patch)).map((m) => m.kind);

describe('an ordinary session', () => {
  it('is not a milestone', () => {
    expect(sessionMilestones(input())).toEqual([]);
    expect(headlineMilestone([])).toBeNull();
  });
});

describe('what counts', () => {
  it('names a grade record', () => {
    const found = sessionMilestones(
      input({ records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }] }),
    );
    expect(found[0]?.kind).toBe('grade-pr');
    expect(found[0]?.headline).toBe('First V7');
    expect(found[0]?.record?.grade).toBe('V7');
  });

  it('reads a grade in the notation the climber chose', () => {
    const found = sessionMilestones(
      input({
        records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }],
        display: { ...DEFAULT_DISPLAY, boulder: 'Font' },
      }),
    );
    expect(found[0]?.headline).not.toContain('V7');
  });

  it('names a project send', () => {
    const found = sessionMilestones(
      input({ projectsSent: [{ name: 'Midnight Lightning', grade: 'V8', scale: 'V' }] }),
    );
    expect(found[0]?.headline).toBe('Midnight Lightning sent');
  });

  it('catches a first day on rock', () => {
    expect(kinds({ earlierOutdoor: 0, session: session({ mode: 'outdoor' }) })).toContain(
      'first-outdoor',
    );
  });

  it('does not call the second outdoor day the first', () => {
    expect(kinds({ earlierOutdoor: 1, session: session({ mode: 'outdoor' }) })).not.toContain(
      'first-outdoor',
    );
  });

  it('does not call an indoor session a day on rock', () => {
    expect(kinds({ earlierOutdoor: 0 })).not.toContain('first-outdoor');
  });

  it('catches the very first session', () => {
    expect(kinds({ earlierSessions: 0 })).toContain('first-session');
  });

  it('catches a level and a rank', () => {
    expect(kinds({ levelBefore: 12, levelAfter: 13 })).toContain('level-up');
    expect(kinds({ rankBefore: 'Boulderer', rankAfter: 'Crusher' })).toContain('rank-up');
  });

  it('does not say the same event twice', () => {
    // A rank change is always a level change, and "Level 13" under "Crusher"
    // is the same fact described twice.
    const found = kinds({ levelBefore: 12, levelAfter: 13, rankBefore: 'Boulderer', rankAfter: 'Crusher' });
    expect(found).toContain('rank-up');
    expect(found).not.toContain('level-up');
  });

  it('says how many levels when a session crosses more than one', () => {
    const found = sessionMilestones(input({ levelBefore: 12, levelAfter: 15 }));
    expect(found[0]?.detail).toContain('3 levels');
  });
});

describe('which one leads', () => {
  it('puts a grade record above everything', () => {
    // The only one of these that is about climbing rather than about the
    // app's own arithmetic.
    const found = sessionMilestones(
      input({
        records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }],
        projectsSent: [{ name: 'A boulder', grade: 'V6', scale: 'V' }],
        earlierSessions: 0,
        levelBefore: 3,
        levelAfter: 5,
        rankBefore: 'Gym Regular',
        rankAfter: 'Top Roper',
      }),
    );
    expect(headlineMilestone(found)?.kind).toBe('grade-pr');
    expect(found.length).toBeGreaterThan(3);
  });

  it('puts a rank above a level and a send above both', () => {
    const found = kinds({
      projectsSent: [{ name: 'A boulder', grade: 'V6', scale: 'V' }],
      rankBefore: 'Gym Regular',
      rankAfter: 'Top Roper',
    });
    expect(found.indexOf('project-send')).toBeLessThan(found.indexOf('rank-up'));
  });

  it('keeps a stable order whatever order the inputs arrive in', () => {
    const a = kinds({
      records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }],
      earlierSessions: 0,
      levelBefore: 1,
      levelAfter: 2,
    });
    const b = kinds({
      levelBefore: 1,
      levelAfter: 2,
      earlierSessions: 0,
      records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }],
    });
    expect(a).toEqual(b);
  });

  it('lists every record when a session sets two', () => {
    // A boulder record and a route record on one day is entirely possible.
    const found = sessionMilestones(
      input({
        records: [
          { scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' },
          { scale: 'YDS', grade: '5.12a', date: '2026-09-10', mode: 'indoor' },
        ],
      }),
    );
    expect(found.filter((m) => m.kind === 'grade-pr')).toHaveLength(2);
  });
});

describe('what is worth sharing', () => {
  it('offers a card for a thing the climber did', () => {
    const found = sessionMilestones(
      input({ records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }] }),
    );
    expect(found[0]?.shareable).toBe(true);
  });

  it('does not offer one for a number the app made up', () => {
    // A level is the app's own arithmetic. Handing that to someone else is
    // not a climbing achievement.
    for (const patch of [
      { levelBefore: 1, levelAfter: 2 },
      { rankBefore: 'A', rankAfter: 'B' },
      { earlierSessions: 0 },
    ]) {
      expect(sessionMilestones(input(patch)).every((m) => !m.shareable)).toBe(true);
    }
  });
});

describe('what a screen reader hears', () => {
  it('leads with the record, not the XP', () => {
    // "412 XP earned" told a climber nothing about having just climbed the
    // hardest thing they ever have.
    const found = sessionMilestones(
      input({ records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }] }),
    );
    const text = announcementFor(found, 412);
    expect(text.indexOf('First V7')).toBeLessThan(text.indexOf('412'));
  });

  it('still reports an ordinary session', () => {
    expect(announcementFor([], 120)).toBe('Session logged. 120 XP earned.');
  });

  it('says how many others there were', () => {
    const found = sessionMilestones(
      input({ records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }], earlierSessions: 0 }),
    );
    expect(announcementFor(found, 10)).toMatch(/1 more/);
  });

  it('congratulates nobody', () => {
    // The fact is enough, and the app does not know what the session cost.
    const found = sessionMilestones(
      input({ records: [{ scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' }] }),
    );
    for (const milestone of found) {
      expect(`${milestone.headline} ${milestone.detail}`).not.toMatch(
        /congrat|well done|amazing|awesome|crushing it|proud/i,
      );
    }
  });
});

describe('reading the records back out of the reward', () => {
  it('carries the mode the session was in', () => {
    // The award id holds the ladder and the grade and nothing else, so the
    // mode has to come from the session. A record set on rock is a
    // different claim from the same grade indoors.
    const onRock = recordsInReward([{ id: 'pr-V-V5' }], '2026-09-10', 'outdoor');
    expect(onRock).toEqual([{ scale: 'V', grade: 'V5', date: '2026-09-10', mode: 'outdoor' }]);
  });

  it('finds each one', () => {
    const found = recordsInReward(
      [{ id: 'session' }, { id: 'pr-V-V7' }, { id: 'pr-YDS-5.12a' }, { id: 'send-1' }],
      '2026-09-10',
      'indoor',
    );
    expect(found).toEqual([
      { scale: 'V', grade: 'V7', date: '2026-09-10', mode: 'indoor' },
      { scale: 'YDS', grade: '5.12a', date: '2026-09-10', mode: 'indoor' },
    ]);
  });

  it('finds none in an ordinary session', () => {
    expect(recordsInReward([{ id: 'session' }, { id: 'warmup' }], '2026-09-10', 'indoor')).toEqual([]);
  });

  it('matches the id the economy actually writes', () => {
    // The coupling here is a string, so it gets checked rather than trusted.
    const economy = readFileSync('src/engine/economy.ts', 'utf8');
    expect(economy).toContain('`pr-${record.scale}-${record.grade}`');
  });
});

describe('the card actually uses this', () => {
  const LOG = readFileSync('src/features/log/LogPage.tsx', 'utf8');

  it('leads with the milestone rather than the XP total', () => {
    // The XP total was the headline and the record was one grey line among
    // "3× V4" and "Warmed up" — while paying half a level, the biggest
    // single award in the economy.
    expect(LOG).toContain('headlineMilestone(');
    expect(LOG).toContain('MILESTONE_EYEBROW[lead.kind]');
  });

  it('announces the record before the number', () => {
    expect(LOG).toContain('announce(announcementFor(');
  });

  it('offers the share card that was already written', () => {
    expect(LOG).toContain('recordCard(');
  });

  it('reads the records from the reward rather than deriving them again', () => {
    // So the headline and the line that paid for it cannot disagree.
    expect(LOG).toContain('recordsInReward(detail.reward.awards');
  });

  it('does not derive an avatar for every ordinary session', () => {
    // The derivation walks the whole log; a record is rare and the rest of
    // the time there is no card to put one on.
    expect(LOG).toContain('useClimberAvatar(Boolean(lead?.shareable');
  });
});
