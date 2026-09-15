import { describe, expect, it } from 'vitest';
import type { Injury } from '@/store/profile';
import { describeRecurrence, ordinal, recurrenceFor } from './injuryLog';

/**
 * How often a part has gone (PLAN.md M177).
 *
 * `injuryHistory` reads inside **one** episode, scoped to a live injury's
 * `since`. Until this milestone a healed injury was *deleted* — `removeInjury`
 * filtered it out of the array and `RecordNotFound` said so out loud:
 * *"Recovered injuries are cleared from the tracker."* So the reading died
 * with the record, and the question a physio asks second — has this happened
 * before? — had no answer at all.
 *
 * The app's own content says why that matters: M166's guide calls finger
 * injuries *"slow to heal and quick to recur"* and names golfer's elbow,
 * tennis elbow and rotator cuff trouble as *"the three things that end more
 * seasons than falling off does"*.
 */

const healed = (part: Injury['part'], since: string, healedAt: string, id = `${part}-${since}`): Injury => ({
  id,
  part,
  since,
  healedAt,
  severity: 'managing',
  status: 'active',
});

const live = (part: Injury['part'], since: string): Injury => ({
  id: `${part}-live`,
  part,
  since,
  severity: 'managing',
  status: 'active',
});

describe('counting the episodes', () => {
  it('says nothing about a part that has never gone', () => {
    const none = recurrenceFor('fingers', []);
    expect(none.past).toEqual([]);
    expect(none.total).toBe(0);
    expect(describeRecurrence(none)).toBeNull();
  });

  it('says nothing on a first episode, which is most of them', () => {
    const first = recurrenceFor('fingers', [], live('fingers', '2026-03-01'));
    expect(first.total).toBe(1);
    expect(describeRecurrence(first)).toBeNull();
  });

  it('counts the live one among them', () => {
    const again = recurrenceFor(
      'fingers',
      [healed('fingers', '2025-01-06', '2025-02-10')],
      live('fingers', '2026-03-02'),
    );
    expect(again.past).toHaveLength(1);
    expect(again.total).toBe(2);
  });

  it('keeps each part apart', () => {
    const store = [healed('fingers', '2025-01-06', '2025-02-10'), healed('elbow', '2025-06-01', '2025-07-01')];
    expect(recurrenceFor('fingers', store).past).toHaveLength(1);
    expect(recurrenceFor('shoulder', store).past).toHaveLength(0);
  });

  it('orders them oldest first however they were stored', () => {
    const store = [
      healed('fingers', '2026-01-01', '2026-02-01'),
      healed('fingers', '2024-01-01', '2024-02-01'),
      healed('fingers', '2025-01-01', '2025-02-01'),
    ];
    expect(recurrenceFor('fingers', store).past.map((e) => e.since)).toEqual([
      '2024-01-01',
      '2025-01-01',
      '2026-01-01',
    ]);
  });

  it('measures how long each ran and how long the climber was clear', () => {
    const again = recurrenceFor(
      'fingers',
      [healed('fingers', '2025-01-01', '2025-02-01')],
      live('fingers', '2025-03-03'),
    );
    expect(again.past[0]!.days).toBe(31);
    expect(again.clearDays).toBe(30);
  });

  /** No live injury, no gap to measure. */
  it('leaves the gap unmeasured when nothing is live', () => {
    expect(recurrenceFor('fingers', [healed('fingers', '2025-01-01', '2025-02-01')]).clearDays).toBeNull();
  });

  /** A record with no healed date is not an episode — it never ended. */
  it('ignores a record that was never marked healed', () => {
    const unfinished = { ...healed('fingers', '2025-01-01', '2025-02-01') };
    delete unfinished.healedAt;
    expect(recurrenceFor('fingers', [unfinished]).past).toEqual([]);
  });
});

describe('what it says', () => {
  it('names which time this is, and what came before', () => {
    const said = describeRecurrence(
      recurrenceFor(
        'fingers',
        [healed('fingers', '2025-01-01', '2025-02-01'), healed('fingers', '2025-06-01', '2025-06-21')],
        live('fingers', '2026-03-02'),
      ),
    )!;
    expect(said).toContain('The third time this fingers has gone');
    expect(said).toContain('31 days');
    expect(said).toContain('20 days');
    expect(said).toContain('clear for 254 days');
  });

  /** With nothing live it is a history rather than a count-so-far. */
  it('reads as a past record when nothing is wrong now', () => {
    const said = describeRecurrence(recurrenceFor('elbow', [healed('elbow', '2025-01-01', '2025-03-02')]))!;
    expect(said).toContain('One episode on this elbow before, healed');
    expect(said).not.toMatch(/time this/);
  });

  /**
   * And it says nothing about what any of it means. This module refuses a
   * co-occurrence for reasons it sets out at length — a keyword scan is not
   * epidemiology — and the same line holds here: two episodes is not a
   * pattern and a gap is not a prognosis.
   */
  it('makes no claim about what the pattern means', () => {
    const said = describeRecurrence(
      recurrenceFor('fingers', [healed('fingers', '2025-01-01', '2025-02-01')], live('fingers', '2025-03-03')),
    )!;
    expect(said).not.toMatch(/risk|likely|because|caused|prone|weak|should/i);
  });

  it('runs out of words before it runs out of numbers', () => {
    expect(ordinal(2)).toBe('second');
    expect(ordinal(8)).toBe('eighth');
    expect(ordinal(9)).toBe('9th');
  });

  /** And the numbers read as English. `21th` looks like a bug, and the one
   *  place this shows is a sentence about somebody's body. */
  it('uses the suffix the number actually takes', () => {
    expect([21, 22, 23, 24].map(ordinal)).toEqual(['21st', '22nd', '23rd', '24th']);
    expect([11, 12, 13].map(ordinal)).toEqual(['11th', '12th', '13th']);
    expect([101, 112].map(ordinal)).toEqual(['101st', '112th']);
  });
});
