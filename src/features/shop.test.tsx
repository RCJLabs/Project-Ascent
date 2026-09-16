// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { earnedOutfits, shopOutfits } from '@/engine/kits';
import { useGame } from '@/store/game';
import { WALLS } from '@/engine/ascent/walls';
import { ALL_BOUGHT } from '@/engine/shop';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { GamePage } from '@/features/game/GamePage';

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
    renderAt('/game', <GamePage />);
    expect(card(cheapest.name).getAttribute('aria-label')).toContain(
      cheapest.price!.toLocaleString(),
    );
  });

  it('cannot be worn, or bought, without the coins', async () => {
    await withCoins(0);
    renderAt('/game', <GamePage />);
    const before = useProfile.getState().avatarPalette.top;
    expect(card(cheapest.name).hasAttribute('disabled')).toBe(true);
    fireEvent.click(card(cheapest.name));
    expect(useProfile.getState().avatarPalette.top).toBe(before);
    expect(useGame.getState().wallet.spent).toBe(0);
  });

  it('is bought, worn and paid for in one tap', async () => {
    await withCoins(400);
    renderAt('/game', <GamePage />);
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
    renderAt('/game', <GamePage />);
    const label = card(earned.name).getAttribute('aria-label') ?? '';
    expect(label).toMatch(/Earned by/);
    expect(label).not.toMatch(/coins/);
  });

  it('is locked until the tree grants it', async () => {
    await withCoins(400);
    renderAt('/game', <GamePage />);
    expect(card(earned.name).hasAttribute('disabled')).toBe(true);
  });
});

/**
 * The card that spends the coins says what they are for (PLAN.md M213).
 *
 * `CurrencyCard` showed a balance, a lifetime earned and a spent, and never
 * connected any of them to a kit. These are page tests rather than engine
 * tests because the engine was never the gap: `describeShop` can be right
 * and the card can still not call it, which is exactly the wiring hole M212
 * found ten mutants' worth of.
 */
describe('the currency card', () => {
  const ladder = shopOutfits().sort((a, b) => (a.price ?? 0) - (b.price ?? 0));

  it('names the next kit and the gap to it, with nothing bought', async () => {
    await withCoins(0);
    renderAt('/game', <GamePage />);
    expect(
      screen.getByText(
        `0 of ${ladder.length} bought. ${ladder[0]!.name} next, ${(ladder[0]!.price ?? 0).toLocaleString()} to go.`,
      ),
    ).toBeTruthy();
  });

  it('counts what is owned, so a balance means something before the end', async () => {
    await withCoins(0);
    useGame.setState({ wallet: { spent: ladder[0]!.price ?? 0, owned: [ladder[0]!.name] } });
    renderAt('/game', <GamePage />);
    expect(screen.getByText(new RegExp(`^1 of ${ladder.length} bought\\. ${ladder[1]!.name} next,`))).toBeTruthy();
  });

  /**
   * Every kit and no walls, which is the state M227 made unreadable.
   *
   * The card said "nothing left to spend on" here, on the kit shop's word,
   * while every wall in the Ascent was still for sale. It says what it can
   * actually see now, and the balance stays a balance because there is still
   * something to spend it on (PLAN.md M233).
   */
  it('finishes the kits without claiming the app is finished', async () => {
    await withCoins(400);
    useGame.setState({ wallet: { spent: 0, owned: ladder.map((kit) => kit.name) } });
    renderAt('/game', <GamePage />);
    expect(screen.getByText(`All ${ladder.length} kits bought.`)).toBeTruthy();
    expect(screen.queryByText(/nothing left to spend on/)).toBeNull();
    // Still a spendable number, because the walls are still for sale: the
    // big figure carries no "earned" beside it and the tail still offers the
    // two-part reading. (`withCoins` seeds *levels*, so the balance here is
    // six figures rather than the 400 it is handed.)
    expect(screen.queryByText('earned')).toBeNull();
    expect(screen.getByText(/earned · .* spent\./)).toBeTruthy();
  });

  /**
   * And when there really is nothing left, the number stops being a balance.
   *
   * A spendable figure is an invitation to spend, and past the end of both
   * shops there is nothing to accept it with — so it becomes the total the
   * training paid, which is worth keeping and is not an offer.
   */
  it('stops offering a balance once both shops are empty', async () => {
    await withCoins(400);
    // Spent on purpose, and it is the whole point of the fixture: with
    // nothing spent the balance and the lifetime total are the same number,
    // so a card still showing the balance is indistinguishable from one
    // showing the total. A mutation battery walked through the first version
    // of this test for exactly that reason.
    const spent = 90_000;
    useGame.setState({
      wallet: {
        spent,
        owned: ladder.map((kit) => kit.name),
        walls: WALLS.filter((w) => w.price !== undefined).map((w) => w.id),
      },
    });
    renderAt('/game', <GamePage />);
    expect(screen.getByText(ALL_BOUGHT)).toBeTruthy();

    // 400 levels of ledger is 800,000 XP, and a coin is a quarter of one.
    const earned = 200_000;
    expect(screen.getByText(earned.toLocaleString())).toBeTruthy();
    expect(
      screen.queryByText((earned - spent).toLocaleString()),
      'the balance is still the headline',
    ).toBeNull();

    // Said so beside it, and the tail has dropped the half that repeated it.
    expect(screen.getByText('earned')).toBeTruthy();
    expect(screen.getByText(`${spent.toLocaleString()} spent.`, { exact: false })).toBeTruthy();
    expect(screen.queryByText(/earned · /), 'still reading as a balance').toBeNull();
  });

  /**
   * The kit card's own coin line, which is a second place the same claim is
   * made and was a second place nothing checked it.
   */
  it('stops offering a balance on the kit shelf too', async () => {
    await withCoins(400);
    useGame.setState({
      wallet: {
        spent: 90_000,
        owned: ladder.map((kit) => kit.name),
        walls: WALLS.filter((w) => w.price !== undefined).map((w) => w.id),
      },
    });
    renderAt('/game', <GamePage />);
    expect(
      screen.getByText(/200,000 coins earned, and everything bought\./),
    ).toBeTruthy();
    expect(screen.queryByText(/^110,000 coins\./)).toBeNull();
  });

  it('keeps offering one while a single thing is still for sale', async () => {
    await withCoins(400);
    // Every kit and every wall but one. The boundary the coin line turns on,
    // and a line that turned one rung early would read as finished here.
    const walls = WALLS.filter((w) => w.price !== undefined).map((w) => w.id);
    useGame.setState({
      wallet: { spent: 0, owned: ladder.map((k) => k.name), walls: walls.slice(0, -1) },
    });
    renderAt('/game', <GamePage />);
    expect(screen.queryByText(ALL_BOUGHT)).toBeNull();
    expect(screen.queryByText('earned')).toBeNull();
    expect(screen.getByText(/200,000 coins\./)).toBeTruthy();
  });
});

describe('a kit that was always free', () => {
  it('stays free, and wearable', async () => {
    await withCoins(0);
    renderAt('/game', <GamePage />);
    fireEvent.click(card('Chalk'));
    expect(useProfile.getState().avatarPalette.top).toBe('#f0efe9');
    expect(useGame.getState().wallet.spent).toBe(0);
  });
});
