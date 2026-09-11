// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { EMPTY_BASELINE } from '@/engine/onboarding';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { FinderPage } from '@/features/finder/FinderPage';

/**
 * The baseline stops going stale (PLAN.md M93).
 *
 * **Correcting the milestone.** It says the stale baseline feeds "every
 * recommendation the app makes". It does not: `baseline` has one reader,
 * the finder, where it seeds the form's chips. The real harm is sharper —
 * the finder asked the same five questions and threw the answers away, so a
 * correction lasted exactly as long as the page did.
 */

const TODAY = today();
const back = (n: number) => addDays(TODAY, -n);

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
});

/** `perWeek` training sessions a week for `weeks` weeks, ending today. */
async function trained(perWeek: number, weeks: number): Promise<void> {
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < perWeek; i++) {
      await putSession({
        ...newSession(back(w * 7 + i), i, { completed: true }),
        rpe: 7,
        durationMin: 90,
      });
    }
  }
}

const find = () => fireEvent.click(screen.getByText('Find my program'));

describe('the finder keeps what it is told', () => {
  it('writes back an answer the climber changed', async () => {
    await hydrate();
    useProfile.setState({ baseline: { ...EMPTY_BASELINE, experience: 'returning', daysPerWeek: 4 } });
    renderAt('/find', <FinderPage />);

    // A stored baseline with nothing to doubt auto-runs to its result, so
    // the questions are one tap away rather than on screen.
    fireEvent.click(screen.getByText('Change my answers'));
    fireEvent.click(screen.getByText('Bouldering').closest('button')!);
    fireEvent.click(screen.getByText('2').closest('button')!);
    find();

    await waitFor(() => {
      expect(useProfile.getState().baseline?.daysPerWeek).toBe(2);
      expect(useProfile.getState().baseline?.discipline).toBe('boulder');
    });
  });

  it('starts a baseline for a climber who skipped onboarding', async () => {
    await hydrate();
    useProfile.setState({ baseline: null });
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('2').closest('button')!);
    find();
    await waitFor(() => expect(useProfile.getState().baseline?.daysPerWeek).toBe(2));
  });

  /**
   * `App.tsx` reads `onboardedAt` to decide whether a climber has ever been
   * through the first-run flow. Answering the finder is not that.
   */
  it('does not claim the climber has been through onboarding', async () => {
    await hydrate();
    useProfile.setState({ baseline: null, onboardedAt: null });
    renderAt('/find', <FinderPage />);
    find();
    await waitFor(() => expect(useProfile.getState().baseline).not.toBeNull());
    expect(useProfile.getState().onboardedAt).toBeNull();
  });

  /**
   * Writing the baseline back made the auto-run effect fire a second time,
   * replacing the result the climber had just asked for with one built from
   * the stored answers — which do not carry the weeks they have.
   */
  it('does not throw away the result it just produced', async () => {
    await hydrate();
    useProfile.setState({ baseline: { ...EMPTY_BASELINE } });
    renderAt('/find', <FinderPage />);
    fireEvent.click(screen.getByText('Change my answers'));
    fireEvent.click(screen.getByText('6 wk').closest('button')!);
    find();
    await waitFor(() => expect(screen.getAllByText(/you would run it over 6/).length).toBeGreaterThan(0));
  });
});

describe('when the log stops agreeing', () => {
  async function open(baseline: Partial<typeof EMPTY_BASELINE>): Promise<void> {
    await hydrate();
    useProfile.setState({ baseline: { ...EMPTY_BASELINE, ...baseline } });
    renderAt('/find', <FinderPage />);
  }

  it('says what the log says, beside the answer that no longer matches', async () => {
    await trained(2, 8);
    await open({ daysPerWeek: 5 });
    expect(await screen.findByText(/You said 5 days a week\. Your log says 2 days/)).toBeTruthy();
  });

  // The answer is the climber's, and the app's evidence is a count of rows.
  it('leaves the stored answer selected rather than overwriting it', async () => {
    await trained(2, 8);
    await open({ daysPerWeek: 5 });
    await screen.findByText(/Your log says 2 days/);
    expect(screen.getByText('5').closest('button')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('stops arguing once the chip has moved', async () => {
    await trained(2, 8);
    await open({ daysPerWeek: 5 });
    await screen.findByText(/Your log says 2 days/);
    fireEvent.click(screen.getByText('2').closest('button')!);
    expect(screen.queryByText(/Your log says 2 days/)).toBeNull();
  });

  it('notices a phase that has stopped being true', async () => {
    await trained(3, 12);
    await open({ experience: 'returning' });
    expect(await screen.findByText(/You said you were coming back/)).toBeTruthy();
  });

  it('says nothing while the log agrees', async () => {
    await trained(4, 8);
    await open({ daysPerWeek: 4, experience: 'intermediate' });
    fireEvent.click(await screen.findByText('Change my answers'));
    expect(screen.queryByText(/Your log says/)).toBeNull();
    expect(screen.queryByText(/You said you were/)).toBeNull();
  });

  /**
   * The auto-run exists so a climber who has just answered is not asked
   * twice. Handing them a recommendation built on answers the app has
   * itself flagged as out of date is the opposite of that.
   */
  it('asks rather than auto-running on answers it doubts', async () => {
    await trained(2, 8);
    await open({ daysPerWeek: 5 });
    expect(await screen.findByText('How many days a week can you train?')).toBeTruthy();
  });

  it('still auto-runs when it has no reason to doubt them', async () => {
    await trained(4, 8);
    await open({ daysPerWeek: 4 });
    expect(await screen.findByText('Change my answers')).toBeTruthy();
  });
});
