import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import {
  NAME_LIMIT,
  cleanName,
  knownPartners,
  partnerTally,
  unsaid,
  withPartner,
  withoutPartner,
} from './partners';

/**
 * Who you climbed with (PLAN.md M237).
 *
 * One optional field, and most of what is worth testing is the restraint:
 * that two spellings of one name are one person, that an empty field is not a
 * claim about climbing alone, and that the reading counts sessions and stops.
 */

const day = (date: string, partners?: string[], completed = true): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    ...(partners === undefined ? {} : { partners }),
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
  }) as Session;

describe('a typed name', () => {
  it('is trimmed and collapsed, so one person is one person', () => {
    expect(cleanName('  Sam  ')).toBe('Sam');
    expect(cleanName('Sam   Riley')).toBe('Sam Riley');
  });

  it('is nothing when it is nothing', () => {
    expect(cleanName('')).toBeNull();
    expect(cleanName('   ')).toBeNull();
  });

  /** A field, not a note: a name is short or it is something else. */
  it('is cut at the limit rather than stored whole', () => {
    expect(cleanName('x'.repeat(200))).toHaveLength(NAME_LIMIT);
  });
});

describe('adding and removing', () => {
  it('adds a name', () => {
    expect(withPartner([], 'Sam')).toEqual(['Sam']);
    expect(withPartner(['Sam'], 'Alex')).toEqual(['Sam', 'Alex']);
  });

  /**
   * And never twice, whatever the casing — with the spelling already there
   * kept. Re-casing somebody's name because of how it was typed the second
   * time is the app correcting a climber about their own friend.
   */
  it('treats two spellings as one person and keeps the first', () => {
    expect(withPartner(['Sam'], 'sam')).toEqual(['Sam']);
    expect(withPartner(['Sam'], 'SAM')).toEqual(['Sam']);
    expect(withPartner(['Sam'], '  sam ')).toEqual(['Sam']);
  });

  it('adds nothing for an empty box', () => {
    expect(withPartner(['Sam'], '   ')).toEqual(['Sam']);
    expect(withPartner([], '')).toEqual([]);
  });

  it('removes case-insensitively too', () => {
    expect(withoutPartner(['Sam', 'Alex'], 'sam')).toEqual(['Alex']);
    expect(withoutPartner(['Sam'], 'Jo')).toEqual(['Sam']);
  });

  it('never mutates what it was handed', () => {
    const before = ['Sam'];
    withPartner(before, 'Alex');
    withoutPartner(before, 'Sam');
    expect(before).toEqual(['Sam']);
  });
});

describe('the suggestions', () => {
  /**
   * Recency, not frequency. The person you climbed with on Tuesday is the
   * likeliest answer on Thursday; a list sorted by lifetime count would bury
   * a new partner under an old one for months.
   */
  it('offers everyone, most recently climbed with first', () => {
    const log = [day('2026-01-04', ['Alex']), day('2026-03-02', ['Sam']), day('2026-02-01', ['Jo'])];
    expect(knownPartners(log)).toEqual(['Sam', 'Jo', 'Alex']);
  });

  it('offers one entry per person however often they appear', () => {
    const log = [day('2026-03-02', ['Sam']), day('2026-02-01', ['sam']), day('2026-01-01', ['SAM'])];
    expect(knownPartners(log)).toEqual(['Sam']);
  });

  it('offers nothing from a log that names nobody', () => {
    expect(knownPartners([day('2026-03-02'), day('2026-02-01', [])])).toEqual([]);
  });
});

describe('the tally', () => {
  it('counts sessions per person, most first', () => {
    const log = [
      day('2026-03-02', ['Sam', 'Jo']),
      day('2026-02-28', ['Sam']),
      day('2026-02-20', ['Alex']),
    ];
    expect(partnerTally(log)).toEqual([
      { name: 'Sam', sessions: 2, last: '2026-03-02' },
      { name: 'Jo', sessions: 1, last: '2026-03-02' },
      { name: 'Alex', sessions: 1, last: '2026-02-20' },
    ]);
  });

  it('breaks a tie by who was climbed with most recently', () => {
    const log = [day('2026-03-02', ['Jo']), day('2026-01-04', ['Alex'])];
    expect(partnerTally(log).map((p) => p.name)).toEqual(['Jo', 'Alex']);
  });

  it('counts a session that was planned and never done as nothing', () => {
    expect(partnerTally([day('2026-03-02', ['Sam'], false)])).toEqual([]);
  });

  it('folds two spellings into one row', () => {
    const log = [day('2026-03-02', ['Sam']), day('2026-02-01', ['sam'])];
    expect(partnerTally(log)).toEqual([{ name: 'Sam', sessions: 2, last: '2026-03-02' }]);
  });

  /**
   * The order a log arrives in is not this module's to rely on:
   * `useAllSessions` yields whatever the store holds, and the year page hands
   * over that slice unsorted. A mutation battery found this — with the
   * fixtures above, every first sighting of a name happened to be its latest
   * session, so dropping the line that advances `last` changed nothing.
   */
  it('reads the same whichever order the log arrives in', () => {
    const log = [day('2026-02-20', ['Sam']), day('2026-03-02', ['Sam']), day('2026-02-28', ['Sam'])];
    expect(partnerTally(log)).toEqual([{ name: 'Sam', sessions: 3, last: '2026-03-02' }]);
    expect(partnerTally([...log].reverse())).toEqual(partnerTally(log));
    expect(knownPartners([...log].reverse())).toEqual(knownPartners(log));
  });

  /**
   * A count and a date, and nothing else. Grades climbed with each person
   * would be the app ranking a climber's friends, which is not a thing a
   * training log gets to do.
   */
  it('reports a count and a date and nothing that reads as a score', () => {
    const [row] = partnerTally([day('2026-03-02', ['Sam'])]);
    expect(Object.keys(row!).sort()).toEqual(['last', 'name', 'sessions']);
  });
});

describe('what an empty field means', () => {
  /**
   * Nobody wrote one down — which is not the same as climbing alone, and is
   * the same distinction `ropeStyle.ts` makes about an absent rope style.
   * Every log written before this milestone is entirely unsaid.
   */
  it('counts the sessions that named nobody, rather than calling them solo', () => {
    const log = [day('2026-03-02', ['Sam']), day('2026-02-01'), day('2026-01-01', [])];
    expect(unsaid(log)).toBe(2);
    expect(partnerTally(log)).toHaveLength(1);
  });

  it('does not count a session that never happened', () => {
    expect(unsaid([day('2026-03-02', undefined, false)])).toBe(0);
  });
});
