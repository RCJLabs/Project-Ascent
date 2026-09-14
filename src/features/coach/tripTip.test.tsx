// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { getDb, resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import type { Objective } from '@/engine/objectives';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { CoachPage } from './CoachPage';

/**
 * The wiring, from the screen rather than from the engine (PLAN.md M163).
 *
 * `objectives` is a new field on `CoachInput` and `useTips` is what fills it.
 * The rule can be perfectly right about both sentences while the hook never
 * hands it a trip — which is the shape M161 and M167 both shipped a battery
 * survivor for, and M152 named first: an import satisfies a name check while
 * rendering nothing.
 */

/**
 * Anchored to the real day, because `buildTips` falls back to `today()` and
 * nothing here passes it one. Day 0 of the trip is four days ago, so "today"
 * is the fourth day on — the day the ratio is at its worst.
 */
const DAY_ONE = addDays(today(), -4);

const at = (date: string, rpe: number, min: number, i = 0): Session => ({
  ...newSession(date, i),
  completed: true,
  rpe,
  durationMin: min,
});

/**
 * Tapered, then four long days — the shape that puts the ratio past three.
 *
 * Three months of steady training laid on the same three weekdays, so the
 * baseline is real rather than asserted, then a taper week, then the trip.
 */
function spikyLog(): Session[] {
  const out: Session[] = [];
  let i = 0;
  for (let d = 90; d >= 8; d -= 1) {
    const date = addDays(DAY_ONE, -d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (dow === 1 || dow === 3 || dow === 5) out.push(at(date, 7, 60, i++));
  }
  out.push(at(addDays(DAY_ONE, -7), 5, 45, i++), at(addDays(DAY_ONE, -4), 5, 40, i++));
  for (const d of [0, 1, 3, 4]) out.push(at(addDays(DAY_ONE, d), 8, 300, i++));
  return out;
}

const trip: Objective = {
  id: 'obj-trip',
  name: 'Magic Wood',
  kind: 'trip',
  status: 'training',
  targetDate: DAY_ONE,
  requirements: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function coachWith(objectives: Objective[]): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (const session of spikyLog()) await putSession(session);
  const db = await getDb();
  await db.put('profile', { key: 'objectives', value: objectives });
  await hydrate();
  useProfile.setState({ injuries: [], dismissedTips: {} });
  renderAt('/coach', <CoachPage />);
  await screen.findByText(/Load spike/i);
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the coach board, on a trip and at home', () => {
  it('reads the trip off the objectives store and says so', async () => {
    await coachWith([trip]);
    const text = document.body.textContent ?? '';
    expect(text, 'the tip never reached the board').toMatch(/Load spike/);
    expect(text, 'the hook never handed the rule the objective').toMatch(/Magic Wood/);
    expect(text).toMatch(/rest day between the hard ones/);
  });

  it('drops the advice and the action a climber away cannot use', async () => {
    await coachWith([trip]);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/An easier week now costs a week/);
    expect(screen.queryByText('Plan the week')).toBeNull();
  });

  it('says the ordinary thing to the same log with no trip in it', async () => {
    await coachWith([]);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/Load spike/);
    expect(text).toMatch(/An easier week now costs a week/);
    expect(text).not.toMatch(/Magic Wood/);
    expect(screen.getByText('Plan the week')).toBeTruthy();
  });

  /**
   * The same log and a trip objective that is nowhere near now. This is the
   * one that fails if `tripNow` is wired in but its window is not read.
   */
  it('says the ordinary thing when the trip is months out', async () => {
    await coachWith([{ ...trip, targetDate: addDays(today(), 90) }]);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/An easier week now costs a week/);
    expect(text).not.toMatch(/Magic Wood/);
  });
});
