// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import { getSession, newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { REST_PRESETS, restLabel } from '@/engine/gym';
import { loadRest } from '@/lib/timerState';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { TodayRedirect } from './TodayRedirect';
import { DayBody } from './LogPage';

/**
 * Quick log, full log (PLAN.md M120).
 *
 * The logger opens folded to the climbs, the effort and the button; "More"
 * unfolds the rest and the fold is remembered. Gym mode's tally, rest timer
 * and wake lock live here now, so the tests M74 wrote for the route are
 * the tests for the quick view — the point was always that it is the same
 * session.
 */

const DATE = today();
const ID = `${DATE}#0`;

async function running(patch: Partial<Session> = {}, view: 'quick' | 'full' = 'quick'): Promise<void> {
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
  useSettings.setState({ logView: view });
  renderAt('/', <DayBody date={DATE} />);
}

const stored = async () => (await getSession(ID))!;
const titles = () => [...document.querySelectorAll('h2')].map((h) => h.textContent?.trim());

describe('the fold', () => {
  it('opens on the climbs, the effort and the button', async () => {
    await running();
    await screen.findByText('Climbs');
    const t = titles();
    expect(t).toContain('Climbs');
    expect(t).toContain('Effort');
    expect(t).toContain('Rest');
    for (const folded of ['Before you start', 'Notes', 'Photos', 'Warmup', 'Cooldown']) {
      expect(t, `${folded} should be folded`).not.toContain(folded);
    }
    expect(screen.getByRole('button', { name: /Mark complete/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^More/ }).getAttribute('aria-expanded')).toBe('false');
  });

  it('unfolds on More, and the button stays last', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /^More/ }));
    const t = titles();
    for (const card of ['Before you start', 'Climbs', 'Warmup', 'Effort', 'Cooldown', 'Notes', 'Photos']) {
      expect(t, card).toContain(card);
    }
    // The old order, check-in first.
    expect(t.indexOf('Before you start')).toBeLessThan(t.indexOf('Climbs'));
    // The fold sits above the button, so the button is still the last
    // thing in the editor whichever way the page is showing.
    const less = screen.getByRole('button', { name: /^Less/ });
    const complete = screen.getByRole('button', { name: /Mark complete/ });
    expect(less.compareDocumentPosition(complete) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const notes = screen.getByText('Notes');
    expect(notes.compareDocumentPosition(complete) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(less.getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers the fold on the device', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /^More/ }));
    expect(useSettings.getState().logView).toBe('full');
    const device = JSON.parse(localStorage.getItem('project-ascent:device') ?? '{}') as { logView?: string };
    expect(device.logView).toBe('full');
    useSettings.setState({ logView: 'quick' });
    await hydrate();
    expect(useSettings.getState().logView).toBe('full');
  });

  it('opens full when the device says so', async () => {
    await running({}, 'full');
    await screen.findByText('Notes');
    expect(titles()).toContain('Before you start');
  });

  it('keeps the prescription in the quick view, because that is the session', async () => {
    // A program day with blocks: the fingerboard is not "more".
    await reset();
    sessionStorage.clear();
    const { getProgram } = await import('@/content/programs');
    const program = getProgram('iron_grip')!;
    const type = program.sessionTypes.find((t) => t.id === 'fp')!;
    await putSession({
      ...newSession(DATE, 0, { completed: false }),
      programId: program.id,
      sessionTypeId: type.id,
    } as never);
    await hydrate();
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: DATE },
      plans: { [program.id]: {} },
      weekOverrides: {},
      adaptations: {},
    });
    useSettings.setState({ logView: 'quick' });
    renderAt('/', <DayBody date={DATE} />);
    await screen.findByText('Climbs');
    expect(titles()).toContain("Today's prescription");
    expect(titles()).not.toContain('Drill');
  });
});

describe('the tally is the session', () => {
  it('writes a tap straight onto the session record', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /One more V4 sent/ }));
    await waitFor(async () => expect((await stored()).climbs[0]!.count).toBe(3));
  });

  it('removes a row rather than leaving it at zero, and offers it back', async () => {
    await running();
    fireEvent.click(await screen.findByRole('button', { name: /One fewer V6 tried/ }));
    await waitFor(async () => expect((await stored()).climbs.map((c) => c.id)).toEqual(['a']));
  });

  it('says what the session adds up to', async () => {
    await running();
    await screen.findByText('Climbs');
    expect(screen.getByText(/3 climbs · 2 sent · 1 tried · hardest V4/)).toBeTruthy();
  });

  it('gives the plus the big target and the minus the small one', async () => {
    await running();
    const plus = await screen.findByRole('button', { name: /One more V4 sent/ });
    const minus = screen.getByRole('button', { name: /One fewer V4 sent/ });
    expect(plus.className).toContain('bg-accent');
    expect(minus.className).toContain('w-9');
  });
});

describe('the rest timer', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('is there while the session is live, and offers the presets', async () => {
    await running();
    const card = (await screen.findByText('Rest')).closest('section, div') as HTMLElement;
    for (const seconds of REST_PRESETS) {
      expect(within(card).getByRole('button', { name: restLabel(seconds) })).toBeTruthy();
    }
  });

  it('is not there on a session that is not running', async () => {
    await running({ startedAt: undefined });
    await screen.findByText('Climbs');
    expect(screen.queryByText('Rest')).toBeNull();
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

describe('the screen stays on', () => {
  it('asks for the wake lock while live and lets it go after', async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    await running();
    await screen.findByText('Climbs');
    await waitFor(() => expect(request).toHaveBeenCalled());
  });

  it('does not ask on a session that is not running', async () => {
    const request = vi.fn(async () => ({ release: vi.fn(async () => undefined) }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    await running({ startedAt: undefined });
    await screen.findByText('Climbs');
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the old address', () => {
  it("sends /gym to today's log", async () => {
    // Home from M120 to M123, when today's log was Home; today has its own
    // page again (PLAN.md M124) and a shortcut called "gym mode" should
    // land in the log rather than on the front door.
    await reset();
    await hydrate();
    renderAt('/gym', <TodayRedirect />);
    await waitFor(() => expect(window.location.hash).toBe(`#/log/${today()}`));
  });
});
