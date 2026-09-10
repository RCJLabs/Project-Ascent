import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M28's "done when": "am I actually training more?" is one tap from
 * Progress. The arithmetic is tested in `engine/blockCompare.test.ts`.
 */

const SRC = readFileSync('src/ui/charts/BlockCompare.tsx', 'utf8');
const PAGE = readFileSync('src/features/progress/ProgressPage.tsx', 'utf8');

describe('it is on the page, not behind one', () => {
  it('sits on Progress itself', () => {
    expect(PAGE).toContain('<BlockCompareTable');
    expect(PAGE).toContain('compareBlocks(');
  });

  it('is the only card there that is not about the present', () => {
    // Placed above the tissue and trend cards because this is the question
    // a climber opens the page with.
    expect(PAGE.indexOf('<BlockCompareTable')).toBeLessThan(PAGE.indexOf('<TissueBars'));
  });
});

describe('the comparison takes no side', () => {
  it('paints no direction green or red', () => {
    // The app has no idea which is good: a deload block is supposed to show
    // as a decline, and so is the month after a comp.
    expect(SRC).not.toMatch(/text-(positive|danger|critical|warn)/);
  });

  it('shows the direction as a shape as well as a sign', () => {
    expect(SRC).toContain('ArrowUp');
    expect(SRC).toContain('ArrowDown');
    expect(SRC).toContain('ArrowRight');
  });

  it('says outright that down is not worse', () => {
    expect(PAGE).toContain('Up is not better and down is not worse');
  });
});

describe('the rows', () => {
  it('come from the shared list rather than its own', () => {
    // The "not sorted by flattery" rule is only a rule while there is one
    // list, and the year review already had it.
    expect(SRC).toContain('blockChanges(');
    expect(readFileSync('src/engine/blockCompare.ts', 'utf8')).toContain('changesBetween(');
  });

  it('are never re-sorted for presentation', () => {
    expect(SRC).not.toMatch(/\.sort\(/);
  });
});

describe('what a screen reader gets', () => {
  it('is a real table with a caption', () => {
    expect(SRC).toContain('<caption');
    expect(SRC).toContain('scope="row"');
    expect(SRC.match(/scope="col"/g)?.length).toBe(4);
  });

  it('lets a wide table scroll inside itself', () => {
    expect(SRC).toContain('overflow-x-auto');
  });
});
