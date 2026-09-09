import { describe, expect, it } from 'vitest';
import { parseInline } from './Rich';

describe('parseInline', () => {
  it('leaves plain text alone', () => {
    expect(parseInline('Just words.')).toEqual([{ text: 'Just words.' }]);
  });

  it('reads bold', () => {
    expect(parseInline('a **b** c')).toEqual([
      { text: 'a ' },
      { text: 'b', bold: true },
      { text: ' c' },
    ]);
  });

  it('reads italics', () => {
    expect(parseInline('a _b_ c')).toEqual([
      { text: 'a ' },
      { text: 'b', italic: true },
      { text: ' c' },
    ]);
  });

  it('reads several runs in one line', () => {
    expect(parseInline('**MISSION:** hold the _line_ here')).toEqual([
      { text: 'MISSION:', bold: true },
      { text: ' hold the ' },
      { text: 'line', italic: true },
      { text: ' here' },
    ]);
  });

  it('renders an unmatched marker literally rather than eating the rest', () => {
    // The failure mode worth guarding: a stray marker should look like a
    // typo, not turn half a page bold.
    expect(parseInline('a ** b')).toEqual([{ text: 'a ** b' }]);
    expect(parseInline('a _ b')).toEqual([{ text: 'a _ b' }]);
  });

  it('does not italicise an underscore inside a word', () => {
    expect(parseInline('use ground_zero here')).toEqual([{ text: 'use ground_zero here' }]);
  });

  it('handles a line that is entirely bold', () => {
    expect(parseInline('**all of it**')).toEqual([{ text: 'all of it', bold: true }]);
  });

  it('drops empty runs rather than rendering blank elements', () => {
    expect(parseInline('****')).toEqual([]);
    expect(parseInline('')).toEqual([]);
  });

  it('keeps the text intact whatever the markup', () => {
    const samples = [
      'a **b** c',
      '**MISSION:** go',
      'no markup at all',
      'a ** b',
      'ground_zero and _emphasis_',
    ];
    for (const sample of samples) {
      const joined = parseInline(sample).map((r) => r.text).join('');
      expect(joined.replace(/\s+/g, ' ')).toBe(
        sample.replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|\W)_(.+?)_(\W|$)/g, '$1$2$3').replace(/\s+/g, ' '),
      );
    }
  });
});
