// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { ACHIEVEMENT_COUNT } from '@/engine/achievements';
import { addDays, today } from '@/engine/dates';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { AchievementsPage } from './AchievementsPage';
import { ClimberPage } from './ClimberPage';

/**
 * The achievements, on a page of their own.
 *
 * They were a card on the climber page, which was right at fourteen and is
 * not at twenty-five: a list that long turns the page about who you are
 * into a page you scroll past.
 */

const TODAY = today();

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

/** A log that earns one: two training sessions on a single date. */
async function twiceInADay(): Promise<void> {
  for (const i of [0, 1]) {
    await putSession({
      ...newSession(TODAY, i, { completed: true }),
      rpe: 7,
      durationMin: 90,
      climbs: [{ id: `c${i}`, grade: 'V4', scale: 'V', count: 1, result: 'send' }],
    } as never);
  }
  await putSession({
    ...newSession(addDays(TODAY, -3), 0, { completed: true }),
    rpe: 7,
    durationMin: 90,
    climbs: [],
  } as never);
  await hydrate();
}

describe('the achievements page', () => {
  it('lists every one of them', async () => {
    await twiceInADay();
    const view = renderAt('/achievements', <AchievementsPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(view.container.querySelectorAll('li')).toHaveLength(ACHIEVEMENT_COUNT);
    expect(screen.getByText('Twice in a Day')).toBeTruthy();
  });

  // The header carries the name and the count; a card repeating them says
  // "Achievements — 7 of 25" twice on one screen.
  it('does not say its own name twice', async () => {
    await twiceInADay();
    renderAt('/achievements', <AchievementsPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByText('Achievements')).toHaveLength(1);
  });

  it('counts the earned ones in its own subtitle', async () => {
    await twiceInADay();
    renderAt('/achievements', <AchievementsPage />);
    expect(await screen.findByText(new RegExp(`1 of ${ACHIEVEMENT_COUNT}, worked out from the log`))).toBeTruthy();
  });

  /**
   * Or the count reads "0 of 25" for a frame and then changes under the
   * reader, which looks like losing them (PLAN.md M22).
   */
  it('waits for its stores rather than counting nothing', () => {
    // `reset()` hydrates, so the un-hydrated state has to be asked for.
    useSessions.setState({ hydrated: false });
    useProjects.setState({ hydrated: false });
    renderAt('/achievements', <AchievementsPage />);
    expect(screen.queryByText(new RegExp(`0 of ${ACHIEVEMENT_COUNT}, worked out`))).toBeNull();
  });

  it('says what an unearned one takes, so it can be aimed at', async () => {
    await twiceInADay();
    renderAt('/achievements', <AchievementsPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText('A grade you had only ever failed on, sent in a later session.')).toBeTruthy();
  });
});

describe('the climber page', () => {
  it('carries the count rather than the list', async () => {
    await twiceInADay();
    renderAt('/climber', <ClimberPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(`1 of ${ACHIEVEMENT_COUNT}`)).toBeTruthy();
    // The detail sentences belong to the page now, not to the card.
    expect(screen.queryByText('A grade you had only ever failed on, sent in a later session.')).toBeNull();
  });

  it('names the newest one earned', async () => {
    await twiceInADay();
    renderAt('/climber', <ClimberPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(/Latest: Twice in a Day/)).toBeTruthy();
  });

  it('says something useful before any are earned', async () => {
    await hydrate();
    renderAt('/climber', <ClimberPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.getByText(`0 of ${ACHIEVEMENT_COUNT}`)).toBeTruthy();
    expect(screen.getByText(/Days with a shape to them/)).toBeTruthy();
  });
});
