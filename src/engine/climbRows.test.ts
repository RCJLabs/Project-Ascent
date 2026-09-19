import { describe, expect, it } from 'vitest';
import type { Climb } from '@/db/sessions';
import { mergeInto, replaceRow, sameRow } from './climbRows';

/**
 * What makes two tally rows one row (PLAN.md M298).
 *
 * Written out inside `addClimb` since M21, and pulled out here the moment a
 * logged climb could be corrected — an edit lands on the same key an add
 * does, and two spellings of it would drift the first time a field joined.
 */

const climb = (over: Partial<Climb> = {}): Climb =>
  ({ id: 'a', grade: 'V4', scale: 'V', count: 1, result: 'send', ...over }) as Climb;

describe('the key two rows share', () => {
  it('is the grade, the scale and how it went', () => {
    expect(sameRow(climb(), climb({ id: 'b' }))).toBe(true);
    expect(sameRow(climb(), climb({ grade: 'V5' }))).toBe(false);
    expect(sameRow(climb(), climb({ scale: 'YDS' }))).toBe(false);
    expect(sameRow(climb(), climb({ result: 'attempt' }))).toBe(false);
  });

  /** A flash and a redpoint of the same grade are two things that happened. */
  it('separates a flash from a plain send', () => {
    expect(sameRow(climb({ style: 'flash' }), climb())).toBe(false);
    expect(sameRow(climb({ style: 'flash' }), climb({ style: 'onsight' }))).toBe(false);
  });

  /** M108's reason: two V5s on different walls are two rows. */
  it('separates two walls and two rope styles', () => {
    expect(sameRow(climb({ angle: 'roof' }), climb())).toBe(false);
    expect(sameRow(climb({ ropeStyle: 'lead' }), climb({ ropeStyle: 'toprope' }))).toBe(false);
  });

  /** *"A named climb never merges into an unnamed tally."* */
  it('keeps a named climb out of an unnamed tally', () => {
    expect(sameRow(climb({ name: 'Brad Pit' }), climb())).toBe(false);
    expect(sameRow(climb({ name: 'Brad Pit' }), climb({ id: 'b', name: 'Brad Pit' }))).toBe(true);
    // An absent name and an empty one are the same absence.
    expect(sameRow(climb({ name: '' }), climb())).toBe(true);
  });
});

describe('putting a climb into the list', () => {
  it('adds a row nothing matches', () => {
    expect(mergeInto([climb()], climb({ id: 'b', grade: 'V5' }))).toHaveLength(2);
  });

  it('adds to the count of one that matches', () => {
    const list = mergeInto([climb({ count: 3 })], climb({ id: 'b' }));
    expect(list).toHaveLength(1);
    expect(list[0]!.count).toBe(4);
  });

  /** An edit carries the count it had, not one. */
  it('carries whatever count arrives', () => {
    const list = mergeInto([climb({ count: 3 })], climb({ id: 'b', count: 4 }));
    expect(list[0]!.count).toBe(7);
  });

  /**
   * The list is deliberately unsorted (`gym.ts` says why), so a merge keeps
   * the first row's place: a correction that moved a row to the bottom
   * would read as the climb having happened later than it did.
   */
  it('keeps the row where it was, and its id', () => {
    const list = mergeInto([climb({ id: 'first' }), climb({ id: 'other', grade: 'V6' })], climb({ id: 'new' }));
    expect(list.map((c) => c.id)).toEqual(['first', 'other']);
  });
});

describe('correcting a row', () => {
  it('replaces it in place', () => {
    const list = replaceRow([climb({ id: 'x', count: 4 })], 'x', climb({ id: 'x', grade: 'V5', count: 4 }));
    expect(list).toHaveLength(1);
    expect(list[0]!.grade).toBe('V5');
    expect(list[0]!.count).toBe(4);
  });

  /**
   * The one the ordering matters for: a V4 corrected to a V5 the session
   * already holds joins that row rather than sitting beside it as a second
   * V5. Taken out before the merge, or it would find *itself*.
   */
  it('joins a row the correction now matches', () => {
    const list = replaceRow(
      [climb({ id: 'x', count: 2 }), climb({ id: 'y', grade: 'V5', count: 1 })],
      'x',
      climb({ id: 'x', grade: 'V5', count: 2 }),
    );
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('y');
    expect(list[0]!.count).toBe(3);
  });

  it('does not merge a row with its own old self', () => {
    const list = replaceRow([climb({ id: 'x', count: 2 })], 'x', climb({ id: 'x', count: 2 }));
    expect(list).toHaveLength(1);
    expect(list[0]!.count, 'the row absorbed itself').toBe(2);
  });

  it('leaves a list alone when the id is not in it', () => {
    const list = replaceRow([climb({ id: 'x' })], 'nope', climb({ id: 'nope', grade: 'V9' }));
    expect(list.map((c) => c.grade)).toEqual(['V4', 'V9']);
  });
});
