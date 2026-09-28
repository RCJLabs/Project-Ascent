/**
 * Types for `npm run homeload`, which is plain ESM so it runs without a
 * build step (PLAN.md M346). They exist so its tests call the code the
 * script runs.
 */
export const HOME_BUDGET: number;
export const HOME_SLACK: number;
export function total(names: readonly string[], dir?: string): { kb: number; files: { name: string; gzip: number }[] };
export function judge(kb: number, budget?: number, slack?: number): string[];
export function differ(a: readonly string[], b: readonly string[]): { onlyA: string[]; onlyB: string[] };
