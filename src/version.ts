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

/**
 * When this copy was built (PLAN.md M206).
 *
 * `APP_VERSION` answers *which release* and has been `0.1.0` since the
 * first commit — no bump, no tag, every deploy just main moving on. So the
 * field stamped into every backup, every exported program and the health
 * report has never distinguished one copy from another, and *"a new version
 * is ready"* was the whole of what an update could say.
 *
 * This is the half that changes on its own. It is not a changelog and does
 * not pretend to be one: it says how old the thing in front of you is,
 * which is the question a climber actually has when an update appears.
 *
 * Same shape as above, and the fallback means the same thing — the absence
 * of a build rather than a second source of truth.
 */
declare const __BUILT_AT__: string | undefined;

export const BUILT_AT: string | null =
  typeof __BUILT_AT__ === 'string' ? __BUILT_AT__ : null;
