import { describe, expect, it } from 'vitest';
import type { RestChecklist, Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  ENOUGH_REST,
  REST_DAYS,
  REST_ITEMS,
  describeRestHabits,
  restHabits,
  type RestItem,
} from './restHabits';

/**
 * What the rest day was spent on (PLAN.md M94).
 *
 * The four ticks were collapsed into one bit everywhere they were read —
 * "all four or not" — so a climber who hydrates on every rest day and has
 * never ticked mobility looked exactly like one who does the reverse.
 */

const TODAY = '2026-09-11';
const back = (n: number) => addDays(TODAY, -n);

const NONE: RestChecklist = { hydration: false, mobility: false, zone1: false, sleep: false };
const ALL: RestChecklist = { hydration: true, mobility: true, zone1: true, sleep: true };

function rested(date: string, checklist: RestChecklist | undefined, patch: Partial<Session> = {}): Session {
  return {
    id: `${date}#r`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    ...(checklist ? { restChecklist: checklist } : {}),
    ...patch,
  } as unknown as Session;
}

/** `n` rest days, a week apart, each ticking exactly `items`. */
function ticking(items: RestItem[], n: number): Session[] {
  const checklist = { ...NONE };
  for (const item of items) checklist[item] = true;
  return Array.from({ length: n }, (_, i) => rested(back(i * 7), { ...checklist }));
}

const read = (sessions: Session[]) => restHabits({ sessions, to: TODAY });

describe('reading the ticks one at a time', () => {
  it('counts each of the four separately', () => {
    const h = read(ticking(['hydration', 'sleep'], 6));
    expect(h.items.find((i) => i.item === 'hydration')?.ticked).toBe(6);
    expect(h.items.find((i) => i.item === 'sleep')?.ticked).toBe(6);
    expect(h.items.find((i) => i.item === 'mobility')?.ticked).toBe(0);
  });

  // Always all four, so a zero is visible as a zero rather than as a
  // missing row that reads like nothing happened.
  it('reports every item, including the ones never ticked', () => {
    expect(read(ticking(['hydration'], 6)).items).toHaveLength(REST_ITEMS.length);
  });

  it('puts the most-ticked first', () => {
    const sessions = [...ticking(['hydration', 'mobility'], 6), ...ticking(['hydration'], 4)];
    expect(read(sessions).items[0]?.item).toBe('hydration');
  });

  it('counts a rest day that ticked everything', () => {
    const h = read([...ticking(['hydration'], 5), ...Array.from({ length: 3 }, (_, i) => rested(back(70 + i), ALL))]);
    expect(h.complete).toBe(3);
  });

  /**
   * A rest day logged without the checklist is still a rest day. Counting
   * it against the shares would turn "I did not fill in a form" into "I did
   * not recover".
   */
  it('counts only the rest days that recorded something', () => {
    const h = read([...ticking(['hydration'], 6), ...Array.from({ length: 4 }, (_, i) => rested(back(60 + i), NONE))]);
    expect(h.restDays).toBe(10);
    expect(h.answered).toBe(6);
    expect(h.items.find((i) => i.item === 'hydration')?.share).toBe(1);
  });

  it('ignores a rest day with no checklist at all', () => {
    const h = read([...ticking(['hydration'], 6), rested(back(60), undefined)]);
    expect(h.restDays).toBe(6);
  });

  it('ignores a training session, however it was logged', () => {
    const climbed = rested(back(1), ALL, {
      climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    });
    expect(read([...ticking(['hydration'], 6), climbed]).restDays).toBe(6);
  });

  it('ignores a rest day that was never finished', () => {
    expect(read([...ticking(['hydration'], 6), rested(back(2), ALL, { completed: false })]).answered).toBe(6);
  });

  it('forgets what happened before the window', () => {
    const old = rested(back(REST_DAYS + 5), ALL);
    expect(read([...ticking(['hydration'], 6), old]).restDays).toBe(6);
  });

  // A rest day logged for next Tuesday is not a rest day you have had.
  it('ignores a rest day after the window', () => {
    const ahead = rested(addDays(TODAY, 3), ALL);
    expect(read([...ticking(['hydration'], 6), ahead]).restDays).toBe(6);
  });
});

