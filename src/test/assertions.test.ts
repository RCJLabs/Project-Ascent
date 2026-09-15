import { describe, expect, it } from 'vitest';
import { ASSERTS_WITHOUT_EXPECT, noAssertionMade } from './assertions';

/**
 * The rule that every test asserts something, tested (PLAN.md M197).
 *
 * A guard that only runs inside the machinery it guards cannot be shown to
 * work: the suite passing is what it claims, and a broken guard produces
 * exactly that. So the decision is a pure function and this is where it is
 * held to it.
 */

const SOMEWHERE = 'src/engine/anything.test.ts > a test that asserts nothing';

describe('a test that asserts nothing cannot pass', () => {
  it('complains when no assertion was made', () => {
    const said = noAssertionMade(0, SOMEWHERE);
    expect(said).not.toBeNull();
    expect(said).toContain(SOMEWHERE);
    expect(said).toContain('cannot fail');
  });

  it('says nothing when one was', () => {
    expect(noAssertionMade(1, SOMEWHERE)).toBeNull();
  });

  it('counts one as enough and zero as none', () => {
    // The threshold, either side of itself, because a rule that fired at
    // two would pass both tests above.
    expect(noAssertionMade(1, SOMEWHERE)).toBeNull();
    expect(noAssertionMade(2, SOMEWHERE)).toBeNull();
    expect(noAssertionMade(0, SOMEWHERE)).not.toBeNull();
  });

  it('tells the reader what to do about it', () => {
    expect(noAssertionMade(0, SOMEWHERE)).toContain('src/test/assertions.ts');
  });
});

describe('the exemptions', () => {
  it('lets a named one through', () => {
    const exempt = [...ASSERTS_WITHOUT_EXPECT][0]!;
    expect(noAssertionMade(0, exempt)).toBeNull();
  });

  it('is a list somebody wrote, not an empty set that exempts nothing', () => {
    // An empty set would pass every test above and quietly exempt nobody —
    // which is the failure this whole rule exists to notice (PLAN.md M169).
    expect(ASSERTS_WITHOUT_EXPECT.size).toBeGreaterThan(0);
    expect(ASSERTS_WITHOUT_EXPECT.size).toBeLessThan(20);
    for (const key of ASSERTS_WITHOUT_EXPECT) {
      expect(key, `${key} is not "<file> > <test name>"`).toMatch(/^src\/.+\.tsx?\s>\s.+/);
    }
  });

  it('exempts only what is on the list', () => {
    expect(noAssertionMade(0, 'src/engine/not-on-the-list.test.ts > nope')).not.toBeNull();
  });
});
