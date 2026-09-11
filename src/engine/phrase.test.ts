import { describe, expect, it } from 'vitest';
import { joinCapped, joinList } from './phrase';

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
