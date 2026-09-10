// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderAt, reset } from '@/test/render';
import { StartProgramPage } from '@/features/plan/StartProgramPage';
import { FinderPage } from '@/features/finder/FinderPage';
import { useIntent } from '@/store/intent';
import { DAY_NAMES } from '@/engine/scheduler';

/**
 * The week a climber can actually train (PLAN.md M55).
 *
 * The engine is tested where it lives; this is the half that only exists on
 * the screen — that the questions are askable at all, and that the answers
 * reach the shapes on offer.
 */

async function start(id = 'iron_grip') {
  await reset();
  renderAt(`/train/${id}/start`, <StartProgramPage params={{ id }} />);
}

/**
 * The day chips, by their full name.
 *
 * The three-letter labels also appear in every shape preview, so the chip is
 * found by its accessible name — which is the screen-reader-only full day —
 * rather than by the text on it.
 */
function dayChip(day: number): HTMLElement {
  return screen.getByRole('button', { name: DAY_NAMES[day]! });
}

/**
 * The weekly-shape cards, found by their seven-day preview grid rather than
 * by name — the names change with the days a climber picks, which is the
 * point of them.
 */
function shapeCards(): HTMLElement[] {
  return screen
    .getAllByRole('button')
    .filter((b) => within(b).queryAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/).length === 7);
}

describe('planning a week', () => {
  it('offers one day a week, which no program in the catalogue asks for', async () => {
    await start();
    const days = screen.getByText('Days per week').closest('div')!.parentElement!;
    expect(within(days).getByText('1')).toBeTruthy();
  });

  it('lets a climber say which days they have', async () => {
    await start();
    expect(screen.getByText('Days you can train')).toBeTruthy();
    for (const day of [0, 1, 2, 3, 4, 5, 6]) expect(dayChip(day)).toBeTruthy();
  });

  // The whole point: pick Friday, Saturday, Sunday and no shape may put a
  // session on Tuesday.
  it('builds the shapes only from the days picked', async () => {
    await start();
    for (const day of [5, 6, 0]) fireEvent.click(dayChip(day));

    const generated = shapeCards().filter((c) => !/^Recommended/.test(c.getAttribute('aria-label') ?? ''));
    expect(generated.length, 'no generated shapes at all').toBeGreaterThan(0);
    expect(generated.length).toBeGreaterThan(0);
    for (const card of generated) {
      // Each shape renders seven day cells; a training day is the accented one.
      const trained = within(card)
        .getAllByText(/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/)
        .filter((cell) => cell.parentElement?.className.includes('bg-accent'))
        .map((cell) => cell.textContent);
      expect(trained.length).toBeGreaterThan(0);
      for (const label of trained) expect(['Fri', 'Sat', 'Sun']).toContain(label);
    }
  });

  it('says so when the days picked leave no room for the week asked for', async () => {
    // The Long Game keeps Endurance and Performance off consecutive days,
    // and a Saturday-Sunday week is nothing but consecutive days.
    await start('the_long_game');
    for (const day of [6, 0]) fireEvent.click(dayChip(day));
    fireEvent.click(screen.getByText('2'));
    expect(screen.getByText(/leave no room for/i)).toBeTruthy();
  });

  // A shape that drops half the program without saying which half is how a
  // climber ends up running a different program than the one they read.
  it('names the sessions a short week leaves out', async () => {
    await start();
    fireEvent.click(screen.getByText('1'));
    expect(screen.getAllByText(/^Keeps .+\. Leaves out .+\.$/).length).toBeGreaterThan(0);
  });

  it('puts that sentence in the accessible name too, not just on screen', async () => {
    await start();
    fireEvent.click(screen.getByText('1'));
    const labelled = shapeCards().filter((c) => /Leaves out/.test(c.getAttribute('aria-label') ?? ''));
    expect(labelled.length).toBeGreaterThan(0);
  });
});

/**
 * How long the climber has (PLAN.md M57).
 *
 * The question is on the finder screen and not in the baseline: a trip is a
 * fact about this month, not about a climber.
 */
describe('the finder asks how long you have', () => {
  it('asks, with an open answer as the default', async () => {
    await reset();
    renderAt('/find', <FinderPage />);
    expect(screen.getByText('How long until you need it?')).toBeTruthy();
    expect(screen.getByText('Open').closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('carries the answer into the recommendation it makes', async () => {
    await reset();
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('6 wk').closest('button')!);
    fireEvent.click(screen.getByText('Find my program'));
    expect(screen.getAllByText(/you would run it over 6/).length).toBeGreaterThan(0);
  });

  it('says nothing about weeks when the answer is left open', async () => {
    await reset();
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('Find my program'));
    expect(screen.queryByText(/you would run it over/)).toBeNull();
  });

  it('remembers the answer for the screen that can act on it', async () => {
    useIntent.setState({ weeksAvailable: null });
    await reset();
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('6 wk').closest('button')!);
    fireEvent.click(screen.getByText('Find my program'));
    expect(useIntent.getState().weeksAvailable).toBe(6);
  });

  it('forgets it again when the answer goes back to open', async () => {
    useIntent.setState({ weeksAvailable: 6 });
    await reset();
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('Find my program'));
    expect(useIntent.getState().weeksAvailable).toBeNull();
  });

  it('offers a one-day week here too', async () => {
    await reset();
    renderAt('/find', <FinderPage />);
    const days = screen.getByText('How many days a week can you train?').closest('div')!;
    expect(within(days.parentElement!).getByText('1')).toBeTruthy();
  });
});
