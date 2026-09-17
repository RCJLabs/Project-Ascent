import { describe, expect, it } from 'vitest';
import { kitList, missingKit } from './kit';

/**
 * What a program asks for that this climber has not got (PLAN.md M251).
 *
 * The rule lived inline in `finder.ts`, where it turns a program away, and
 * nowhere else — so `ProgramDetailPage` could list a hangboard as a
 * requirement, offer Start beside it, and never mention that the climber had
 * said they have no board.
 */

describe('what is missing', () => {
  it('names the required kit the climber has not got', () => {
    expect(missingKit(['wall', 'hangboard'], ['wall', 'gym'])).toEqual(['hangboard']);
  });

  it('is empty when they have it all', () => {
    expect(missingKit(['wall', 'hangboard'], ['wall', 'hangboard', 'gym'])).toEqual([]);
  });

  /** `none` is the absence of a requirement, not a thing to be missing. */
  it('never counts nothing as missing', () => {
    expect(missingKit(['none'], [])).toEqual([]);
    expect(missingKit([], [])).toEqual([]);
  });

  it('keeps the order the program lists them in', () => {
    expect(missingKit(['hangboard', 'campus', 'wall'], ['wall'])).toEqual(['hangboard', 'campus']);
  });
});

describe('saying it', () => {
  it('uses the words Settings and the finder use', () => {
    expect(kitList(['hangboard'])).toBe('a hangboard');
    expect(kitList(['hangboard', 'campus'])).toBe('a hangboard and a campus board');
    expect(kitList(['hangboard', 'campus', 'weight'])).toBe(
      'a hangboard, a campus board and a way to add weight',
    );
  });

  /** The finder's helpful-kit line joins with "or", because either will do. */
  it('joins with the word it is given', () => {
    expect(kitList(['gym', 'weight'], 'or')).toBe('weights and bands or a way to add weight');
  });

  it('has nothing to say about nothing', () => {
    expect(kitList([])).toBe('');
  });
});
