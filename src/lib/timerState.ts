/**
 * A running protocol timer, kept across a reload (PLAN.md M21).
 *
 * Found while building M19: the timer was `useState` and nothing else, so a
 * refresh, a crash, or a phone reclaiming the tab mid-hangboard restarted the
 * protocol from set one. M19 stopped the *update* from causing it. This stops
 * everything else.
 *
 * `sessionStorage`, not IndexedDB and not `localStorage`. The lifetime is
 * exactly right: it survives a reload and dies with the tab, so nobody comes
 * back tomorrow to a timer claiming they are nineteen hours into a max-hang
 * set. Everything here is wrapped, because a browser set to block site data
 * throws on the accessor itself rather than returning null.
 */

const KEY = 'ascent:timer';

/** Past this, a restored timer is a stale one. Nobody's protocol is 3h long. */
export const TIMER_MAX_AGE_MS = 3 * 3600_000;

export interface TimerState {
  /** Which protocol is open, and how it was configured. */
  protocolId: string;
  exerciseName: string;
  sets: number;
  /** Which session it belongs to, so it cannot reopen on a different day. */
  sessionId: string;
  /** Milliseconds banked from earlier runs. */
  baseElapsed: number;
  /** Wall-clock anchor of the current run, or null when paused. Wall clock,
   *  not a counter, so a reload does not lose the time the app was gone. */
  startedAt: number | null;
  /** When this was written, for the staleness check. */
  savedAt: number;
}

export function saveTimerState(state: Omit<TimerState, 'savedAt'>): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }));
  } catch {
    // A browser that will not store it still runs the timer; it just will
    // not survive a reload, which is where this started.
  }
}

export function loadTimerState(sessionId: string, now = Date.now()): TimerState | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as Partial<TimerState>;
    if (
      typeof state.protocolId !== 'string' ||
      typeof state.exerciseName !== 'string' ||
      typeof state.sessionId !== 'string' ||
      typeof state.sets !== 'number' ||
      typeof state.baseElapsed !== 'number' ||
      typeof state.savedAt !== 'number'
    ) {
      return null;
    }
    // Someone else's session, or old enough that resuming it would be a lie.
    if (state.sessionId !== sessionId) return null;
    if (now - state.savedAt > TIMER_MAX_AGE_MS) return null;
    return {
      protocolId: state.protocolId,
      exerciseName: state.exerciseName,
      sets: state.sets,
      sessionId: state.sessionId,
      baseElapsed: state.baseElapsed,
      startedAt: typeof state.startedAt === 'number' ? state.startedAt : null,
      savedAt: state.savedAt,
    };
  } catch {
    return null;
  }
}

export function clearTimerState(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clear if it cannot be reached */
  }
}

/**
 * How far into the protocol a restored timer is.
 *
 * A paused timer resumes where it stopped. A running one has kept running
 * through the reload, because that is what a clock on the wall does and what
 * the climber's fingers did — the rest interval did not pause because the
 * page did.
 */
export function elapsedFrom(state: TimerState, now = Date.now()): number {
  return state.startedAt === null
    ? state.baseElapsed
    : state.baseElapsed + Math.max(0, now - state.startedAt);
}
