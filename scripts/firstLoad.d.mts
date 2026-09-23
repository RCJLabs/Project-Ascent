/**
 * Types for the first-load measure, which is plain ESM so `npm run bundle`
 * can run it without a build step (PLAN.md M328).
 */
export const BUDGET: number;
export function entryName(dir?: string): string;
export function firstLoad(dir?: string): { entry: string; js: number; css: number; kb: number };
