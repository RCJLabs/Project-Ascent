// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Equipment } from '@/content/types';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgramDetailPage } from './ProgramDetailPage';

/**
 * The page a climber decides on, told what the finder already knows
 * (PLAN.md M251).
 *
 * `finder.ts` blocks a program on kit and says so: *"Needs a hangboard you do
 * not have access to."* The program page listed the same requirement, offered
 * Start beside it, and never compared it to the climber's answer. The comment
 * on those very lines says the fix — *"The finder already refuses a program on
 * this; the page said nothing, so a climber arriving from the catalogue found
 * out at the first fingerboard session"* — and half of it was done.
 */

async function page(equipment: Equipment[], id = 'iron_grip'): Promise<void> {
  await reset();
  await hydrate();
  useProfile.setState({ equipment });
  renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
  await screen.findByRole('heading', { level: 1 });
}

const warning = () => screen.queryByText(/which your kit does not list/);

describe('a program that needs kit the climber has not got', () => {
  it('says so, in the words the finder uses', async () => {
    // The default answer at onboarding, and five of the thirteen programs
    // want a board.
    await page(['wall', 'gym']);
    expect(screen.getByText(/This needs a hangboard/)).toBeTruthy();
  });

  /**
   * And never takes the decision. `kit.ts` is explicit that this field
   * offers and does not decide — the climber may be at a friend's board, and
   * M236 reads *running a program* as evidence that they have its kit.
   */
  it('leaves the button exactly where it was', async () => {
    await page(['wall', 'gym']);
    expect(screen.getByText('Start this program').closest('a')?.getAttribute('href')).toBe(
      '#/train/iron_grip/start',
    );
  });

  it('points at the one place the answer can be changed', async () => {
    await page(['wall', 'gym']);
    expect(screen.getByText(/Settings is where the answer lives/)).toBeTruthy();
  });

  it('says nothing to a climber who has it all', async () => {
    await page(['wall', 'gym', 'hangboard', 'campus', 'weight']);
    expect(warning()).toBeNull();
    // The requirement is still listed — this replaces nothing.
    expect(document.body.textContent).toContain('What you need');
  });

  /**
   * With the requirement met but a nice-to-have absent, the quieter line
   * takes over — which is the finder's split, not a second rule.
   */
  it('drops to the helpful line once the requirement is met', async () => {
    await page(['wall', 'gym', 'hangboard']);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/This needs/);
    expect(text).toMatch(/Runs without a campus board or a way to add weight/);
  });

  /** A program that needs nothing never warns, whatever the climber owns. */
  it('says nothing about a program that needs nothing', async () => {
    await page([], 'general_training');
    expect(warning()).toBeNull();
  });
});

describe('kit that would only help', () => {
  /**
   * The finder's rule, kept: *"if the program runs without it, it runs."* A
   * program whose `helpfulEquipment` is missing gets a quieter line, and only
   * when nothing required is missing — one program never says both.
   */
  it('is a quieter line, and never both at once', async () => {
    await page(['wall', 'gym']);
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/This needs a hangboard/);
    expect(text, 'the required line wins outright').not.toMatch(/Runs without/);
  });
});
