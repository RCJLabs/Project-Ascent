// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { act, cleanup, render, fireEvent, type RenderResult } from '@testing-library/react';
import { REST_PRESETS, restLabel } from '@/engine/gym';
import { loadRest, saveRest } from '@/lib/timerState';
import { RestTimer } from './RestTimer';

/**
 * The rest between burns, driven (PLAN.md M266).
 *
 * `engine/gym.ts` proves `restRemaining` and `restLabel`, and `lib/cues.ts`
 * and `lib/timerState.ts` have their own files — but nothing had ever
 * rendered the card that puts them together, which is where the number a
 * climber actually reads is decided.
 */

vi.mock('@/lib/cues', () => ({
  cueCountdown: vi.fn(),
  cueDone: vi.fn(),
  unlock: vi.fn(),
}));
vi.mock('@/ui/Announce', () => ({ announce: vi.fn() }));

const { cueCountdown, cueDone } = await import('@/lib/cues');
const { announce } = await import('@/ui/Announce');

const SESSION = 'session-1';
/** Far enough out that `loadRest` never refuses the fixture for being past. */
const ENDS_AT = Date.now() + 3_600_000;

/**
 * The card mid-rest, with a chosen number of milliseconds left.
 *
 * `now` is a prop rather than the clock, which is what makes an exact
 * part-second reachable: the page ticks it once a second, so the last
 * fraction of a rest is a state the component is really in and a test can
 * never hit by waiting.
 */
function resting(left: number, seconds = 180): RenderResult {
  saveRest({ endsAt: ENDS_AT, seconds, sessionId: SESSION });
  return render(<RestTimer sessionId={SESSION} now={ENDS_AT - left} />);
}

const clock = (view: RenderResult) => view.container.querySelector('[role="timer"]')?.textContent;

beforeEach(() => {
  sessionStorage.clear();
  vi.mocked(cueCountdown).mockClear();
  vi.mocked(cueDone).mockClear();
  vi.mocked(announce).mockClear();
});
afterEach(cleanup);

describe('the number on a rest that is still running', () => {
  it('does not read zero while there is rest left', () => {
    // The defect. Flooring gave the last 999ms of every rest to `0:00`,
    // so the card said the rest was over up to a second before the beep.
    expect(clock(resting(400))).toBe('0:01');
    cleanup();
    expect(clock(resting(1))).toBe('0:01');
    cleanup();
    expect(clock(resting(999))).toBe('0:01');
  });

  it('never renders 0:00 at any point it is still counting', () => {
    for (const left of [1, 250, 400, 999, 1000, 1001, 2500, 59_999, 180_000]) {
      const view = resting(left);
      expect(clock(view), `${left}ms left`).not.toBe('0:00');
      cleanup();
    }
  });

  it('gives a part second to the second it is still inside', () => {
    // Two and a half seconds of rest is not two seconds of rest.
    expect(clock(resting(2500))).toBe('0:03');
    cleanup();
    expect(clock(resting(1001))).toBe('0:02');
  });

  it('reads the whole minute a preset starts on', () => {
    expect(clock(resting(180_000))).toBe('3:00');
    cleanup();
    expect(clock(resting(90_000, 90))).toBe('1:30');
    cleanup();
    expect(clock(resting(60_000, 60))).toBe('1:00');
  });

  it('never shows more rest than the chip that was pressed', () => {
    // The page samples its clock once a second, so the render caused by the
    // tap carries a `now` up to a second stale — and rounding up on top of
    // that read `1:01` on a rest the climber asked sixty seconds for.
    expect(clock(resting(60_400, 60))).toBe('1:00');
    expect(clock(resting(60_999, 60))).toBe('1:00');
    cleanup();
    expect(clock(resting(90_999, 90))).toBe('1:30');
  });

  it('counts a tick down by exactly one second', () => {
    // The guard on ceiling: rounding up must not make the clock sit on a
    // number for two ticks or skip one. 1s of wall clock, 1s on the card.
    const seen = [0, 1, 2, 3, 4].map((i) => {
      const view = resting(180_000 - i * 1000);
      const text = clock(view);
      cleanup();
      return text;
    });
    expect(seen).toEqual(['3:00', '2:59', '2:58', '2:57', '2:56']);
  });
});

describe('the cues', () => {
  /** A page ticking `now` once a second, as the logger does. */
  function tick(from: number, ticks: number): RenderResult {
    saveRest({ endsAt: ENDS_AT, seconds: 180, sessionId: SESSION });
    const view = render(<RestTimer sessionId={SESSION} now={ENDS_AT - from} />);
    for (let i = 1; i <= ticks; i++) {
      view.rerender(<RestTimer sessionId={SESSION} now={ENDS_AT - from + i * 1000} />);
    }
    return view;
  }

  it('beeps once for each of the last three seconds', () => {
    // 5.4s left, six ticks: the counting beep belongs to 2.4s, 1.4s and
    // 0.4s remaining, and to nothing above three seconds.
    tick(5400, 6);
    expect(vi.mocked(cueCountdown).mock.calls.length).toBe(3);
  });

  it('does not beep at all on a rest that never reaches three seconds', () => {
    tick(120_000, 3);
    expect(vi.mocked(cueCountdown).mock.calls.length).toBe(0);
  });

  it('says the rest is over once, when it is over', () => {
    tick(5400, 5);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(0);
    tick(5400, 6);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(1);
    expect(vi.mocked(announce)).toHaveBeenCalledWith('Rest over.');
  });

  it('does not say it twice when the page keeps ticking', () => {
    tick(5400, 9);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(1);
  });
});

