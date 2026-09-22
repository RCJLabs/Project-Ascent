import { describe, expect, it } from 'vitest';
import { code, bare } from './source';

/**
 * The stripper six scanners read source through (PLAN.md M314).
 *
 * It had no tests of its own while it was seven copies in six files, which
 * is how three of them came to use `/\/\/.*$/gm` and eat the second half of
 * every line carrying a URL. The battery made the point: putting that
 * version back failed nothing, because no scanned file happens to have a
 * URL on a line a rule cares about *today*. A shared helper's behaviour is
 * its own subject.
 */

describe('code: comments out, strings left alone', () => {
  it('takes out a block comment', () => {
    expect(code('/** reads state.feet */\nconst a = 1;')).not.toMatch(/feet/);
    expect(code('/** reads state.feet */\nconst a = 1;')).toContain('const a = 1;');
  });

  it('takes out a line comment', () => {
    expect(code('const a = 1; // reads state.feet')).not.toMatch(/feet/);
    expect(code('const a = 1; // reads state.feet')).toContain('const a = 1;');
  });

  it('keeps a URL whole, which is the half three of these used to lose', () => {
    const line = "const home = 'https://ascent.rcjlabs.com/guide';";
    expect(code(line)).toContain('rcjlabs.com/guide');
    // The naive form is `.replace(/\/\/.*$/gm, ' ')`, which would cut here.
    expect(code(line)).toContain('https:');
  });

  it('still strips a real comment on a line that also holds a URL', () => {
    const line = "const home = 'https://ascent.rcjlabs.com'; // reads state.feet";
    expect(code(line)).toContain('rcjlabs.com');
    expect(code(line)).not.toMatch(/feet/);
  });

  it('leaves string literals alone, because a template carries real reads', () => {
    const line = 'const s = `${history.elapsed} days`;';
    expect(code(line)).toContain('history.elapsed');
  });
});

describe('bare: comments and strings both out', () => {
  it('blanks every kind of literal', () => {
    expect(bare(`const a = 'fetch(x)';`)).not.toMatch(/fetch\(/);
    expect(bare('const a = "fetch(x)";')).not.toMatch(/fetch\(/);
    expect(bare('const a = `fetch(x)`;')).not.toMatch(/fetch\(/);
  });

  it('leaves a real call standing', () => {
    expect(bare('await fetch(url);')).toMatch(/fetch\(/);
  });

  it('strips comments too, so it is code with the prose off', () => {
    expect(bare('// calls fetch(x)\nconst a = 1;')).not.toMatch(/fetch\(/);
  });

  /**
   * An escaped quote does not end the literal.
   *
   * The call has to sit *between* two literals for this to bite, which the
   * first version of this test missed: with only one literal after the
   * escape there is no closing quote to pair with, so the naive pattern
   * leaves the call standing by luck and the test passes either way. Two
   * literals, and the naive one swallows everything in between —
   *
   *   source  const a = 'it\'s'; fetch(url); const b = 'x';
   *   naive   const a = ''s''x';
   *   this    const a = ''; fetch(url); const b = '';
   */
  it('keeps an escaped quote from ending the literal early', () => {
    const src = `const a = 'it\\'s'; fetch(url); const b = 'x';`;
    expect(bare(src)).toMatch(/fetch\(/);
    expect(bare(src)).toBe(`const a = ''; fetch(url); const b = '';`);
  });
});
