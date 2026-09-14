/**
 * The released version, injected at build time from `package.json`
 * (PLAN.md M159).
 *
 * This file held `'0.1.0'` as a literal, which made it a second copy of a
 * number `package.json` already owned — and the copy that matters, since it
 * is what goes into every backup file, every exported program, and the line
 * at the foot of Settings. Two copies of a version is one copy plus a thing
 * to forget on release day.
 *
 * `vite.config.ts` reads `package.json` and defines `__APP_VERSION__`. The
 * fallback is for any runtime that evaluates this module without the define
 * in place; it is not a second source of truth, it is the absence of one,
 * and it says so where a climber would see it.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown';
