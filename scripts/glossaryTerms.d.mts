/**
 * Types for the generator, which is plain ESM because it is a script rather
 * than part of the app (PLAN.md M116).
 *
 * It exists so `glossary.test.ts`'s staleness check can call the same code
 * the script runs instead of reimplementing the extraction and disagreeing
 * with it — a second copy of the regex would pass while the real one broke.
 */
export function termsFrom(source: string): string[];
export function render(keys: string[]): string;
