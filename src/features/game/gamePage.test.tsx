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
    await screen.findByRole('heading', { level: 1, name: 'Game' });
    const hrefs = [...document.querySelectorAll('main a[href], a[href]')].map((a) => a.getAttribute('href'));
    for (const expected of ['#/climber', '#/altimeter', '#/board', '#/ascent', '#/skills', '#/achievements']) {
      expect(hrefs, `${expected} is not on the game tab`).toContain(expected);
    }
  });

  it('took the game cards off Home rather than copying them', () => {
    const home = readFileSync('src/features/home/HomePage.tsx', 'utf8');
    for (const gone of ['ClimberStrip', 'AltimeterCard', 'AscentCard', 'BoardCard', 'LevelBar', 'MountainMeter']) {
      expect(home, `${gone} is still on Home`).not.toContain(gone);
    }
  });

  it('leaves Home with no route into the game but the tab', async () => {
    await reset();
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    const hrefs = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    for (const gone of ['#/climber', '#/altimeter', '#/board', '#/ascent']) {
      expect(hrefs, `${gone} is still linked from Home`).not.toContain(gone);
    }
  });
});
