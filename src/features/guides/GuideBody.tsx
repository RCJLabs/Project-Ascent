import { Quote, ShieldAlert } from 'lucide-react';
import type { GuideBlock } from '@/content/guides';
import { Rich } from '@/ui/Rich';
import { Term } from '@/ui/Term';

/**
 * One guide block, rendered.
 *
 * Tables are the awkward case on a 320px phone and there are ninety-three
 * of them. They scroll inside their own container rather than being
 * reflowed into cards: a table in these guides is usually week-by-week
 * progression, where reading across the row is the whole point.
 */
export function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'h':
      return <h3 className="font-bold mt-4 first:mt-0 mb-1.5">{block.text}</h3>;

    case 'p':
      return (
        <p className="text-sm leading-relaxed text-ink-soft mb-2.5 last:mb-0">
          <Rich text={block.text} />
        </p>
      );

    case 'quote':
      return (
        <blockquote className="flex gap-2.5 my-3 pl-3 border-l-2 border-accent">
          <Quote size={15} className="text-accent shrink-0 mt-0.5" aria-hidden />
          <p className="text-sm italic leading-relaxed">
            <Rich text={block.text} />
          </p>
        </blockquote>
      );

    case 'note':
      return (
        <p className="text-sm leading-relaxed bg-sunken rounded-xl px-3 py-2.5 my-2.5">
          <Rich text={block.text} />
        </p>
      );

    case 'warn':
      return (
        <div className="border border-warn/40 bg-warn/5 rounded-xl p-3.5 my-3">
          <div className="flex items-center gap-2 mb-2">
            <ShieldAlert size={16} className="text-warn shrink-0" aria-hidden />
            <h4 className="font-bold text-sm">{block.title}</h4>
          </div>
          <ul className="grid grid-cols-1 gap-1.5">
            {block.items.map((item) => (
              <li key={item} className="text-sm leading-relaxed flex gap-2">
                <span className="text-warn shrink-0" aria-hidden>
                  •
                </span>
                <span className="min-w-0">
                  <Rich text={item} />
                </span>
              </li>
            ))}
          </ul>
          {block.footer !== undefined && (
            <p className="text-xs text-ink-soft mt-2.5 leading-relaxed">
              <Rich text={block.footer} />
            </p>
          )}
        </div>
      );

    case 'list':
      return (
        <ul className="grid grid-cols-1 gap-1.5 my-2.5">
          {block.items.map((item) => (
            <li key={item} className="text-sm leading-relaxed text-ink-soft flex gap-2">
              <span className="text-accent shrink-0" aria-hidden>
                •
              </span>
              <span className="min-w-0">
                <Rich text={item} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'exercises':
      return (
        <div className="bg-sunken rounded-xl p-3.5 my-2.5">
          <div className="flex items-baseline gap-2 mb-2">
            {block.group !== undefined && (
              <span className="text-2xs font-bold uppercase tracking-wide text-accent-ink bg-accent rounded px-1.5 py-0.5 shrink-0">
                {block.group}
              </span>
            )}
            <h4 className="font-bold text-sm min-w-0">{block.name}</h4>
          </div>
          <ul className="grid grid-cols-1 gap-1.5">
            {block.items.map((item) => (
              <li key={item} className="text-sm leading-relaxed">
                <ExerciseLine line={item} />
              </li>
            ))}
          </ul>
        </div>
      );

    case 'table': {
      const rowHeaders = block.head[0] === '';
      return (
        <div className="overflow-x-auto -mx-1 px-1 my-3">
          {/* Cells wrap, but never below a readable column width. A
              three-column table still fits a 320px phone; an eight-column
              weekly template overflows and scrolls rather than squashing to
              five characters a line. Sizing the table to its content
              instead would send even a two-column table off the screen. */}
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                {block.head.map((cell, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="text-left font-bold text-xs uppercase tracking-wide text-ink-soft border-b border-line pb-1.5 pr-3 last:pr-0 align-bottom min-w-[4.75rem]"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    // A blank corner header means the first column labels the
                    // rows — a weekly template — so it is a header, not data.
                    j === 0 && rowHeaders ? (
                      <th
                        key={j}
                        scope="row"
                        className="text-left font-bold border-b border-line py-2 pr-3 align-top leading-relaxed min-w-[4.75rem]"
                      >
                        <Rich text={cell} />
                      </th>
                    ) : (
                      <td
                        key={j}
                        className="border-b border-line py-2 pr-3 last:pr-0 align-top leading-relaxed text-ink-soft min-w-[4.75rem]"
                      >
                        <Rich text={cell} />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
  }
}

/**
 * An exercise line like `Box Jumps: 4×4. Land softly.`
 *
 * The name before the colon is offered to the glossary, so a movement a
 * climber has not met is one tap from a definition rather than a search
 * engine they do not have offline. Everything else renders as written.
 */
function ExerciseLine({ line }: { line: string }) {
  const colon = line.indexOf(':');
  const name = colon === -1 ? '' : line.slice(0, colon).trim();
  if (name === '' || name.length > 40) return <Rich text={line} />;
  return (
    <>
      <Term name={name} className="font-semibold" />
      <span className="text-ink-soft">
        <Rich text={line.slice(colon)} />
      </span>
    </>
  );
}
