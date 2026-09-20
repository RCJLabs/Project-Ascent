import { describe, expect, it } from 'vitest';
import { today } from '@/engine/dates';

/**
 * The pinned clock, proved rather than trusted (PLAN.md M299).
 *
 * `ASCENT_TODAY` is what lets the suite be run as a day other than the one
 * it is run on, and `npm run test:dates` runs it as ten of them. A pin that
 * quietly did nothing would turn all ten into the same run reporting green
 * ten times — the shape `privacy.test.ts` names about `dist`: **a suite
 * whose tests all skip reads exactly like a suite that ran.**
 *
 * So one of the two below always runs, and each says which world it is in
 * by something the other cannot fake.
 */
describe('a suite run as another day', () => {
  const pinned = process.env.ASCENT_TODAY;

  it.runIf(pinned !== undefined && pinned !== '')('is run as the day it was given', () => {
    expect(today()).toBe(pinned);
    expect(Date.now()).toBe(new Date(`${pinned}T12:00:00`).getTime());
    // And only the clock: a date built from its parts is still that date,
    // so nothing that reads one is reading the pin instead.
    expect(new Date(2020, 0, 2, 3, 4, 5).getFullYear()).toBe(2020);
    expect(new Date('2019-05-06T07:08:09Z').toISOString()).toBe('2019-05-06T07:08:09.000Z');
  });

  it.skipIf(pinned !== undefined && pinned !== '')('leaves the clock alone when nothing is pinned', () => {
    // The pin replaces the constructor, so its absence is visible in the
    // name — and that is a fact no fixture can arrange.
    expect(Date.name).toBe('Date');
  });
});
