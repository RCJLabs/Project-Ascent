import { describe, expect, it } from 'vitest';
import { article, joinCapped, joinList, counted, plural } from './phrase';

/**
 * The two rules that collided in M84's first draft: an Oxford-less join and
 * a truncation, each adding its own "and".
 */

describe('joining a list', () => {
  it('handles none, one and two', () => {
    expect(joinList([])).toBe('');
    expect(joinList(['A'])).toBe('A');
    expect(joinList(['A', 'B'])).toBe('A and B');
  });

  it('commas the middle and ands the last', () => {
    expect(joinList(['A', 'B', 'C'])).toBe('A, B and C');
    expect(joinList(['A', 'B', 'C', 'D'])).toBe('A, B, C and D');
  });
});

describe('joining a list that is cut short', () => {
  it('joins normally when it fits', () => {
    expect(joinCapped(['A', 'B', 'C'], 3)).toBe('A, B and C');
    expect(joinCapped(['A'], 3)).toBe('A');
  });

  it('counts the remainder rather than naming it', () => {
    expect(joinCapped(['A', 'B', 'C', 'D', 'E'], 3)).toBe('A, B, C and 2 more');
  });

  it('never says and twice', () => {
    // "Max Hang, Repeater Weight and Lock-Off and 2 more" — the bug.
    const said = joinCapped(['A', 'B', 'C', 'D', 'E'], 3);
    expect(said.match(/ and /g)?.length).toBe(1);
  });

  it('counts one remainder as one', () => {
    expect(joinCapped(['A', 'B', 'C', 'D'], 3)).toBe('A, B, C and 1 more');
  });
});

describe('a or an', () => {
  // The sample climber put "you have logged a elbow injury" on a home
  // screen: nothing had ever had an elbow injury and a plateau at once.
  it('reads the first letter', () => {
    expect(article('elbow')).toBe('an');
    expect(article('ankle')).toBe('an');
    expect(article('shoulder')).toBe('a');
    expect(article('knee')).toBe('a');
  });

  it('is not fooled by padding or case', () => {
    expect(article(' Elbow ')).toBe('an');
  });

  it('reads the first word of a list, which is the one it precedes', () => {
    expect(article('elbow and knee')).toBe('an');
    expect(article('knee and elbow')).toBe('a');
  });
});

describe('agreement', () => {
  it('gives the word the number in front of it deserves', () => {
    expect(plural(1, 'session')).toBe('session');
    expect(plural(0, 'session')).toBe('sessions');
    expect(plural(2, 'session')).toBe('sessions');
  });

  it('takes the plural where English does not add an s', () => {
    // The skills tree counts tries, not trys.
    expect(plural(1, 'try', 'tries')).toBe('try');
    expect(plural(3, 'try', 'tries')).toBe('tries');
  });

  it('says the count and the word together', () => {
    // The defect this was written for: the Progress header read
    // "1 sessions logged" after a climber's first session.
    expect(counted(1, 'session')).toBe('1 session');
    expect(counted(0, 'session')).toBe('0 sessions');
    expect(counted(12, 'session')).toBe('12 sessions');
    expect(counted(1, 'try', 'tries')).toBe('1 try');
  });

  it('agrees with itself, whichever of the two is asked', () => {
    for (const n of [0, 1, 2, 11]) {
      expect(counted(n, 'day')).toBe(`${n} ${plural(n, 'day')}`);
    }
  });
});
