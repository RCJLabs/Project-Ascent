// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import { getSession, newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { REST_PRESETS, restLabel } from '@/engine/gym';
import { loadRest } from '@/lib/timerState';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { GymPage } from '@/features/gym/GymPage';

/**
 * Gym mode (PLAN.md M74).
 *
 * The point of the screen is that it is the *same session*, so most of what
 * is worth asserting is that a tap here lands in the record the logger reads.
 */

const DATE = today();
const ID = `${DATE}#0`;

async function running(patch: Partial<Session> = {}): Promise<void> {
  await reset();
  sessionStorage.clear();
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    startedAt: new Date().toISOString(),
    climbs: [
      { id: 'a', grade: 'V4', scale: 'V', count: 2, result: 'send' },
      { id: 'b', grade: 'V6', scale: 'V', count: 1, result: 'attempt' },
    ],
    ...patch,
  } as never);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  renderAt('/gym', <GymPage />);
}

async function nothingRunning(): Promise<void> {
  await reset();
  sessionStorage.clear();
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  renderAt('/gym', <GymPage />);
}

const stored = async () => (await getSession(ID))!;

describe('the tally is the session', () => {
  it('shows what is already logged', async () => {
    await running();
    expect(await screen.findByText('V4')).toBeTruthy();
    expect(screen.getByText('V6')).toBeTruthy();
    expect(screen.getByText(/3 climbs · 2 sent · 1 tried/)).toBeTruthy();
  });

  it('writes a tap straight onto the session record', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /One more V4 sent/ }));
    await waitFor(async () => {
      expect((await stored()).climbs.find((c) => c.id === 'a')?.count).toBe(3);
    });
  });

  it('takes one back off', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /One fewer V4 sent/ }));
    await waitFor(async () => {
      expect((await stored()).climbs.find((c) => c.id === 'a')?.count).toBe(1);
    });
  });

  it('removes a row rather than leaving it at zero', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /One fewer V6 tried/ }));
    await waitFor(async () => {
      expect((await stored()).climbs.map((c) => c.id)).toEqual(['a']);
    });
  });

  it('leaves the rows where they are when one is tapped', async () => {
    await running();
    const before = (await screen.findAllByRole('listitem')).map((li) => li.textContent);
    fireEvent.click(screen.getByRole('button', { name: /One more V4 sent/ }));
    await waitFor(async () => expect((await stored()).climbs[0]!.count).toBe(3));
    const after = screen.getAllByRole('listitem').map((li) => li.textContent);
    // A list that reorders under a thumb logs the wrong grade.
    expect(after.map((t) => t!.slice(0, 2))).toEqual(before.map((t) => t!.slice(0, 2)));
  });

  it('adds a grade that is not on the list yet', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /Another grade/ }));
    fireEvent.click(screen.getByRole('button', { name: 'V7' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => {
      expect((await stored()).climbs.map((c) => c.grade)).toEqual(['V4', 'V6', 'V7']);
    });
  });

  it('merges a repeat into the row it already has', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /Another grade/ }));
    fireEvent.click(screen.getByRole('button', { name: 'V4' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add climb' }));
    await waitFor(async () => {
      const climbs = (await stored()).climbs;
      expect(climbs).toHaveLength(2);
      expect(climbs[0]!.count).toBe(3);
    });
  });
});

describe('the rest timer', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('offers the presets and nothing else', async () => {
    await running();
    const card = (await screen.findByText('Rest')).closest('section, div') as HTMLElement;
    for (const seconds of REST_PRESETS) {
      expect(within(card).getByRole('button', { name: restLabel(seconds) })).toBeTruthy();
    }
  });

  it('counts down once started', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: restLabel(60) }));
    expect(await screen.findByRole('timer')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('1:00');
    await vi.advanceTimersByTimeAsync(11_000);
    expect(screen.getByRole('timer').textContent).toBe('0:49');
  });

  it('stores an end time, not a count, so a sleeping phone does not pause it', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: restLabel(180) }));
    const saved = loadRest(ID);
    expect(saved?.seconds).toBe(180);
    expect(saved!.endsAt - Date.now()).toBeGreaterThan(170_000);
  });

  it('puts the presets back when it runs out', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: restLabel(60) }));
    await screen.findByRole('timer');
    await vi.advanceTimersByTimeAsync(61_000);
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    // And a rest that finished while the page was away does not come back.
    expect(loadRest(ID)).toBeNull();
  });

  it('can be stopped early', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: restLabel(300) }));
    fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(screen.queryByRole('timer')).toBeNull());
    expect(loadRest(ID)).toBeNull();
  });
});

describe('arriving with nothing running', () => {
  it('does not adopt a session you already finished', async () => {
    await reset();
    sessionStorage.clear();
    await putSession({
      ...newSession(DATE, 0, { completed: true }),
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      climbs: [{ id: 'a', grade: 'V4', scale: 'V', count: 2, result: 'send' }],
    } as never);
    await hydrate();
    useProfile.setState({ activeProgramId: null, startDates: {} });
    renderAt('/gym', <GymPage />);
    // Tallying into a session that is over would put climbs onto a day the
    // climber has already signed off, and re-open its rewards.
    expect(await screen.findByRole('button', { name: /Start climbing/ })).toBeTruthy();
    expect(screen.queryByText('V4')).toBeNull();
  });

  it('starts a session here rather than sending you somewhere else first', async () => {
    await nothingRunning();
    fireEvent.click(await screen.findByRole('button', { name: /Start climbing/ }));
    await waitFor(async () => expect(await getSession(ID)).toBeDefined());
    const session = await stored();
    expect(session.startedAt).toBeTruthy();
    expect(session.completed).toBe(false);
  });

  it('does not offer the tally until there is a session to tally into', async () => {
    await nothingRunning();
    await screen.findByRole('button', { name: /Start climbing/ });
    expect(screen.queryByText('Tally')).toBeNull();
  });
});

describe('the way out', () => {
  it('points at the full log, which holds everything this screen left out', async () => {
    await running();
    const links = await screen.findAllByRole('link');
    expect(links.some((l) => l.getAttribute('href') === `#/log/${DATE}`)).toBe(true);
  });
});
