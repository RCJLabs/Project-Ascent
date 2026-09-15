import { describe, expect, it } from 'vitest';
import { bustedUrl, chunkUrlFrom, isChunkLoadError } from './chunkError';

/**
 * The two kinds of failure a boundary catches (PLAN.md M187).
 *
 * The Chromium wording below is the one a browser actually produced with a
 * route chunk blocked; the others are the specification's, unverified here
 * and matched loosely on purpose. The important half of this file is the
 * negative one: a bad record must never be read as a failed download, or the
 * card stops saying the true thing about the failure M20 built it for.
 */

describe('a chunk that did not arrive', () => {
  it.each([
    'Failed to fetch dynamically imported module: http://localhost/assets/CoachPage-DFA9Sk34.js',
    'error loading dynamically imported module: https://ascent.rcjlabs.com/assets/GamePage-x.js',
    'Importing a module script failed.',
    'Failed to import: ./chunk.js',
  ])('is recognised from %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('reads the wording whatever its case', () => {
    expect(isChunkLoadError(new Error('FAILED TO FETCH DYNAMICALLY IMPORTED MODULE'))).toBe(true);
  });

  /** The failure the boundary was built for, which must keep its own copy. */
  it.each([
    "Cannot read properties of undefined (reading 'grade')",
    'Unexpected token in JSON at position 0',
    'baseline is not iterable',
    'QuotaExceededError',
    '',
  ])('does not claim %s', (message) => {
    expect(isChunkLoadError(new Error(message))).toBe(false);
  });

  it('survives something that is not an Error at all', () => {
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module: x')).toBe(true);
  });
});

/**
 * The URL a retry has to ask for, and why it has to differ.
 *
 * The browser's module map caches the failed record, so re-importing the
 * same URL never reaches the network — measured. A query string is what
 * makes it a different module to fetch.
 */
describe('the url a retry asks for', () => {
  it('is taken out of the message a browser actually produced', () => {
    expect(
      chunkUrlFrom(
        new Error(
          'Failed to fetch dynamically imported module: http://localhost:4188/assets/CoachPage-kpR0y-2H.js',
        ),
      ),
    ).toBe('http://localhost:4188/assets/CoachPage-kpR0y-2H.js');
  });

  it('is null when the message carries no url, so the caller rethrows', () => {
    expect(chunkUrlFrom(new Error('Importing a module script failed.'))).toBeNull();
    expect(chunkUrlFrom(new Error('/assets/relative-only.js'))).toBeNull();
    expect(chunkUrlFrom(undefined)).toBeNull();
  });

  it('is spelled differently each attempt, or the module map answers from cache', () => {
    const url = 'https://ascent.rcjlabs.com/assets/GamePage-abc.js';
    expect(bustedUrl(url, 1)).toBe(`${url}?retry=1`);
    expect(bustedUrl(url, 2)).not.toBe(bustedUrl(url, 1));
    // And it stays the same chunk, not a different path.
    expect(new URL(bustedUrl(url, 3)).pathname).toBe(new URL(url).pathname);
  });

  it('does not stack query strings across attempts', () => {
    expect(bustedUrl(bustedUrl('https://x/a.js', 1), 2)).toBe('https://x/a.js?retry=2');
  });
});
