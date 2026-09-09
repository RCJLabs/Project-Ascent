import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowLeft, Search, X } from 'lucide-react';
import {
  CATEGORY_BLURB,
  CATEGORY_ORDER,
  GLOSSARY,
  groupByCategory,
  searchGlossary,
  type GlossaryCategory,
} from '@/content/glossary';
import { PageHeader } from '@/ui/PageHeader';

/**
 * The glossary, searchable.
 *
 * Grouped by category rather than one flat alphabetical wall, because the
 * useful question is usually "what are the grip types called" rather than
 * "what does this exact word mean" — and the search covers the second case.
 */
export function GlossaryPage() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<GlossaryCategory | null>(null);

  const groups = useMemo(
    () => groupByCategory(searchGlossary(query, category)),
    [query, category],
  );
  const found = groups.reduce((n, group) => n + group.entries.length, 0);

  return (
    <>
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-ink-soft py-1.5 mb-1.5">
        <ArrowLeft size={15} /> Settings
      </Link>
      <PageHeader
        title="Glossary"
        subtitle={`${GLOSSARY.length} terms — the lingo, the techniques, and the exercises the programs ask for by name.`}
      />

      <div className="grid grid-cols-1 gap-3">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search terms and definitions"
            aria-label="Search the glossary"
            className="w-full bg-sunken border border-line rounded-xl pl-9 pr-10 py-2.5 text-sm"
          />
          {query !== '' && (
            <button
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 -translate-y-1/2 text-ink-soft p-2.5"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <Chip active={category === null} onClick={() => setCategory(null)} label="All" />
          {CATEGORY_ORDER.map((option) => (
            <Chip
              key={option}
              active={category === option}
              onClick={() => setCategory(category === option ? null : option)}
              label={option}
            />
          ))}
        </div>

        {found === 0 ? (
          <p className="text-sm text-ink-soft py-6 text-center">
            Nothing matches “{query}”.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.category}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
                {group.category}
              </h2>
              <p className="text-sm text-ink-soft mb-2">{CATEGORY_BLURB[group.category]}</p>
              <ul className="grid grid-cols-1 gap-2">
                {group.entries.map((entry) => (
                  <li key={entry.term} className="bg-surface border border-line rounded-2xl p-4">
                    <h3 className="font-bold mb-1">{entry.term}</h3>
                    <p className="text-sm text-ink-soft leading-relaxed">{entry.definition}</p>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </>
  );
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-1.5 border text-sm ${
        active ? 'border-accent bg-accent/10 font-semibold' : 'border-line bg-sunken text-ink-soft'
      }`}
    >
      {label}
    </button>
  );
}
