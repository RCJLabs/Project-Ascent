// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT } from '@/db/game';
import { VIEW } from '@/engine/ascent/config';
import { useGame } from '@/store/game';
import { playableCanvas } from '@/test/canvas';
import { renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';
import { GAME_MARGIN, MIN_GAME_WIDTH, fitGameWidth, gameHeight } from './fit';

/**
 * The wall has to fit on the screen (PLAN.md M226).
 *
 * It was `w-full` with an aspect ratio, so its height was whatever its width
 * implied: 398 wide on a phone is 708 tall, and the bottom of a running game
 * was below the fold. "You have to scroll down to see the entire game."
 */
describe('fitting the wall', () => {
  /** A phone: 398 of content column, about 518 left under the HUD. */
  const PHONE = { column: 398, room: 518 };

  it('lets the height decide when the height is what runs out', () => {
    const width = fitGameWidth(PHONE.column, PHONE.room);
    expect(width).toBeLessThan(PHONE.column);
    expect(gameHeight(width)).toBeLessThanOrEqual(PHONE.room);
  });

  it('fits in every room a phone or a laptop has', () => {
    for (const column of [320, 398, 448, 640]) {
      for (const room of [300, 420, 518, 640, 760, 900]) {
        const width = fitGameWidth(column, room);
        expect(width, `${column}x${room}`).toBeLessThanOrEqual(Math.max(column, MIN_GAME_WIDTH));
        // The whole point: the wall is no taller than the room it is in,
        // unless the floor below has bound it.
        if (width > MIN_GAME_WIDTH) {
          expect(gameHeight(width), `${column}x${room}`).toBeLessThanOrEqual(room + 0.5);
        }
      }
    }
  });

  it('lets the width decide when the room is tall and the column is narrow', () => {
    // A desktop sidebar layout: plenty of height, a column that is the
    // binding constraint. The old behaviour, and still right here.
    expect(fitGameWidth(320, 2000)).toBe(320);
  });

  it('never squeezes the wall below a width three lanes can be read in', () => {
    // A short landscape window. Below the floor the page scrolls again,
    // which is the lesser of the two faults.
    expect(fitGameWidth(900, 60)).toBe(MIN_GAME_WIDTH);
    expect(fitGameWidth(900, 0)).toBe(MIN_GAME_WIDTH);
  });

  it('leaves a margin rather than butting the wall against the nav', () => {
    expect(GAME_MARGIN).toBeGreaterThan(0);
  });

  it('keeps the aspect ratio it is given', () => {
    expect(gameHeight(VIEW.width)).toBeCloseTo(VIEW.height, 6);
  });
});

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  useGame.setState({ ledger: [], bounties: [], wallet: { spent: 0 }, ascent: EMPTY_ASCENT, hydrated: false });
});

describe('the page while a run is on', () => {
  it('gives the wall the room the heading was using, and hands it back', async () => {
    /**
     * Sixty pixels of a game that has to fit, and both of them are a tap
     * away on the menu. The `h1` stays — a page with no heading is a page
     * you cannot tell you have landed on.
     */
    const stop = playableCanvas();
    try {
      await useGame.getState().load();
      renderAt('/ascent', <AscentPage />);
      // Anchored to the header's own paragraph: the share button under a
      // finished run reads "Share Daily Wall #259" and matches the text too.
      const subtitle = () => screen.queryByText(/Daily Wall #/, { selector: 'header p' });
      expect(subtitle()).toBeTruthy();
      expect(screen.getByRole('link', { name: /Game/ })).toBeTruthy();

      fireEvent.click(await screen.findByRole('button', { name: /Climb/ }));
      await waitFor(() => expect(subtitle()).toBeNull());
      expect(screen.queryByRole('link', { name: /Game/ })).toBeNull();
      // And the heading is still there, which is the part that must not go.
      expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('The Ascent');

      // The wall ends the run — nobody is steering — and the page comes back.
      await waitFor(() => expect(subtitle()).toBeTruthy(), { timeout: 15_000 });
      expect(screen.getByRole('link', { name: /Game/ })).toBeTruthy();
    } finally {
      stop();
    }
  }, 30_000);
});
