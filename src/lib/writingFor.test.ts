import { beforeEach, describe, expect, it } from 'vitest';
import { clearWritingFor, holdWritingFor, writingFor } from './writingFor';

/**
 * One slot, keyed by the program it belongs to (PLAN.md M322).
 *
 * The lifetime is the whole design here, so it is what is tested: a note
 * about one athlete's block must not appear above a different program, and
 * nothing may reach storage.
 */

const block = (programId: string) => ({
  programId,
  program: 'Iron Grip',
  summary: 'Fingers up, pull flat.',
  better: 2,
  worse: 0,
  flat: 1,
  untested: 4,
});

beforeEach(() => {
  clearWritingFor();
});

describe('the slot', () => {
  it('is empty until something is held', () => {
    expect(writingFor('p1')).toBeNull();
  });

  it('gives back what was held, for the program it was held for', () => {
    holdWritingFor(block('p1'));
    expect(writingFor('p1')?.program).toBe('Iron Grip');
    expect(writingFor('p1')?.untested).toBe(4);
  });

  it('reads null for any other program', () => {
    // The whole reason it is keyed: a coach who opens one of their own
    // programs after writing for an athlete must not see the athlete's block
    // above it, and no page has to remember to clear.
    holdWritingFor(block('p1'));
    expect(writingFor('p2')).toBeNull();
  });

  it('does not clear as it is read', () => {
    // Unlike `launchFile.ts`, which takes. This is read on every render of a
    // page a coach may sit on for an hour.
    holdWritingFor(block('p1'));
    expect(writingFor('p1')).not.toBeNull();
    expect(writingFor('p1')).not.toBeNull();
  });

  it('holds one, not a list', () => {
    holdWritingFor(block('p1'));
    holdWritingFor(block('p2'));
    expect(writingFor('p1')).toBeNull();
    expect(writingFor('p2')).not.toBeNull();
  });

  it('is emptied on request', () => {
    holdWritingFor(block('p1'));
    clearWritingFor();
    expect(writingFor('p1')).toBeNull();
  });

  it('writes nothing to storage', () => {
    // The promise `/shared` makes in its own copy. A slot that quietly used
    // `localStorage` would survive a reload and make that sentence false.
    holdWritingFor(block('p1'));
    expect(Object.keys(globalThis.localStorage ?? {})).toEqual([]);
    expect(Object.keys(globalThis.sessionStorage ?? {})).toEqual([]);
  });
});
