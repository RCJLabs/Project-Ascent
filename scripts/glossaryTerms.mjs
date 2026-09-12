/**
 * Regenerate `src/content/glossaryTerms.ts` from the glossary (PLAN.md M116).
 *
 * The terms are a derived artefact, committed so nothing has to run at build
 * time and so a reader can see what is in it. `glossary.test.ts` fails if it
 * is stale, and the failure says to run this.
 *
 * Run:  npm run glossary
 */
import { readFileSync, writeFileSync } from 'node:fs';

const SOURCE = 'src/content/glossary.ts';
const TARGET = 'src/content/glossaryTerms.ts';

/** The same normalisation `termKey` applies. Kept here as a literal rather
 *  than imported, because importing it would mean running TypeScript. */
const normalise = (term) => term.trim().toLowerCase();

export function termsFrom(source) {
  const terms = [...source.matchAll(/\{ term: '((?:[^'\\]|\\.)*)'/g)].map((m) =>
    m[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
  );
  if (terms.length === 0) throw new Error(`no terms found in ${SOURCE}`);
  return [...new Set(terms.map(normalise))].sort();
}

export function render(keys) {
  const lines = keys.map((k) => `  '${k.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}',`).join('\n');
  return `/**
 * Which names the glossary defines — the keys, without the definitions
 * (PLAN.md M116).
 *
 * **Generated. Run \`node scripts/glossaryTerms.mjs\` after editing
 * \`content/glossary.ts\`;** \`glossary.test.ts\` fails if this is stale.
 *
 * ## Why it exists
 *
 * \`<Term>\` renders an exercise name as a tappable definition when the
 * glossary has one and as ordinary text when it does not, so it has to
 * answer *"is this a term?"* before anything is tapped. It answered that by
 * importing the whole glossary — **13.99KB gzipped of definitions to decide
 * whether to underline a word**, on three lazy pages including the logger,
 * measured on M115's twenty-chunk fan-out.
 *
 * The keys are 1.7KB of that. They live here; the definitions load on the
 * tap that asks for one.
 *
 * Normalisation lives here too, rather than beside the entries, so the
 * question and the answer cannot disagree about what counts as the same
 * word.
 */

/** Normalised lookup key: exact term, case and surrounding space aside. */
export function termKey(term: string): string {
  return term.trim().toLowerCase();
}

const KEYS: ReadonlySet<string> = new Set([
${lines}
]);

/** Whether the glossary defines this exact name. */
export function hasGlossaryTerm(term: string): boolean {
  return KEYS.has(termKey(term));
}

/** Every key, for the tests that hold this file to the glossary. */
export function glossaryKeys(): string[] {
  return [...KEYS];
}
`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = termsFrom(readFileSync(SOURCE, 'utf8'));
  writeFileSync(TARGET, render(keys));
  console.log(`${TARGET}: ${keys.length} terms`);
}
