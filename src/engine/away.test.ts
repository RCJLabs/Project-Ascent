import { describe, expect, it } from 'vitest';
import {
  AWAY_KINDS,
  AWAY_LABELS,
  type AwayPeriod,
  awayLength,
  awayName,
  awayOn,
  awayOverlapping,
  cleanNote,
  EXPLAINS_FRACTION,
  explainsGap,
  isAwayPeriod,
  newAwayId,
  NOTE_LIMIT,
  wasClimbing,
} from './away';

function period(from: string, to: string, over: Partial<AwayPeriod> = {}): AwayPeriod {
  return {
    id: `p-${from}`,
    from,
    to,
    kind: 'trip',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

describe('what the kinds are for', () => {
  it('calls only a trip climbing', () => {
    expect(wasClimbing('trip')).toBe(true);
    expect(wasClimbing('rest')).toBe(false);
    expect(wasClimbing('injured')).toBe(false);
    expect(wasClimbing('life')).toBe(false);
  });

  /**
   * The list and the labels are the two halves of one thing, and a kind with
   * no label reads as `undefined` on a chip rather than failing anywhere.
   */
  it('labels every kind it offers', () => {
    for (const kind of AWAY_KINDS) {
      expect(AWAY_LABELS[kind], kind).toBeTruthy();
    }
    expect(Object.keys(AWAY_LABELS).sort()).toEqual([...AWAY_KINDS].sort());
  });
});

describe('a stored period the app did not write', () => {
  it('takes a well-formed one', () => {
    expect(isAwayPeriod(period('2026-06-01', '2026-06-14'))).toBe(true);
  });

  it('refuses a half-typed date rather than doing NaN arithmetic on it', () => {
    expect(isAwayPeriod(period('2026-06', '2026-06-14'))).toBe(false);
    expect(isAwayPeriod(period('2026-06-01', 'soon'))).toBe(false);
  });

  it('refuses a range that ends before it starts', () => {
    expect(isAwayPeriod(period('2026-06-14', '2026-06-01'))).toBe(false);
  });

  it('refuses a kind it has no reading for', () => {
    expect(isAwayPeriod(period('2026-06-01', '2026-06-02', { kind: 'holiday' as never }))).toBe(
      false,
    );
  });

  it('refuses the shapes an old schema leaves behind', () => {
    expect(isAwayPeriod(null)).toBe(false);
    expect(isAwayPeriod('2026-06-01')).toBe(false);
    expect(isAwayPeriod({})).toBe(false);
    expect(isAwayPeriod(period('2026-06-01', '2026-06-02', { id: '' }))).toBe(false);
    expect(isAwayPeriod(period('2026-06-01', '2026-06-02', { note: 7 as never }))).toBe(false);
  });

  it('takes one with no note, which is the normal case', () => {
    const { note: _note, ...rest } = period('2026-06-01', '2026-06-02', { note: 'x' });
    expect(isAwayPeriod(rest)).toBe(true);
  });
});

describe('the note', () => {
  it('collapses whitespace the way a name would', () => {
    expect(cleanNote('  Font   26 ')).toBe('Font 26');
  });

  it('is nothing rather than empty, so a blank field stores no field', () => {
    expect(cleanNote('   ')).toBeUndefined();
  });

  it('cannot become a journal entry', () => {
    expect(cleanNote('x'.repeat(NOTE_LIMIT + 40))).toHaveLength(NOTE_LIMIT);
  });
});

describe('how long a period is', () => {
  it('counts both ends, so a single day is one day', () => {
    expect(awayLength(period('2026-06-01', '2026-06-01'))).toBe(1);
    expect(awayLength(period('2026-06-01', '2026-06-14'))).toBe(14);
  });
});

describe('the period covering a day', () => {
  const font = period('2026-06-01', '2026-06-14');
  const wet = period('2026-06-05', '2026-06-06', { id: 'wet', kind: 'rest' });

  it('finds the one the day sits in, both ends included', () => {
    expect(awayOn([font], '2026-06-01')?.id).toBe(font.id);
    expect(awayOn([font], '2026-06-14')?.id).toBe(font.id);
  });

  it('says nothing about a day outside every range', () => {
    expect(awayOn([font], '2026-05-31')).toBeNull();
    expect(awayOn([font], '2026-06-15')).toBeNull();
    expect(awayOn(undefined, '2026-06-02')).toBeNull();
  });

  /**
   * The documented tie-break, and the reason for it: a climber who marks the
   * month and then marks one wet day inside it has said two true things, and
   * the one that explains the stretch is the longer.
   */
  it('prefers the longer where two overlap', () => {
    expect(awayOn([wet, font], '2026-06-05')?.id).toBe(font.id);
    expect(awayOn([font, wet], '2026-06-05')?.id).toBe(font.id);
  });
});

describe('periods touching a window', () => {
  const font = period('2026-06-01', '2026-06-14');
  const flu = period('2026-07-01', '2026-07-03', { id: 'flu', kind: 'injured' });

  it('counts a period that overlaps an end rather than sitting inside', () => {
    expect(awayOverlapping([font], '2026-06-10', '2026-06-20').map((p) => p.id)).toEqual([font.id]);
    expect(awayOverlapping([font], '2026-05-20', '2026-06-02').map((p) => p.id)).toEqual([font.id]);
  });

  it('drops one that only touches the day after', () => {
    expect(awayOverlapping([font], '2026-06-15', '2026-06-20')).toEqual([]);
  });

  it('puts the longest first', () => {
    expect(awayOverlapping([flu, font], '2026-06-01', '2026-07-31').map((p) => p.id)).toEqual([
      font.id,
      flu.id,
    ]);
  });
});

describe('what explains a quiet stretch', () => {
  /**
   * The rule this exists for. Three days of flu inside a 24-day layoff is not
   * the reason for the layoff, and a tip that named it would tell a climber
   * three weeks off that they had had a cold.
   */
  it('refuses a short marker against a long gap', () => {
    const flu = period('2026-07-01', '2026-07-03', { kind: 'injured' });
    expect(explainsGap([flu], '2026-07-01', '2026-07-24')).toBeNull();
  });

  it('takes one that covers enough of it', () => {
    const font = period('2026-06-01', '2026-06-14');
    expect(explainsGap([font], '2026-06-01', '2026-06-16')?.id).toBe(font.id);
  });

  /**
   * Days *of the gap*, not days of the period: a month in Spain either side
   * of a four-day gap explains all four of them.
   */
  it('measures the overlap and not the period', () => {
    const spain = period('2026-05-01', '2026-06-30');
    expect(explainsGap([spain], '2026-06-10', '2026-06-13')?.id).toBe(spain.id);
  });

  /**
   * And the same rule the other way, which is the half the first draft got
   * wrong and a mutant proved: a long period barely touching the gap explains
   * nothing. Without the clamp the period's own length is what gets measured,
   * so a marker running past either end of the gap would explain any gap at
   * all.
   */
  it('refuses a long period that only clips the end of the gap', () => {
    // Two days of a twenty-day gap, and forty more days after it — the shape
    // a climber makes by marking a trip that has not finished yet.
    const upcoming = period('2026-06-19', '2026-07-31');
    expect(explainsGap([upcoming], '2026-06-01', '2026-06-20')).toBeNull();
  });

  it('refuses a long period that only clips the start of the gap', () => {
    const before = period('2026-01-01', '2026-06-02');
    expect(explainsGap([before], '2026-06-01', '2026-06-20')).toBeNull();
  });

  it('sits exactly on the fraction it documents', () => {
    // A ten-day gap with five days marked: the boundary, and it counts.
    const half = period('2026-06-01', '2026-06-05');
    expect(EXPLAINS_FRACTION).toBe(0.5);
    expect(explainsGap([half], '2026-06-01', '2026-06-10')?.id).toBe(half.id);
    const under = period('2026-06-01', '2026-06-04');
    expect(explainsGap([under], '2026-06-01', '2026-06-10')).toBeNull();
  });

  it('says nothing when there is nothing to say', () => {
    expect(explainsGap(undefined, '2026-06-01', '2026-06-10')).toBeNull();
    expect(explainsGap([], '2026-06-01', '2026-06-10')).toBeNull();
  });
});

describe('what a period is called', () => {
  it('uses the climber’s own words when there are any', () => {
    expect(awayName(period('2026-06-01', '2026-06-14', { note: "Font '26" }))).toBe("Font '26");
  });

  it('falls back to the kind, lower-cased so it reads inside a sentence', () => {
    expect(awayName(period('2026-06-01', '2026-06-14', { kind: 'injured' }))).toBe('injured');
    expect(awayName(period('2026-06-01', '2026-06-14'))).toBe('climbing trip');
  });
});

describe('the id', () => {
  it('is distinct across a tight loop', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newAwayId()));
    expect(ids.size).toBe(200);
  });
});
