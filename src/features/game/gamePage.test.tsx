// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { screen } from '@testing-library/react';
import { hydrate, renderAt, reset } from '@/test/render';
import { GamePage } from './GamePage';
import { HomePage } from '@/features/home/HomePage';

/**
 * The game has its own door (PLAN.md M117).
 *
 * Four cards left Home for it — the climber strip, the altimeter, the board
 * and the arcade — and the point of a move is that the thing is in one
 * place afterwards. Both halves are checked: the hub has them, and Home
 * does not.
 */
describe('the game tab', () => {
  it('leads to everything the training earns', async () => {
    await reset();
    await hydrate();
    renderAt('/game', <GamePage />);
    // The heading is the rank title (M118), whatever it is today.
    await screen.findByRole('heading', { level: 1 });
    const hrefs = [...document.querySelectorAll('main a[href], a[href]')].map((a) => a.getAttribute('href'));
    for (const expected of ['#/altimeter', '#/board', '#/ascent', '#/skills', '#/achievements']) {
      expect(hrefs, `${expected} is not on the game tab`).toContain(expected);
    }
  });

  it('took the game cards off Home rather than copying them', () => {
    /**
     * `BoardCard` left this list at M231, and the fence around the rest did
     * not move.
     *
     * M117's principle was that a moved thing is in one place afterwards,
     * and it still holds for three of the four: the climber strip, the
     * altimeter and the arcade are *readings* — how high, what level, a game
     * to play — and a reading is a thing to go and look at, which is what a
     * tab is for. The **daily** is not a reading. It is a quality rung for a
     * session that has not happened yet, so it is worth having before the
     * session rather than after, and `DailyTaskCard` carries it on Home.
     *
     * The board's own summary card is still not on Home. The daily is one
     * row of the board, not the board.
     */
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    for (const gone of ['ClimberStrip', 'AltimeterCard', 'AscentCard', 'BoardCard', 'LevelBar', 'MountainMeter']) {
      expect(home, `${gone} is still on Home`).not.toContain(gone);
    }
  });

  it('carries the daily task on Home, and nothing else off the board', () => {
    // The other half of the reversal: the exception is one card and it is
    // named, so the next thing to drift back has to argue for itself here.
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    expect(home).toMatch(/lazyRoute\(\s*\(\) => import\('@\/features\/challenges\/DailyTaskCard'\)/);
    const card = readFileSync('src/features/challenges/DailyTaskCard.tsx', 'utf8');
    expect(card, 'the weekly set is already on Home as Your week').not.toMatch(/board\.weekly\.map/);
    expect(card, 'bounties are accepted, which is a thing to go and do').not.toMatch(
      /board\.bounties\.map|board\.offers/,
    );
    expect(card, 'claiming writes to the ledger and stays on the board').not.toMatch(/\bclaim\(/);
  });

  it('leaves Home with no route into the game but the tab and the daily', async () => {
    await reset();
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    // The daily card is a lazy chunk, so it is not in the DOM when the
    // session button is. Collecting the links before it lands would let a
    // card that linked into the game tab through.
    await screen.findByText(/Today.s task/);
    const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    // `#/board` left this list at M231 and is required below instead: the
    // daily is on Home, so the way to the rest of it has to be too.
    for (const gone of ['#/game', '#/altimeter', '#/ascent']) {
      expect(hrefs, `${gone} is still linked from Home`).not.toContain(gone);
    }
    // And it is required, not merely tolerated: the daily card is the way in
    // and a card that stopped linking anywhere would be a dead end.
    expect(hrefs, 'the daily task no longer leads to the board').toContain('#/board');
  });
});
