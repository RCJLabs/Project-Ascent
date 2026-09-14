// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useSettings } from '@/store/settings';
import { ProgressPage } from './ProgressPage';

/**
 * The caveat is on the screen, not merely in the file (PLAN.md M168).
 *
 * The first version of this check grepped `ProgressPage.tsx` for the
 * sentences, which passed while the paragraph carried `hidden` — the battery
 * said so by surviving. Prose is only retracted where a climber can read the
 * retraction.
 */

const DAY = today();

/** Three months of steady training, so the chart has a ratio to draw. */
async function trained(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let d = 90; d >= 0; d -= 1) {
    const date = addDays(DAY, -d);
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (![1, 3, 5].includes(dow)) continue;
    const session: Session = {
      ...newSession(date, 0),
      completed: true,
      rpe: 7,
      durationMin: 60,
    };
    await putSession(session);
  }
  await hydrate();
  useSettings.setState({ progressView: 'block' });
}

const body = () => document.body.textContent ?? '';

async function open(): Promise<void> {
  renderAt('/progress', <ProgressPage />);
  await screen.findByText('Where the ratio has been');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('what the load chart says about its own number', () => {
  it('says the acute week is inside the baseline it is divided by', async () => {
    await trained();
    await open();
    expect(body(), 'the caveat is not rendered').toMatch(
      /your week is inside those four, so the same training sits on both sides of the division/,
    );
  });

  it('says the method is disputed rather than settled', async () => {
    await trained();
    await open();
    expect(body()).toMatch(/the argument is not settled/);
    expect(body()).toMatch(/The bands are the ones drawn for this version of the ratio/);
  });

  it('keeps the mechanism, which is not the disputed part', async () => {
    await trained();
    await open();
    expect(body()).toMatch(/tissue adapts slower than the muscle driving the change/);
    expect(body()).toMatch(/not as a diagnosis/);
  });

  it('points at the guide that carries the longer answer', async () => {
    await trained();
    await open();
    const link = screen
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === '#/guides/injury_management');
    expect(link, 'no link to the injury guide').toBeTruthy();
    expect((link!.textContent ?? '').trim()).toBe('The longer answer');
  });

  /**
   * And the claim it retired is on no screen at all. The engine's own prose
   * quotes it to record the decision; nothing a climber reads does.
   */
  it('never says the retired sentence anywhere on the page', async () => {
    await trained();
    await open();
    expect(body()).not.toMatch(/most associated with injury/);
  });
});
