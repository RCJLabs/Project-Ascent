import { useState } from 'react';
import { hasGlossaryTerm } from '@/content/glossaryTerms';

/**
 * An exercise or drill name that carries its own definition.
 *
 * The problem it solves: programs prescribe "Frenchies, 3 sets" and a
 * climber who has never heard the word has nowhere to go but a search
 * engine — which is not available offline, and is where an app teaches
 * someone that it does not have their back.
 *
 * Two rules:
 *
 * 1. **Exact matches only.** `lookup` does not guess (see
 *    content/glossary.ts). A name with no entry renders as ordinary text
 *    with no affordance, rather than a button that opens an apology.
 * 2. **Tap, not hover.** This is a phone app. A definition that only
 *    appears on hover does not exist.
 *
 * ## The definition arrives on the tap (PLAN.md M116)
 *
 * Deciding whether to underline a word needs the *keys*; only an open
 * definition needs the text. Importing `lookup` meant importing all 208
 * definitions — **13.99KB gzipped** — on every page that renders a single
 * term, which M115 measured arriving on the logger's navigation. The
 * question is answered from `glossaryTerms.ts` (1.7KB) and the answer is
 * fetched when someone asks for it.
 *
 * **The underline never lies.** `hasGlossaryTerm` and `lookup` share one
 * normalisation, so a name that renders as a button always has something
 * behind it — rule 1 above, held across a module boundary now rather than
 * inside one function. If the fetch itself fails, the button closes again
 * rather than opening onto nothing.
 */
export function Term({ name, className = '' }: { name: string; className?: string }) {
  const known = hasGlossaryTerm(name);
  const [definition, setDefinition] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  if (!known) return <span className={className}>{name}</span>;

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    // Opened first when it is already here, so a second tap on a term
    // someone has read before costs nothing and does not flicker.
    if (definition !== null) {
      setOpen(true);
      return;
    }
    try {
      const { lookup } = await import('@/content/glossary');
      const entry = lookup(name);
      if (entry === undefined) return;
      setDefinition(entry.definition);
      setOpen(true);
    } catch {
      // Offline with a cold cache is the only way here, and the honest
      // response is the word as it was rather than an error about a
      // dictionary.
    }
  }

  return (
    <>
      <button
        onClick={() => void toggle()}
        aria-expanded={open}
        /**
         * `py-0.5` is the tap target, not a margin (PLAN.md M321).
         *
         * A glossary word is twenty pixels tall at the app's body size, and
         * the floor `ui.test.ts` holds `Button.tsx` to is twenty-four. M280
         * exempted a target sitting in a block of text and that is the right
         * exemption for a guide, where these are words in sentences — but the
         * logger renders the same component as the **title of an exercise
         * row**, where it is a control in a list and the exemption does not
         * apply. Four pixels of vertical padding take it to the floor.
         *
         * Padding rather than height or leading because this is inline: the
         * box grows, the line does not move, and a paragraph with three terms
         * in it lays out exactly as before.
         */
        className={`focus-ring text-left underline decoration-dotted decoration-ink-soft underline-offset-4 py-0.5 ${className}`}
      >
        {name}
      </button>
      {/* `w-full` matters: dropped into a flex row of badges, the definition
          has to claim its own line rather than sit beside them. */}
      {open && definition !== null && (
        <span className="block w-full text-xs text-ink-soft leading-relaxed mt-1 border-l-2 border-line pl-2.5">
          {definition}
        </span>
      )}
    </>
  );
}
