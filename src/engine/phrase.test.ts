import { describe, expect, it } from 'vitest';
import { article, joinCapped, joinList } from './phrase';

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
