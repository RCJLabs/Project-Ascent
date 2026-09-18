import { describe, expect, it } from 'vitest';
import type { Program } from '@/content/types';
import type { BlockReport } from '@/engine/blockReport';
import { buildCardSvg, blockCard } from './shareCard';

/**
 * A block, on a card (PLAN.md M284).
 *
 * `blockReport.ts` computed the report and eight card builders sat beside it,
 * none of them for a block. Twelve weeks end and there was nothing to show.
 *
 * The interesting constraint is that a share card is a highlight by nature,
 * and `describeBlock` refuses to be one in as many words: *"a report that
 * names three improvements and stays quiet about four untested metrics is a
 * highlight reel."*
 */

const program = { id: 'iron_grip', name: 'Iron Grip', weeks: 12 } as Program;

const report = (over: Partial<BlockReport> = {}): BlockReport =>
  ({
    program,
    from: '2026-06-07',
    to: '2026-08-29',
    through: '2026-08-29',
    finished: true,
    tests: [],
    results: [{}, {}, {}, {}, {}, {}],
    comparable: [],
    better: 3,
    worse: 1,
    flat: 0,
    untested: 2,
    ...over,
  }) as BlockReport;

const card = (over: Parameters<typeof blockCard>[0] | Partial<Parameters<typeof blockCard>[0]> = {}) =>
  blockCard({ report: report(), outcome: 'completed', weeksRun: 12, ...over } as Parameters<typeof blockCard>[0]);

describe('what the card says about the block', () => {
  it('names the program and how long it ran', () => {
    const made = card();
    expect(made.headline).toBe('Iron Grip');
    expect(made.eyebrow).toBe('12 weeks · ran to the end');
  });

  /**
   * `yearCard`'s rule, one unit down: *"'412 sessions' in September is a
   * different sentence from '412 sessions' in January, and a card that leaves
   * that out is a card that overstates."* A block left in week six and one run
   * to its last day have identical windows.
   */
  it('says how many weeks were actually run when it was left early', () => {
    expect(card({ outcome: 'left', weeksRun: 6 }).eyebrow).toBe('6 of 12 weeks · left early');
  });

  it('says when it is still running', () => {
    expect(card({ outcome: 'running', weeksRun: 4 }).eyebrow).toBe('4 of 12 weeks · running');
  });

  it('says when nothing is known about how it ended', () => {
    expect(card({ outcome: 'unknown', weeksRun: 12 }).eyebrow).toContain('no record of how it ended');
  });

  /**
   * The page's own words. Two copies would drift the moment one was reworded,
   * and a card saying "abandoned" beside a screen saying "left early" is the
   * shape M169 named — which is why `BLOCK_OUTCOME_WORD` moved to `blocks.ts`.
   */
  it('uses the same words the block list does', async () => {
    const { BLOCK_OUTCOME_WORD } = await import('@/engine/blocks');
    for (const [outcome, word] of Object.entries(BLOCK_OUTCOME_WORD)) {
      expect(card({ outcome: outcome as never, weeksRun: 12 }).eyebrow).toContain(word);
    }
  });
});

describe('what it refuses to leave out', () => {
  /** The whole design. Four numbers that add up to the battery. */
  it('shows what did not move beside what did', () => {
    const stats = card().stats;
    expect(stats.map((s) => s.label)).toEqual(['Improved', 'Held', 'Down', 'Untested']);
    expect(stats.map((s) => s.value)).toEqual(['3', '0', '1', '2']);
  });

  it('keeps untested on the card even at zero', () => {
    const stats = card({ report: report({ untested: 0 }) }).stats;
    expect(stats.find((s) => s.label === 'Untested')?.value).toBe('0');
  });

  /**
   * The case the rule was written against: three improvements and four
   * untested. A card that showed only the three would be the highlight reel
   * `describeBlock` refuses to be.
   */
  it('cannot show three improvements and stay quiet about four untested', () => {
    const made = card({ report: report({ better: 3, flat: 0, worse: 0, untested: 4, results: [{}, {}, {}, {}, {}, {}, {}] as never }) });
    expect(made.stats.find((s) => s.label === 'Untested')?.value).toBe('4');
    expect(made.footnote).toBe('3 of 7 retested');
  });

  it('says plainly when nothing was retested at all', () => {
    const made = card({ report: report({ better: 0, flat: 0, worse: 0, untested: 6 }) });
    expect(made.footnote).toBe('Nothing retested across 6 assessments');
  });

  it('agrees with itself in the singular', () => {
    const made = card({ report: report({ better: 0, flat: 0, worse: 0, untested: 1, results: [{}] as never }) });
    expect(made.footnote).toBe('Nothing retested across 1 assessment');
  });
});

describe('the sessions line', () => {
  it('says what the plan placed and what was done', () => {
    expect(card({ adherence: { done: 38, planned: 42, unplanned: 2 } }).subhead).toBe(
      '38 of 42 sessions the plan placed',
    );
  });

  /** No plan to compare against is not "0 of 0", it is nothing to say. */
  it('says nothing when there is no plan to compare', () => {
    expect(card().subhead).toBeUndefined();
    expect(card({ adherence: null }).subhead).toBeUndefined();
    expect(card({ adherence: { done: 0, planned: 0, unplanned: 0 } }).subhead).toBeUndefined();
  });

  /**
   * Found in a browser, on the sample climber. Its sessions carry no session
   * type, so adherence scores **0 of 23** across six weeks of real training —
   * and a card saying that is the highlight-reel problem inverted.
   */
  it('counts the sessions when none of them matched the plan', () => {
    expect(card({ adherence: { done: 0, planned: 23, unplanned: 18 } }).subhead).toBe(
      '18 sessions, none against the plan',
    );
  });

  it('agrees with itself in the singular', () => {
    expect(card({ adherence: { done: 0, planned: 23, unplanned: 1 } }).subhead).toBe(
      '1 session, none against the plan',
    );
  });

  /** Nothing placed and nothing logged is nothing to say, not "0 sessions". */
  it('says nothing when there were no sessions either way', () => {
    expect(card({ adherence: { done: 0, planned: 23, unplanned: 0 } }).subhead).toBeUndefined();
  });
});

describe('the card it draws', () => {
  it('renders, with the numbers on it', () => {
    const svg = buildCardSvg(card());
    expect(svg).toContain('Iron Grip');
    // Upper-cased by `buildCardSvg`, which draws every stat label that way.
    expect(svg).toContain('UNTESTED');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  /** A program name with an ampersand is not a crash waiting. */
  it('escapes a name that is markup', () => {
    const svg = buildCardSvg(card({ report: report({ program: { ...program, name: 'Crimp & Co' } as Program }) }));
    expect(svg).toContain('Crimp &amp; Co');
    expect(svg).not.toContain('Crimp & Co');
  });
});
