// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { BOONS, BOON_IDS } from '@/engine/ascent/boons';
import { hydrate, renderAt, reset } from '@/test/render';
import { AscentPage } from './AscentPage';

/**
 * Every boon on the screen that says what training does (PLAN.md M211).
 *
 * There was one hardcoded row here, for the slow-mo charge. Four boons were
 * added outside Dynamic Power and a hardcoded list would have hidden all of
 * them on the one screen whose job is to say what training buys — while a
 * hand-written line is exactly the drift `boons.ts` exists to stop.
 */
async function open(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/ascent', <AscentPage />);
}

describe('what your training does here', () => {
  it('lists every boon, earned or not', async () => {
    // M31's rule: a list of only the *active* hooks hides the half that
    // would give you a reason to train.
    await open();
    expect(await screen.findByText('From the skill trees')).toBeTruthy();
    for (const id of BOON_IDS) {
      const label = BOONS[id].label;
      const shown = label.charAt(0).toUpperCase() + label.slice(1);
      expect(screen.getByText(`· ${shown}`), id).toBeTruthy();
    }
  });

  it('lists exactly as many as there are, so none is written out by hand', async () => {
    await open();
    await screen.findByText('From the skill trees');
    const rows = screen
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '')
      // Both sides lowered: one label carries a proper noun ("Free Solo").
      .filter((text) =>
        BOON_IDS.some((id) => text.toLowerCase().includes(BOONS[id].label.toLowerCase())),
      );
    expect(rows).toHaveLength(BOON_IDS.length);
  });
});
