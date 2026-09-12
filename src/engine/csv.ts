/**
 * Reading and writing delimited text (PLAN.md M105).
 *
 * The app's first and only parser for a *tabular* document someone else
 * produced. `programFile.ts` reads foreign JSON and states the rule this
 * follows too — **rebuild, never cast** — but JSON arrives already
 * structured, and a spreadsheet export does not: it arrives as bytes with a
 * separator convention, a quoting convention, a line-ending convention and
 * a byte-order mark, none of which are stated in the file.
 *
 * **So the parser is the substance.** Everything that decides what a row
 * *means* lives in `importCsv.ts`; this decides only what the cells are.
 *
 * **Why not a library.** The app ships no dependency it can write in a
 * afternoon and test properly, and the whole first-load budget is 216.8KB.
 * The grammar below is RFC 4180 plus the three deviations every real
 * spreadsheet emits — a BOM, bare CR line endings, and a semicolon or tab
 * separator in locales where the comma is a decimal point.
 *
 * **Caps, for the same reason `programFile` caps sizes.** A 200MB CSV is a
 * frozen tab rather than an exploit, and just as effective at ruining the
 * app. Over a cap the parser *refuses* rather than truncating: half an
 * import that reports success is worse than no import.
 */

/** Separators worth sniffing. Comma first, so a tie goes to the standard. */
export const DELIMITERS = [',', ';', '\t'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

/** Beyond these the file is refused, with the number said out loud. */
export const MAX_ROWS = 20_000;
export const MAX_COLUMNS = 64;
export const MAX_CELL = 500;

export class CsvError extends Error {}

/**
 * The separator this file is using.
 *
 * Counted on the first line only, and outside quotes: a header row is the
 * one line guaranteed to be present and least likely to contain prose. A
 * file with no separator at all is a single-column CSV, which is legal, so
 * the tie-break is the comma rather than an error.
 */
export function sniffDelimiter(text: string): Delimiter {
  const line = firstLine(text);
  let best: Delimiter = ',';
  let most = 0;
  for (const d of DELIMITERS) {
    const n = countOutsideQuotes(line, d);
    if (n > most) {
      most = n;
      best = d;
    }
  }
  return best;
}

function firstLine(text: string): string {
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) return text.slice(0, i);
  }
  return text;
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let quoted = false;
  let n = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === delimiter) n++;
  }
  return n;
}

/**
 * Cells, as they are written, with nothing interpreted.
 *
 * Trailing blank lines are dropped — every spreadsheet writes one and none
 * of them means an empty row. A blank line *between* rows is kept, because
 * that is a row someone left empty and the importer should say so rather
 * than silently closing the gap.
 */
export function parseCsv(text: string, delimiter?: Delimiter): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const sep = delimiter ?? sniffDelimiter(body);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  const endCell = () => {
    if (cell.length > MAX_CELL) {
      throw new CsvError(`A cell in this file is longer than ${MAX_CELL} characters.`);
    }
    row.push(cell);
    cell = '';
    if (row.length > MAX_COLUMNS) {
      throw new CsvError(`This file has more than ${MAX_COLUMNS} columns.`);
    }
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS) {
      throw new CsvError(`This file has more than ${MAX_ROWS.toLocaleString()} rows.`);
    }
  };

  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c !== '"') {
        cell += c;
      } else if (body[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }
    if (c === '"' && cell === '') quoted = true;
    else if (c === sep) endCell();
    else if (c === '\n') endRow();
    else if (c === '\r') {
      endRow();
      if (body[i + 1] === '\n') i++;
    } else cell += c;
  }
  // An unterminated quote makes everything from it to the end of the file
  // unreadable: the run swallows separators and line endings alike, so what
  // comes back is one long cell that looks like data. Refusing is the same
  // rule as the caps — half a file that reports success is worse than none.
  if (quoted) {
    throw new CsvError('A quoted value in this file is never closed, so the rest of it cannot be read.');
  }
  // Whatever is still in hand is a final row without a line ending — unless
  // there is nothing in hand at all, which is the trailing newline every
  // spreadsheet writes.
  if (cell !== '' || row.length > 0) endRow();

  return rows;
}

/** One cell, quoted only where it has to be. */
export function csvCell(value: string, delimiter: Delimiter = ','): string {
  const needs = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter);
  return needs ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Rows out, with CRLF endings.
 *
 * CRLF because RFC 4180 says so and because Excel on Windows is the most
 * likely thing to open this. Every reader handles it; not every reader
 * handles bare LF.
 */
export function toCsv(rows: readonly (readonly string[])[], delimiter: Delimiter = ','): string {
  return rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\r\n');
}
