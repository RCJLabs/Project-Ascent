// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinderPage } from '@/features/finder/FinderPage';

/**
 * The finder's own promise, on screen (PLAN.md M193).
 *
 * Under the question it says a program running past the stated evening
 * *still shows, and says which ones and by how much*. The page showed three
 * programs and the fit penalty is worth ten points, so it did not.
 */

const TEXT = (): string => document.body.textContent ?? '';

async function finder(): Promise<void> {
  await reset();
  await loadPrograms();
  await hydrate();
  renderAt('/find', <FinderPage />);
  await screen.findByRole('heading', { level: 1 });
}

function chip(cardTitle: string, label: string): void {
  const card = [...document.querySelectorAll('section')].find(
    (s) => s.querySelector('h2')?.textContent === cardTitle,
  )!;
  const found = [...card.querySelectorAll('button')].find(
    (b) => b.textContent?.trim().startsWith(label),
  )!;
  fireEvent.click(found);
}

/** Program names on the page, in the order they are rendered. */
function shown(): string[] {
  return [...document.querySelectorAll('section h2')]
    .map((h) => h.textContent ?? '')
    .filter((t) => t.length > 0);
}

async function answer(minutes: string): Promise<void> {
  await finder();
  chip('How long have you been climbing?', 'Established');
  chip('What do you want most right now?', 'Stronger fingers');
  chip('What can you train on?', 'Hangboard');
  chip('How long is a session for you?', minutes);
  fireEvent.click(screen.getByRole('button', { name: /Find my program/ }));
  await screen.findByText(/Your program/i);
}

describe("the evening moves a program down the list, never off it", () => {
  it('shows the ones the clock displaced, under their own heading', async () => {
    await answer('45');
    expect(screen.getByText('Moved down, not off')).toBeTruthy();
  });

  it('says by how much, on the card it rescued', async () => {
    await answer('45');
    const heading = screen.getByText('Moved down, not off');
    // Everything after the heading and before Out of reach is the section.
    const after = (heading.parentElement?.textContent ?? '').split('Moved down, not off')[1] ?? '';
    const section = after.split('Out of reach for now')[0] ?? '';
    expect(section).toMatch(/sessions? runs? past 45 min/);
  });

  it('keeps the heading and its cards off the page when time is open', async () => {
    await answer('Any');
    expect(screen.queryByText('Moved down, not off')).toBeNull();
  });

  it('loses nothing the open answer showed', async () => {
    // The assertion M138 meant to make and did not: not that a fit line
    // exists, but that the same programs are on the page either way.
    await answer('Any');
    const open = shown();
    await answer('45');
    const tight = shown();
    // Self-check the comparison before trusting it: an empty list either
    // side would make this pass for the wrong reason (PLAN.md M169).
    expect(open.length).toBeGreaterThan(1);
    for (const name of open) {
      expect(tight, `${name} disappeared when the evening was named`).toContain(name);
    }
  });

  it('put a program back that the budget alone had removed', async () => {
    // The positive control for the test above: without the new section the
    // page really did lose one, so the sweep is reaching the defect.
    await answer('45');
    const heading = screen.getByText('Moved down, not off');
    const after = (heading.parentElement?.textContent ?? '').split('Moved down, not off')[1] ?? '';
    const section = after.split('Out of reach for now')[0] ?? '';
    const rescued = shown().filter((name) => section.includes(name));
    expect(rescued.length).toBeGreaterThan(0);
    await answer('Any');
    for (const name of rescued) expect(TEXT()).toContain(name);
  });

  it('explains why a long program is still worth offering', async () => {
    await answer('45');
    expect(TEXT()).toMatch(/A long session can be cut short/);
  });
});
