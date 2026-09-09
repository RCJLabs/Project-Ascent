import { useState } from 'react';
import { lookup } from '@/content/glossary';

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
 */
export function Term({ name, className = '' }: { name: string; className?: string }) {
  const entry = lookup(name);
  const [open, setOpen] = useState(false);

  if (entry === undefined) return <span className={className}>{name}</span>;

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`text-left underline decoration-dotted decoration-ink-soft underline-offset-4 ${className}`}
      >
        {name}
      </button>
      {/* `w-full` matters: dropped into a flex row of badges, the definition
          has to claim its own line rather than sit beside them. */}
      {open && (
        <span className="block w-full text-xs text-ink-soft leading-relaxed mt-1 border-l-2 border-line pl-2.5">
          {entry.definition}
        </span>
      )}
    </>
  );
}
