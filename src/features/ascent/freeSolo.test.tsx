// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { EMPTY_ASCENT, putAscent } from '@/db/game';
import { FREE_SOLO_UNLOCK, describeFreeSoloUnlock } from '@/engine/ascent/unlock';
import { useGame } from '@/store/game';
import { renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/**
 * The gate the page actually applies (PLAN.md M218).
 *
 * The engine can be right about the bar and the sentence and the page can
 * still read a raw number or compare the wrong way round — which is the
 * wiring hole M212's battery found ten mutants' worth of. So the card is
 * rendered on both sides of the bar, and at the boundary.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  useGame.setState({ ledger: [], bounties: [], wallet: { spent: 0 }, ascent: EMPTY_ASCENT, hydrated: false });
});

async function openWithBest(best: number): Promise<void> {
  await putAscent({ ...EMPTY_ASCENT, best: { ...EMPTY_ASCENT.best, ascent: best } });
  await useGame.getState().load();
  renderAt('/ascent', <AscentPage />);
}

/** The card's own button, not its heading — both read "Free Solo". */
async function freeSoloButton(): Promise<HTMLButtonElement> {
  return (await screen.findByRole('button', { name: 'Free Solo' })) as HTMLButtonElement;
}

describe('the Free Solo card', () => {
  it('says what to climb, in climbing terms, while it is locked', async () => {
    await openWithBest(0);
    const button = await freeSoloButton();
    // The page says exactly what the engine says — no second copy of it.
    // Anchored to the paragraph: a `textContent` match alone also matches
    // every ancestor up to <body>, which is not an assertion about the card.
    expect(
      screen.getByText(
        (_, node) =>
          node?.tagName === 'P' &&
          (node.textContent ?? '').includes(describeFreeSoloUnlock('imperial')),
      ),
    ).toBeTruthy();
    expect(button.hasAttribute('disabled')).toBe(true);
  });

  it('opens at the bar, not one metre past it', async () => {
    // `>=`, and the boundary is the whole of what a climber who just made
    // it experiences. One off here is a run that counted for nothing.
    await openWithBest(FREE_SOLO_UNLOCK);
    expect((await freeSoloButton()).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByText(/Climb past/)).toBeNull();
  });

  it('stays shut one metre below it', async () => {
    await openWithBest(FREE_SOLO_UNLOCK - 1);
    expect((await freeSoloButton()).hasAttribute('disabled')).toBe(true);
  });
});
