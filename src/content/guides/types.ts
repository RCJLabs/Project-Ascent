/**
 * Guide content (PLAN.md §7.3, M9).
 *
 * The long-form writing behind each program, plus the standalone outdoor
 * and injury guides. Eleven documents, a hundred sections, ported from the
 * prototype's `data/guide*.ts`.
 *
 * ## No HTML in content
 *
 * The prototype's guides carried raw HTML in their strings — `<b>`, `<br/>`,
 * and a few hardcoded Tailwind colour spans — and rendered them with
 * `dangerouslySetInnerHTML`. That is a script-injection surface for the sake
 * of bold text, and it also meant content shipped its own colours, which
 * then ignored the theme.
 *
 * So the port converts markup to a tiny inline syntax the renderer parses
 * itself: `**bold**`, `_italic_`, and a real newline for a line break. No
 * string in this folder contained a literal `*` or `_`, so the markers are
 * unambiguous. `parseInline` in ui/Rich.tsx is the only thing that reads
 * them, and unmatched markers render literally rather than eating the rest
 * of a paragraph.
 *
 * ## Guides are not program data
 *
 * A guide explains a program; it does not define one. Nothing derives a
 * plan, a session or a prescription from this folder — the programs remain
 * the single source for what to do, and a guide that drifts from its
 * program is a content bug, not a behaviour change. Grade ranges are
 * deliberately absent here for the same reason: the program owns that
 * string, and duplicating it would give it two places to be wrong.
 */

/** One renderable piece of a guide section. */
export type GuideBlock =
  | { kind: 'p'; text: string }
  | { kind: 'h'; text: string }
  /** A pull quote — the line a section is built around. */
  | { kind: 'quote'; text: string }
  /** An aside worth setting apart, but not a safety warning. */
  | { kind: 'note'; text: string }
  /** Safety. Rendered so it cannot be skimmed past. */
  | { kind: 'warn'; title: string; items: string[]; footer?: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] }
  /** A named block of exercises, as the guide prescribes them in prose. */
  | { kind: 'exercises'; group?: string; name: string; items: string[] };

export interface GuideSection {
  title: string;
  content: GuideBlock[];
}

export interface Guide {
  /**
   * Matches the program's id where the guide documents a program, which is
   * how `guideFor` links them without either side storing the other.
   */
  id: string;
  name: string;
  subtitle?: string;
  sections: GuideSection[];
}
