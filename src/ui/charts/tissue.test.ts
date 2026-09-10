import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M27's "done when": a returning climber can see which tissue has been
 * quietest.
 *
 * The attribution is tested in `engine/tissueLoad.test.ts`. These are the
 * things the drawing has to keep saying, and most of them exist because the
 * underlying engine is a keyword scan rather than a measurement.
 */

const SRC = readFileSync('src/ui/charts/TissueBars.tsx', 'utf8');
const ENGINE = readFileSync('src/engine/tissueLoad.ts', 'utf8');

describe('quiet and unseen are different facts', () => {
  it('shows how long since, not just how much', () => {
    // A bar alone averages "nothing for three weeks" and "never named in
    // your log" into one grey answer.
    expect(SRC).toContain('daysSinceLoaded');
    expect(SRC).toContain("'not seen'");
  });

  it('lists a tissue nothing touched rather than dropping the row', () => {
    // A missing row is indistinguishable from a zero row, and what is not
    // being loaded is half the reason to look.
    expect(ENGINE).toContain('ALL_PARTS.map');
  });

  it('never calls an unseen tissue the quietest', () => {
    expect(ENGINE).toContain('p.sessions > 0');
    expect(SRC).toContain('quietestLoaded(');
  });

  it('never calls a tie the quietest', () => {
    // A grades-only logger loads the four climbing tissues equally, and the
    // "quietest" of those is whichever the sort put last.
    expect(ENGINE).toContain('TIE_SHARE');
    expect(ENGINE).toMatch(/quiet\.share >= TIE_SHARE/);
  });
});

describe('the scan does not pretend to be a measurement', () => {
  it('says where the numbers came from', () => {
    expect(SRC).toContain('not a measurement');
  });

  it('reports the sessions it could not read', () => {
    expect(SRC).toContain('unreadSessions');
  });

  it('gives no total, because the parts do not sum to one', () => {
    // Load is attributed whole to each tissue a session touched, so a
    // percentage-of-total would be a number with no meaning.
    expect(SRC).not.toMatch(/of total|totalLoad/i);
    expect(ENGINE).toMatch(/never (against|to) a sum/i);
  });

  it('prescribes nothing', () => {
    expect(SRC).not.toMatch(/you should|rest it|back off|take a week/i);
  });
});

describe('the quietest is marked without colour', () => {
  it('uses a shape and a weight', () => {
    expect(SRC).toContain('<Circle');
    expect(SRC).toContain("quiet ? 'font-bold' : ''");
  });

  it('leaves room for the longest label plus its marker', () => {
    // Bold plus the ring pushed "shoulder" past 64px and the bar overlapped
    // it — measured in dark mode.
    expect(SRC).toContain('w-24 shrink-0 flex items-center');
  });
});

describe('what a screen reader gets', () => {
  it('is a table with the same three columns', () => {
    expect(SRC).toContain('<caption>');
    expect(SRC).toMatch(/<div className="sr-only">\s*<table>/);
    expect(SRC.match(/<th scope="col">/g)).toHaveLength(3);
  });

  it('hides the bar list rather than reading it out twice', () => {
    expect(SRC).toContain('aria-hidden>');
  });
});
