import { Fragment, type ReactNode } from 'react';

/**
 * The tiny inline syntax guide content is written in: `**bold**`,
 * `_italic_`, and a newline for a line break.
 *
 * It exists so no content module has to carry HTML, and so nothing in the
 * app renders authored strings with `dangerouslySetInnerHTML` — the
 * prototype did, which is a script-injection surface for the sake of bold
 * text, and it also let content ship hardcoded colours that then ignored
 * the theme.
 */

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

/**
 * Split a string into styled runs.
 *
 * An unmatched marker renders literally rather than swallowing the rest of
 * the paragraph: a stray asterisk in a guide should look like a typo, not
 * turn half a page bold.
 */
export function parseInline(text: string): Run[] {
  const runs: Run[] = [];
  let rest = text;

  while (rest.length > 0) {
    const bold = rest.indexOf('**');
    const italic = findItalic(rest);
    const next = pickFirst(bold, italic);

    if (next === -1) {
      runs.push({ text: rest });
      break;
    }

    const isBold = next === bold;
    const marker = isBold ? '**' : '_';
    const close = isBold ? rest.indexOf('**', next + 2) : findItalic(rest, next + 1);

    if (close === -1) {
      // Unclosed. Everything from here is plain text, marker included.
      runs.push({ text: rest });
      break;
    }

    if (next > 0) runs.push({ text: rest.slice(0, next) });
    const inner = rest.slice(next + marker.length, close);
    if (inner.length > 0) runs.push({ text: inner, ...(isBold ? { bold: true } : { italic: true }) });
    rest = rest.slice(close + marker.length);
  }

  return runs.filter((run) => run.text.length > 0);
}

/**
 * An underscore that opens or closes emphasis, rather than one inside a
 * word — `pull_up` is a name, not italics.
 */
function findItalic(text: string, from = 0): number {
  for (let i = from; i < text.length; i += 1) {
    if (text[i] !== '_') continue;
    const before = text[i - 1];
    const after = text[i + 1];
    const wordBefore = before !== undefined && /\w/.test(before);
    const wordAfter = after !== undefined && /\w/.test(after);
    if (!(wordBefore && wordAfter)) return i;
  }
  return -1;
}

function pickFirst(a: number, b: number): number {
  if (a === -1) return b;
  if (b === -1) return a;
  return Math.min(a, b);
}

/** Authored inline text, rendered. Line breaks are honoured. */
export function Rich({ text }: { text: string }): ReactNode {
  return text.split('\n').map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}
      {parseInline(line).map((run, i) => {
        if (run.bold) return <strong key={i}>{run.text}</strong>;
        if (run.italic) return <em key={i}>{run.text}</em>;
        return <Fragment key={i}>{run.text}</Fragment>;
      })}
    </Fragment>
  ));
}
