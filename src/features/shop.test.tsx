// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { earnedOutfits, shopOutfits } from '@/engine/avatar';
import { useGame } from '@/store/game';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { ClimberPage } from '@/features/climber/ClimberPage';

/**
 * The currency finally has somewhere to go (PLAN.md M62).
 *
 * `spend()` existed on the game store and nothing in the app called it: the
 * climber page had printed "N earned · 0 spent" since the day it was written.
 */

const cheapest = shopOutfits()[0]!;

/**
 * Coins are a quarter of an XP point, and XP is folded from the ledger,
 * where an entry is a fraction of a level. A 'real' entry is uncapped, which
 * is the only way to seed a large balance without inventing a training log.
 */
async function withCoins(levels: number): Promise<void> {
  await reset();
  await hydrate();
  useGame.setState({
    wallet: { spent: 0, owned: [] },
    ledger:
      levels > 0
        ? [{ id: 'seed', date: '2026-01-01', label: 'seed', units: levels, origin: 'test', source: 'real' }]
        : [],
  });
}



function card(name: string): HTMLElement {
  return screen.getByText(name).closest('button')!;
}

beforeEach(() => {
  useGame.setState({ wallet: { spent: 0, owned: [] } });
});

describe('a kit you buy', () => {
  it('shows its price while it is not yours', async () => {
    await withCoins(0);
    renderAt('/climber', <ClimberPage />);
    expect(card(cheapest.name).getAttribute('aria-label')).toContain(
      cheapest.price!.toLocaleString(),
    );
  });

  it('cannot be worn, or bought, without the coins', async () => {
    await withCoins(0);
    renderAt('/climber', <ClimberPage />);
    const before = useProfile.getState().avatarPalette.top;
    expect(card(cheapest.name).hasAttribute('disabled')).toBe(true);
    fireEvent.click(card(cheapest.name));
    expect(useProfile.getState().avatarPalette.top).toBe(before);
    expect(useGame.getState().wallet.spent).toBe(0);
  });

  it('is bought, worn and paid for in one tap', async () => {
    await withCoins(400);
    renderAt('/climber', <ClimberPage />);
    fireEvent.click(card(cheapest.name));
    await waitFor(() => expect(useGame.getState().wallet.owned).toContain(cheapest.name));

    expect(useGame.getState().wallet.spent).toBe(cheapest.price);
    expect(useProfile.getState().avatarPalette.top).toBe(cheapest.top);
  });

  it('is never charged for twice', async () => {
    await withCoins(400);
    const bought = await useGame.getState().buy(cheapest, cheapest.price! * 3);
    const again = await useGame.getState().buy(cheapest, cheapest.price! * 3);
    expect(bought).toBe(true);
    expect(again).toBe(false);
    expect(useGame.getState().wallet.spent).toBe(cheapest.price);
  });

  it('refuses when the balance is one coin short', async () => {
    await withCoins(0);
    expect(await useGame.getState().buy(cheapest, cheapest.price! - 1)).toBe(false);
    expect(useGame.getState().wallet.spent).toBe(0);
    expect(useGame.getState().wallet.owned).toEqual([]);
  });
});

describe('a kit you earn', () => {
  const earned = earnedOutfits()[0]!;

  it('cannot be bought at any balance', async () => {
    await withCoins(400);
    expect(await useGame.getState().buy(earned, 1_000_000)).toBe(false);
    expect(useGame.getState().wallet.spent).toBe(0);
  });

  it('says which node earns it rather than a price', async () => {
    await withCoins(400);
    renderAt('/climber', <ClimberPage />);
    const label = card(earned.name).getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Earned by/);
    expect(label).not.toMatch(/coins/);
  });

  it('is locked until the tree grants it', async () => {
    await withCoins(400);
    renderAt('/climber', <ClimberPage />);
    expect(card(earned.name).hasAttribute('disabled')).toBe(true);
  });
});

describe('a kit that was always free', () => {
  it('stays free, and wearable', async () => {
    await withCoins(0);
    renderAt('/climber', <ClimberPage />);
    fireEvent.click(card('Chalk'));
    expect(useProfile.getState().avatarPalette.top).toBe('#f0efe9');
    expect(useGame.getState().wallet.spent).toBe(0);
  });
});
