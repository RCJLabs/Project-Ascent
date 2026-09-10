/**
 * Guide prose, flattened so it can be searched (PLAN.md M65).
 *
 * The search page indexed a guide by its name, its subtitle and its section
 * *titles*. The bodies — the app's largest single body of knowledge, and the
 * only place several things are explained at all — were unreachable except
 * by opening a guide and reading it. "Where does it say what a deload is
 * for?" had an answer the app was holding and could not hand over.
 *
 * Flattened here rather than in the search page because the inline syntax
 * (`**bold**`, `_italic_`) is content's business, and a searcher typing
 * "deload" should not miss a line that happens to have written it in bold.
 */

import type { GuideBlock, GuideSection } from '@/content/guides/types';

/** Strip the inline markers, leaving the words. */
export function plain(text: string): string {
  return text.replace(/\*\*/g, '').replace(/_/g, '');
}

function blockText(block: GuideBlock): string[] {
  switch (block.kind) {
    case 'p':
    case 'h':
    case 'quote':
    case 'note':
      return [block.text];
    case 'warn':
      return [block.title, ...block.items, ...(block.footer ? [block.footer] : [])];
    case 'list':
      return block.items;
    case 'table':
      return [...block.head, ...block.rows.flat()];
    case 'exercises':
      return [...(block.group ? [block.group] : []), block.name, ...block.items];
  }
}

/** Everything a section says, as one searchable string. */
export function sectionText(section: GuideSection): string {
  return plain([section.title, ...section.content.flatMap(blockText)].join(' '));
}

/**
 * The words around a match, so a result can show why it matched.
 *
 * Cut on a word boundary and elided at both ends, because a snippet that
 * starts mid-word reads as a bug. Returns the opening of the passage when
 * the query is not in it, which is what an empty query does.
 */
export function snippet(text: string, query: string, width = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const at = query.trim() === '' ? -1 : clean.toLowerCase().indexOf(query.trim().toLowerCase());
  if (at < 0) return clean.length > width ? `${cutAt(clean, width)}…` : clean;

  const half = Math.max(0, Math.floor((width - query.length) / 2));
  let start = Math.max(0, at - half);
  if (start > 0) {
    const space = clean.indexOf(' ', start);
    start = space >= 0 && space < at ? space + 1 : start;
  }
  const end = Math.min(clean.length, start + width);
  const body = cutAt(clean.slice(start, end), width);
  return `${start > 0 ? '…' : ''}${body}${end < clean.length ? '…' : ''}`;
}

/** Trim to the last whole word inside `width`. */
function cutAt(text: string, width: number): string {
  if (text.length <= width) return text;
  const cut = text.slice(0, width);
  const space = cut.lastIndexOf(' ');
  return (space > width * 0.6 ? cut.slice(0, space) : cut).trimEnd();
}
