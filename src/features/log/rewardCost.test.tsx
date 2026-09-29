// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { act, screen } from '@testing-library/react';

/**
 * What the reward card derives, and when (PLAN.md M354).
 *
 * Profiled in the browser: correcting a finished session cost about 180ms
 * of main-thread work per change at a quarter CPU speed, and 130ms of it
 * was the reward card. For an acknowledged session the card is one line,
 * *"Earned +N XP"*, but its hooks ran first anyway: the achievements twice
 * over the whole log, and the skill trees under an avatar it only draws on
 * a record. The engines are wrapped here, as `oneDerivation.test.tsx`
 * wraps `deriveClimberState`, so the count is of real calls.
 */

const achievementCalls: unknown[] = [];
const skillCalls: unknown[] = [];
vi.mock('@/engine/achievements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/achievements')>();
  return {
    ...actual,
    deriveAchievements: (...args: Parameters<typeof actual.deriveAchievements>) => {
      achievementCalls.push(args);
      return actual.deriveAchievements(...args);
    },
  };
});
vi.mock('@/engine/skills', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/skills')>();
  return {
    ...actual,
    evaluateSkills: (...args: Parameters<typeof actual.evaluateSkills>) => {
      skillCalls.push(args);
      return actual.evaluateSkills(...args);
    },
  };
});

const { resetDbForTests } = await import('@/db/db');
const { loadPrograms } = await import('@/content/programs');
const { newSession, putSession } = await import('@/db/sessions');
const { addDays, today } = await import('@/engine/dates');
const { hydrate, renderAt, reset } = await import('@/test/render');
const { useSessions } = await import('@/store/sessions');
const { writesSettled } = await import('@/store/writes');
const { DayBody } = await import('./LogPage');

const TODAY = today();

/** Three harder days before today, then today's session as given. */
async function logged(today: { rewarded: boolean; grade: string }): Promise<void> {
  for (const [i, date] of [-14, -10, -6].map((d) => addDays(TODAY, d)).entries()) {
    await putSession({
      ...newSession(date, 0),
      completed: true,
      rewarded: true,
      rpe: 7,
      durationMin: 90,
      warmup: true,
      climbs: [{ id: `p${i}`, grade: 'V5', scale: 'V', count: 2, result: 'send' }],
    });
  }
  await putSession({
    ...newSession(TODAY, 0),
    completed: true,
    rewarded: today.rewarded,
    rpe: 6,
    durationMin: 60,
    warmup: true,
    climbs: [{ id: 'c1', grade: today.grade, scale: 'V', count: 3, result: 'send' }],
  });
  await hydrate();
}

/** An edit to today's session, as the logger makes one. */
async function edit(): Promise<void> {
  const session = useSessions.getState().byDate[TODAY]![0]!;
  await act(async () => {
    await useSessions.getState().update({ ...session, rpe: session.rpe === 6 ? 7 : 6 });
    await writesSettled();
  });
}

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  achievementCalls.length = 0;
  skillCalls.length = 0;
});

describe('an acknowledged session', () => {
  it('shows what it earned, and derives no achievements or skills to do it', async () => {
    await logged({ rewarded: true, grade: 'V3' });
    renderAt('/', <DayBody date={TODAY} />);
    expect(await screen.findByText(/^Earned/)).toBeTruthy();
    await edit();
    await edit();
    expect(screen.getByText(/^Earned/)).toBeTruthy();
    expect(achievementCalls).toHaveLength(0);
    expect(skillCalls).toHaveLength(0);
  });
});

describe('a session the climber has not acknowledged yet', () => {
  it('still works out what the session earned, again after an edit', async () => {
    await logged({ rewarded: false, grade: 'V3' });
    renderAt('/', <DayBody date={TODAY} />);
    await screen.findByText('Session logged.');
    const first = achievementCalls.length;
    expect(first).toBeGreaterThan(0);
    await edit();
    // The card is on screen and its answer can change with the session.
    expect(achievementCalls.length).toBeGreaterThan(first);
  });

  it('draws no avatar, and so evaluates no skills, when there is no record to share', async () => {
    await logged({ rewarded: false, grade: 'V3' });
    renderAt('/', <DayBody date={TODAY} />);
    await screen.findByText('Session logged.');
    expect(screen.queryByRole('button', { name: 'Share this' })).toBeNull();
    expect(skillCalls).toHaveLength(0);
  });

  it('draws the avatar for a record, which is what it was for', async () => {
    await logged({ rewarded: false, grade: 'V8' });
    renderAt('/', <DayBody date={TODAY} />);
    expect(await screen.findByRole('button', { name: 'Share this' })).toBeTruthy();
    expect(skillCalls.length).toBeGreaterThan(0);
  });
});
