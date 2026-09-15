// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { SkeletonCard } from '@/ui/Skeleton';
import { HomePage } from './HomePage';

/**
 * Home's coach card, across a boundary (PLAN.md M183).
 *
 * `ui/wired.test.ts` proves the coach engine is off the first-paint path by
 * walking the import graph, which is the guard that lasts. It cannot prove
 * the card still arrives, or that the slot is held open while it does —
 * that is this file, and it is the half a source check would miss.
 *
 * jsdom has no layout, so the numbers that decided the fallback's shape
 * (CLS 0.1243 with `null`, 0.0042–0.0267 with a card) came from a browser
 * and are recorded in `HomePage.tsx`. What is checkable here is the structure that
 * number came from: something card-shaped stands in the slot first, and the
 * real card replaces it.
 */

const DAY = today();

async function aMonthOfTraining(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let d = 29; d >= 0; d -= 2) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: null,
    startDates: {},
    injuries: [],
    dismissedTips: {},
    dismissedCards: ['safety', 'setup', 'programs'],
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the deferred coach card', () => {
  /**
   * The point of the milestone: the engine is a chunk away and the card
   * still lands. If the boundary were wrong — a bad specifier, the named
   * export not re-mapped to `default` — this is what would fail, and
   * nothing in the import-graph sweep would notice.
   */
  it('still reaches the front door', async () => {
    await aMonthOfTraining();
    renderAt('/', <HomePage />);
    expect(await screen.findByText("Coach's Corner")).toBeTruthy();
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/coach');
    expect(link, 'the card arrived without its way to the board').toBeTruthy();
  });

  /**
   * The placeholder that holds the slot, checked for the property the CLS
   * number depends on: that it is card-shaped and carries lines.
   *
   * Not asserted through `Suspense` — under the test runner the chunk is
   * already in the module graph and React resolves it inside the same `act`,
   * so the fallback is never on screen to query. That the fallback *is* this
   * component is a source fact, and `ui/wired.test.ts` asserts it there; that
   * it holds the right height is a browser fact, and the number is in
   * `HomePage.tsx`. What is left for here is its shape.
   */
  it('stands in with something card-shaped, not nothing', () => {
    renderAt('/', <SkeletonCard lines={3} />);
    const card = document.querySelector('.bg-surface');
    expect(card, 'the placeholder is not a card, so it holds no height').toBeTruthy();
    expect(card!.className, 'and not the same card as the real one').toMatch(/rounded-2xl/);
    // A label and the three lines that land there: a headline and two of body.
    expect(card!.querySelectorAll('[aria-hidden]')).toHaveLength(4);
  });

  /**
   * The slot is reserved for a card that is almost never absent — measured
   * across a fresh install, two weeks and a year, the board had something to
   * say every time. This is the fresh install, which is the one a reader
   * would expect to be silent.
   */
  it('has something to say to a climber on day one', async () => {
    globalThis.indexedDB = new IDBFactory();
    resetDbForTests();
    await reset();
    await loadPrograms();
    await hydrate();
    useProfile.setState({
      activeProgramId: null,
      startDates: {},
      injuries: [],
      dismissedTips: {},
      dismissedCards: ['safety', 'setup', 'programs'],
    });
    renderAt('/', <HomePage />);
    expect(await screen.findByText("Coach's Corner")).toBeTruthy();
  });
});