describe('when the rest actually ends', () => {
  // The page's clock is a prop and it never moves in these tests. Only real
  // time does — which is the whole point: the rest has to end on its own end
  // time rather than waiting to be told by the next tick.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function started(msLeft: number): RenderResult {
    const endsAt = Date.now() + msLeft;
    saveRest({ endsAt, seconds: 180, sessionId: SESSION });
    return render(<RestTimer sessionId={SESSION} now={endsAt - msLeft} />);
  }
  const running = (view: RenderResult) => view.container.querySelector('[role="timer"]') !== null;

  it('ends on its own end time, not on the page\'s next tick', async () => {
    // Measured in a browser before this: the beep, the announcement and the
    // presets all arrived 1020ms after the rest was genuinely over, because
    // the card only noticed when the logger's once-a-second clock moved.
    const view = started(1500);
    expect(running(view)).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1500)));
    expect(running(view)).toBe(false);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(1);
    expect(vi.mocked(announce)).toHaveBeenCalledWith('Rest over.');
  });

  it('does not end a moment early either', async () => {
    const view = started(1500);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1400)));
    expect(running(view)).toBe(true);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(0);
  });

  it('says it once, however long the page is left open afterwards', async () => {
    const view = started(1000);
    await act(async () => void (await vi.advanceTimersByTimeAsync(30_000)));
    expect(running(view)).toBe(false);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(1);
  });

  it('gives a newly started rest its own end, not the last one\'s', async () => {
    const view = started(1000);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(running(view)).toBe(false);
    fireEvent.click(view.getByText(restLabel(60)));
    expect(running(view)).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(59_000)));
    expect(running(view), 'still resting at 59s of 60').toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    expect(running(view)).toBe(false);
    expect(vi.mocked(cueDone).mock.calls.length).toBe(2);
  });

  it('forgets a pending end when the rest is stopped', async () => {
    const view = started(2000);
    fireEvent.click(view.getByText('Stop'));
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(vi.mocked(cueDone).mock.calls.length).toBe(0);
  });

  /**
   * The id of the card's own pending end.
   *
   * Picked out of every `setTimeout` by its delay: React's scheduler takes
   * timers too, so counting them proves nothing, but nothing else in a
   * mounted logger asks for exactly five minutes.
   */
  function pendingEnd(set: MockInstance<typeof setTimeout>): unknown {
    const at = set.mock.calls.findIndex((c) => c[1] === 300_000);
    expect(at, 'the card scheduled its own end').toBeGreaterThanOrEqual(0);
    return set.mock.results[at]!.value;
  }

  it('leaves no timer behind when the rest is stopped', () => {
    // A five-minute rest holds a five-minute timer and nothing downstream
    // would show it leaking, so this follows the id.
    const set = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const view = started(300_000);
    const id = pendingEnd(set);
    fireEvent.click(view.getByText('Stop'));
    expect(clear.mock.calls.some((c) => (c[0] as unknown) === id)).toBe(true);
  });

  it('lets go of the timer when the logger goes', () => {
    const set = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const view = started(300_000);
    const id = pendingEnd(set);
    view.unmount();
    expect(clear.mock.calls.some((c) => (c[0] as unknown) === id)).toBe(true);
  });
});

describe('choosing and stopping a rest', () => {
  it('offers every preset, spelled the way the engine spells it', () => {
    const view = render(<RestTimer sessionId={SESSION} now={Date.now()} />);
    const labels = [...view.container.querySelectorAll('button')].map((b) => b.textContent);
    expect(labels).toEqual(REST_PRESETS.map((s) => restLabel(s)));
  });

  it('shows the presets again once the rest has run out', () => {
    const view = resting(0);
    expect(clock(view)).toBeUndefined();
    expect(view.getByText(restLabel(180))).toBeTruthy();
  });

  it('starts the rest the tapped chip asks for, and keeps it across a reload', () => {
    const view = render(<RestTimer sessionId={SESSION} now={Date.now()} />);
    fireEvent.click(view.getByText(restLabel(90)));
    const stored = loadRest(SESSION);
    expect(stored?.seconds).toBe(90);
    expect(stored!.endsAt - Date.now()).toBeGreaterThan(88_000);
    expect(view.container.querySelector('[role="timer"]')).toBeTruthy();
  });

  it('forgets the rest when it is stopped', () => {
    const view = resting(120_000);
    fireEvent.click(view.getByText('Stop'));
    expect(loadRest(SESSION)).toBeNull();
    expect(view.container.querySelector('[role="timer"]')).toBeNull();
  });

  it('does not pick up a rest left by another session', () => {
    saveRest({ endsAt: ENDS_AT, seconds: 180, sessionId: 'a-different-session' });
    const view = render(<RestTimer sessionId={SESSION} now={ENDS_AT - 120_000} />);
    expect(view.container.querySelector('[role="timer"]')).toBeNull();
  });
});
