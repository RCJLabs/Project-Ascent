import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { checkInHistory } from './checkIns';
import { injuryHistory } from './injuryLog';
import { readCheckIn, readinessFor, type CheckIn } from './readiness';

/**
 * A check-in the app cannot read (PLAN.md M244).
 *
 * `FingerFeel` is three words and `SleepFeel` is three more, and a stored
 * record is whatever a backup put there: `importAll` checks that the file is
 * a Project Ascent backup and that each store is an array, then writes every
 * record verbatim — which is the app's own explanation, in its own error
 * text, for the defect M20 and M44 were written about.
 *
 * One answer outside the vocabulary reached four readers and failed
 * differently in each: a `NaN` count, a phantom column, a crash that cost a
 * whole card, and — the quiet one — an RPE ceiling printed directly under
 * the words "Nothing flagged." These pin all four.
 */

const TODAY = '2026-09-17';

const day = (date: string, checkIn: unknown): Session =>
  ({
    id: `${date}#0`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    climbs: [{ id: `c${date}`, grade: 'V4', scale: 'V', count: 2, result: 'send' }],
    checkIn,
  }) as Session;

/** Five days the app can read, and one it cannot. */
const LOG = [
  day('2026-09-08', { fingers: 'good', sleep: 'good' }),
  day('2026-09-10', { fingers: 'tender', sleep: 'short' }),
  day('2026-09-12', { fingers: 'good', sleep: 'good' }),
  day('2026-09-14', { fingers: 'sore', sleep: 'none' }),
  day('2026-09-15', { fingers: 'good', sleep: 'poor' }), // an older vocabulary
  day('2026-09-16', { fingers: 'good', sleep: 'good' }),
];

describe('one day the app cannot read', () => {
  /**
   * The quiet one, and the worst. `fingers[day.checkIn.fingers] += 1` on a
   * word the record does not have is `undefined + 1` — so the count a
   * climber reads becomes `NaN`, which is a wrong number rather than a
   * visible failure.
   */
  it('does not turn the counts into NaN', () => {
    const history = checkInHistory({ sessions: LOG, to: TODAY });
    for (const [feel, n] of Object.entries(history.sleep)) {
      expect(Number.isFinite(n), `sleep.${feel} is ${n}`).toBe(true);
    }
    for (const [feel, n] of Object.entries(history.fingers)) {
      expect(Number.isFinite(n), `fingers.${feel} is ${n}`).toBe(true);
    }
  });

  /** And invents no answer the vocabulary has never had. */
  it('does not grow a column for a word it does not know', () => {
    const history = checkInHistory({ sessions: LOG, to: TODAY });
    expect(Object.keys(history.sleep).sort()).toEqual(['good', 'none', 'short']);
    expect(Object.keys(history.fingers).sort()).toEqual(['good', 'sore', 'tender']);
  });

  /**
   * The five readable days are still read. This is M20's rule — one record
   * of the wrong shape costs that record, not the card that shows a hundred
   * good ones.
   */
  it('keeps every day it can read', () => {
    const history = checkInHistory({ sessions: LOG, to: TODAY });
    expect(history.days).toHaveLength(5);
    expect(history.days.every((d) => Number.isFinite(d.cap ?? 0))).toBe(true);
  });

  /** And says so, rather than repairing in silence. */
  it('says how many it could not read', () => {
    expect(checkInHistory({ sessions: LOG, to: TODAY }).unreadable).toBe(1);
    const clean = LOG.filter((s) => s.date !== '2026-09-15');
    expect(checkInHistory({ sessions: clean, to: TODAY }).unreadable).toBe(0);
  });

  /**
   * And the readiness engine, which is the one that matters most: its output
   * is the RPE ceiling the logger shows and the dose it eases. A `NaN` cost
   * there is a ceiling built on nothing.
   */
  it('is not read as an answer at all', () => {
    expect(readCheckIn({ fingers: 'good', sleep: 'poor' } as unknown as CheckIn)).toBeNull();
    expect(readCheckIn({ fingers: 'boiled', sleep: 'good' } as unknown as CheckIn)).toBeNull();
    expect(readCheckIn(undefined)).toBeNull();
    // A readable one comes back as itself, not a copy — the callers below
    // compare against `session.checkIn` and a new object every render is a
    // memo that never hits.
    const fine: CheckIn = { fingers: 'tender', sleep: 'short' };
    expect(readCheckIn(fine)).toBe(fine);
  });

  /**
   * `parts` is sparse by design, so one unreadable elbow does not cost a
   * readable shoulder.
   */
  it('drops the part it cannot read and keeps the rest', () => {
    const read = readCheckIn({
      fingers: 'good',
      sleep: 'good',
      parts: { elbow: 'achy', shoulder: 'sore' },
    } as unknown as CheckIn);
    expect(read?.parts).toEqual({ shoulder: 'sore' });
  });

  /**
   * The one that mattered most, and the reason this is a milestone rather
   * than a tidy-up. Spread into `readinessFor`, an unreadable answer made
   * the cost `NaN`, which loses every comparison — so the call came out
   * *adjusted* with nothing flagged, and the logger printed **"Nothing
   * flagged. — the check-in suggested 7 or below."** and took a set off
   * every block. A card arguing with itself, and a lighter session with no
   * answer behind it.
   */
  it('does not silently cap and lighten a session', () => {
    const unguarded = readinessFor({ fingers: 'good', sleep: 'poor' } as unknown as CheckIn);
    expect(unguarded.cap, 'the raw engine no longer caps — the guard can go').toBe(7);
    expect(unguarded.lighten).toBeGreaterThan(0);
    // The contradiction, pinned: a ceiling with nothing flagged under it.
    expect(unguarded.because).toBe('Nothing flagged.');
    expect(unguarded.flagBecause).toBeNull();

    // What the screens do with it now: no answer, so no ceiling and no
    // notch — the state a session with no check-in has always been in.
    const guarded = readCheckIn({ fingers: 'good', sleep: 'poor' } as unknown as CheckIn);
    expect(guarded).toBeNull();
  });
});

