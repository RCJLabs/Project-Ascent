import { describe, expect, it } from 'vitest';
import { CsvError, MAX_CELL, MAX_COLUMNS, MAX_ROWS, csvCell, parseCsv, sniffDelimiter, toCsv } from './csv';

/**
 * The parser is the substance (PLAN.md M105).
 *
 * A spreadsheet export arrives as bytes with a separator convention, a
 * quoting convention, a line-ending convention and a byte-order mark, none
 * of which are stated in the file. Every case below is one a real export
 * actually produces.
 */

describe('cells, as they were written', () => {
  it('reads the ordinary case', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('keeps a separator inside quotes', () => {
    expect(parseCsv('name,note\n"Malham, Yorkshire",hard')).toEqual([
      ['name', 'note'],
      ['Malham, Yorkshire', 'hard'],
    ]);
  });

  it('reads a doubled quote as one quote', () => {
    expect(parseCsv('a\n"He said ""go"""')).toEqual([['a'], ['He said "go"']]);
  });

  it('keeps a line ending inside quotes', () => {
    expect(parseCsv('a,b\n"one\ntwo",x')).toEqual([['a', 'b'], ['one\ntwo', 'x']]);
  });

  // Excel on Windows writes CRLF; some older Mac exports write bare CR.
  it('reads every line ending', () => {
    const rows = [['a', 'b'], ['1', '2']];
    expect(parseCsv('a,b\r\n1,2')).toEqual(rows);
    expect(parseCsv('a,b\r1,2')).toEqual(rows);
    expect(parseCsv('a,b\n1,2')).toEqual(rows);
  });

  // Every spreadsheet writes one and none of them means an empty row.
  it('drops the trailing newline without dropping a trailing row', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  // A row someone left blank is a row the importer should refuse out loud,
  // not one the parser should quietly close up.
  it('keeps a blank row in the middle', () => {
    expect(parseCsv('a\n1\n\n2')).toEqual([['a'], ['1'], [''], ['2']]);
  });

  it('strips the byte-order mark Excel puts in front', () => {
    expect(parseCsv('﻿date,grade\n2026-01-01,V4')[0]).toEqual(['date', 'grade']);
  });

  it('keeps an empty cell as an empty cell', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  it('keeps a quoted empty cell', () => {
    expect(parseCsv('a,b\n"",x')).toEqual([['a', 'b'], ['', 'x']]);
  });

  // A quote that opens mid-cell is a literal quote, not a quoting run:
  // `5'10"` is a height, and re-reading it as an open quote would swallow
  // the rest of the file.
  it('treats a quote inside a bare cell as a character', () => {
    expect(parseCsv('a\n5ft10"')).toEqual([['a'], ['5ft10"']]);
  });

  // An unterminated quote swallows separators and line endings alike, so
  // what comes back is one long cell that looks like data.
  it('refuses an unterminated quote rather than eating the file', () => {
    expect(() => parseCsv('a,b\n"open,x')).toThrow(CsvError);
    expect(() => parseCsv('a,b\n"open,x')).toThrow(/never closed/);
  });

  it('is not confused by a quoted final cell that is closed', () => {
    expect(parseCsv('a,b\nx,"done"')).toEqual([['a', 'b'], ['x', 'done']]);
  });
});

describe('the separator, which the file does not state', () => {
  it('finds each one', () => {
    expect(sniffDelimiter('a,b,c')).toBe(',');
    expect(sniffDelimiter('a;b;c')).toBe(';');
    expect(sniffDelimiter('a\tb\tc')).toBe('\t');
  });

  // A locale where the comma is a decimal point exports semicolons.
  it('reads a semicolon file as columns and not as one long cell', () => {
    expect(parseCsv('date;grade\n2026-01-01;V4')).toEqual([
      ['date', 'grade'],
      ['2026-01-01', 'V4'],
    ]);
  });

  it('counts the header only, so prose below it does not vote', () => {
    expect(sniffDelimiter('a;b\nsome, long, sentence, with, commas')).toBe(';');
  });

  it('ignores separators inside a quoted header cell', () => {
    expect(sniffDelimiter('"a;b;c;d",e')).toBe(',');
  });

  it('calls a single column a comma file rather than an error', () => {
    expect(sniffDelimiter('grade')).toBe(',');
    expect(parseCsv('grade\nV4')).toEqual([['grade'], ['V4']]);
  });
});

describe('the caps, which refuse rather than truncate', () => {
  it('refuses too many rows', () => {
    const many = Array.from({ length: MAX_ROWS + 2 }, () => 'x').join('\n');
    expect(() => parseCsv(many)).toThrow(CsvError);
  });

  it('refuses too many columns', () => {
    expect(() => parseCsv(Array.from({ length: MAX_COLUMNS + 2 }, () => 'x').join(','))).toThrow(CsvError);
  });

  it('refuses a cell longer than the cap', () => {
    expect(() => parseCsv(`a\n${'x'.repeat(MAX_CELL + 1)}`)).toThrow(CsvError);
  });

  it('says the number it is refusing on', () => {
    expect(() => parseCsv(`a\n${'x'.repeat(MAX_CELL + 1)}`)).toThrow(new RegExp(`${MAX_CELL}`));
  });

  it('allows a file exactly at the cap', () => {
    expect(parseCsv(`a\n${'x'.repeat(MAX_CELL)}`)).toHaveLength(2);
    expect(parseCsv(Array.from({ length: MAX_COLUMNS }, () => 'x').join(','))).toHaveLength(1);
  });
});

describe('writing it back out', () => {
  it('quotes only what has to be quoted', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('has,comma')).toBe('"has,comma"');
    expect(csvCell('has"quote')).toBe('"has""quote"');
    expect(csvCell('has\nnewline')).toBe('"has\nnewline"');
  });

  it('quotes for the separator actually in use', () => {
    expect(csvCell('a;b', ';')).toBe('"a;b"');
    expect(csvCell('a;b', ',')).toBe('a;b');
  });

  // RFC 4180 says CRLF, and Excel is the most likely thing to open this.
  it('writes CRLF', () => {
    expect(toCsv([['a', 'b'], ['1', '2']])).toBe('a,b\r\n1,2');
  });

  // The only property that matters: what goes out comes back.
  it('round-trips everything the parser can read', () => {
    const rows = [
      ['date', 'place', 'note'],
      ['2026-01-01', 'Malham, Yorkshire', 'He said "go"'],
      ['2026-01-02', 'line\nbreak', ''],
      ['2026-01-03', '', 'plain'],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it('round-trips through each separator', () => {
    const rows = [['a', 'b;c'], ['1', '2,3']];
    for (const d of [',', ';', '\t'] as const) {
      expect(parseCsv(toCsv(rows, d), d)).toEqual(rows);
    }
  });
});
