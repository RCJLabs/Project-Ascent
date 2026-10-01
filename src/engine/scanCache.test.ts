import { describe, expect, it } from 'vitest';
import { rulesInText, scanText } from './bodyLoad';

/**
 * The body-load scan remembers its answers by text (PLAN.md M356).
 *
 * One render of Home with the sample climber scanned 804 texts, 117 of them
 * distinct. The answer depends on the text alone, so the cache is only safe
 * if it is keyed on all of it: these check that, and that it stays bounded.
 */

describe('the scan, remembered', () => {
  it('hands back the same answer for the same text, without scanning again', () => {
    const text = 'Max hangs on the 20mm edge, then a campus ladder';
    const first = rulesInText(text);
    expect(first.length).toBeGreaterThan(0);
    expect(rulesInText(text)).toBe(first);
  });

  it('is keyed on the whole text, so a negation still counts', () => {
    // The same words up to the last few, and the opposite answer: a cache
    // keyed on anything less than the text would hand one the other's.
    const said = 'Finger day: hangboard';
    const ruledOut = 'Finger day: no hangboard';
    expect(rulesInText(said)).toEqual(['fingers']);
    expect(rulesInText(ruledOut)).toEqual([]);
    expect(rulesInText(said)).toEqual(['fingers']);
  });

  it('cannot be changed by a caller, since every caller shares it', () => {
    const found = rulesInText('Weighted pull-ups, 3 x 5');
    expect(Object.isFrozen(found)).toBe(true);
  });

  it('gives the findings the same as before for a text it has seen', () => {
    const text = 'Repeaters 7:3 on the beastmaker';
    expect(scanText(text)).toEqual(scanText(text));
    expect(scanText(text).length).toBeGreaterThan(0);
  });

  it('stays bounded: past its limit it lets old answers go and finds them again', () => {
    const text = 'Limit bouldering on the board, crimps';
    const first = rulesInText(text);
    for (let i = 0; i < 2100; i += 1) rulesInText(`filler text number ${i}`);
    const again = rulesInText(text);
    expect(again).toEqual(first);
    expect(again).not.toBe(first);
  });
});