/**
 * The fourth reader, found by grepping for the rest of them rather than by
 * waiting for it to break in front of someone.
 *
 * `injuryHistory` reads `checkIn.parts[part]` and `InjuryPage` renders the
 * result as `FEEL_TONE[feel]` and `FEEL_WORD[feel]` — both `Record<TissueFeel,
 * string>`. A word outside the three came out as a chip with no word in it
 * and the string `undefined` where its classes should have been.
 */
describe('a part answer the app cannot read', () => {
  const part = (date: string, feel: string): Session =>
    day(date, { fingers: 'good', sleep: 'good', parts: { elbow: feel } });

  const SINCE = '2026-09-08';
  const sessions = [
    part('2026-09-08', 'good'),
    part('2026-09-10', 'tender'),
    part('2026-09-12', 'achy'), // an older vocabulary
    part('2026-09-14', 'sore'),
  ];

  it('leaves the day out rather than drawing a chip with no word in it', () => {
    const history = injuryHistory({ part: 'elbow', since: SINCE, sessions, to: TODAY });
    expect(history.days.map((d) => d.date)).toEqual(['2026-09-08', '2026-09-10', '2026-09-14']);
    expect(history.days.every((d) => ['good', 'tender', 'sore'].includes(d.feel))).toBe(true);
  });

  /**
   * And the counts stay a partition of the days: `worse + tender + fine`
   * was already short by the unreadable day, which is how the bug hid.
   */
  it('counts every day it kept', () => {
    const history = injuryHistory({ part: 'elbow', since: SINCE, sessions, to: TODAY });
    expect(history.worse + history.tender + history.fine).toBe(history.days.length);
    expect(history.elapsed).toBeGreaterThanOrEqual(history.days.length);
  });

  /** A readable log is untouched by the filter. */
  it('keeps a log it can read whole', () => {
    const clean = sessions.filter((s) => s.date !== '2026-09-12');
    const history = injuryHistory({ part: 'elbow', since: SINCE, sessions: clean, to: TODAY });
    expect(history.days).toHaveLength(3);
  });
});