describe('the one that gets skipped', () => {
  it('names the item you do less than half the time', () => {
    // Hydration always, mobility on two of eight.
    const sessions = [...ticking(['hydration', 'mobility'], 2), ...ticking(['hydration'], 6).map((_, i) => rested(back(20 + i * 7), { ...NONE, hydration: true }))];
    // Zone 1 and sleep are both at zero, so mobility at 2 of 8 is not the
    // bottom — the bottom is a tie, and both of it get named.
    expect(read(sessions).skipped.map((i) => i.item).sort()).toEqual(['sleep', 'zone1']);
  });

  // Nothing to fix when everything clears half, and a "weakest" named
  // there would be an invented failure.
  it('names none when every item clears half', () => {
    expect(read(ticking(['hydration', 'mobility', 'zone1', 'sleep'], 8)).skipped).toEqual([]);
  });

  /**
   * With one item at the bottom rather than three, so the tie rule is not
   * quietly doing this rule's work — which it was, until a mutant that
   * removed the day count survived.
   */
  it('waits for enough rest days to call it a habit', () => {
    const thin = ticking(['hydration', 'mobility', 'zone1'], ENOUGH_REST - 1);
    expect(read(thin).skipped).toEqual([]);
  });

  // Likewise: exactly one item at the bottom, and it is one you do more
  // often than not, so only the share rule can rule it out.
  it('leaves alone an item you do most of the time', () => {
    const sessions = [
      ...ticking(['hydration', 'mobility', 'zone1', 'sleep'], 5),
      ...ticking(['hydration', 'mobility', 'zone1'], 3).map((_, i) =>
        rested(back(40 + i * 7), { hydration: true, mobility: true, zone1: true, sleep: false }),
      ),
    ];
    const h = read(sessions);
    expect(h.items[h.items.length - 1], 'sleep is not the lone lowest').toMatchObject({ item: 'sleep', ticked: 5 });
    expect(h.skipped).toEqual([]);
  });

  it('agrees with the rows on screen', () => {
    const h = read([...ticking(['hydration', 'mobility'], 2), ...ticking(['hydration'], 6).map((_, i) => rested(back(20 + i * 7), { ...NONE, hydration: true }))]);
    expect(h.skipped.map((i) => i.ticked)).toEqual([h.items[h.items.length - 1]!.ticked, h.items[h.items.length - 1]!.ticked]);
  });

  /**
   * Three or four at the bottom is not a weak link, it is the whole
   * checklist — and a sentence naming almost everything says less than the
   * rows above it already do.
   */
  it('names none when three tie at the bottom', () => {
    expect(read(ticking(['hydration'], 8)).skipped).toEqual([]);
  });
});

describe('said out loud', () => {
  const say = (sessions: Session[]) => describeRestHabits(read(sessions));

  it('says nothing on too few rest days', () => {
    expect(say(ticking(['hydration'], ENOUGH_REST - 1))).toBeNull();
  });

  /**
   * A climber who logs rest days and never ticks anything is not doing it
   * wrong, and telling them so would be the app inventing a failure out of
   * a blank.
   */
  it('says nothing when the checklist was never used', () => {
    expect(say(Array.from({ length: 10 }, (_, i) => rested(back(i * 7), NONE)))).toBeNull();
  });

  it('names what you do every time', () => {
    expect(say(ticking(['hydration'], 8))).toMatch(/^Hydration on every one of your last 8 rest days\./);
  });

  it('joins several into a sentence', () => {
    expect(say(ticking(['hydration', 'sleep'], 8))).toMatch(/^Hydration and sleep on every one/);
  });

  it('says so when all four are always ticked', () => {
    expect(say(ticking(['hydration', 'mobility', 'zone1', 'sleep'], 8))).toMatch(/^All four on every one/);
  });

  it('falls back to the count when nothing is unbroken', () => {
    const sessions = [...ticking(['hydration'], 4), ...ticking(['mobility'], 4).map((_, i) => rested(back(40 + i * 7), { ...NONE, mobility: true }))];
    expect(say(sessions)).toMatch(/^0 of your last 8 rest days had all four ticked\./);
  });

  it('names the one that gets skipped, with its numbers', () => {
    const sessions = [...ticking(['hydration', 'mobility'], 2), ...ticking(['hydration'], 6).map((_, i) => rested(back(20 + i * 7), { ...NONE, hydration: true }))];
    expect(say(sessions)).toMatch(/Sleep and walking are the ones you skip most often — 0 of 8\./);
  });

  it('stays quiet about a weak link when there is none', () => {
    expect(say(ticking(['hydration', 'mobility', 'zone1', 'sleep'], 8))).not.toMatch(/skip most often/);
  });
});

describe('the four items', () => {
  // The logger needs "Sleep 8+ hrs" on a checkbox and a sentence needs
  // "sleep"; a second copy of the list is how the two drift apart.
  it('carry both a checkbox label and a word for a sentence', () => {
    for (const item of REST_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.noun.length).toBeGreaterThan(0);
      expect(item.noun).toBe(item.noun.toLowerCase());
    }
  });
});
