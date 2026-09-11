import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  DRIFT_WEEKS,
  SETTLED_SESSIONS,
  baselineDrift,
  describeDaysDrift,
  describeExperienceDrift,
  type DriftInput,
} from './baselineDrift';

/**
 * When what you told us stops matching what you do (PLAN.md M93).
 *
 * Measured against the recent log rather than a timestamp: the question is
 * not "has this changed since you said it" but "does it match what you are
 * doing now".
 */

const TODAY = '2026-09-11';
const back = (n: number) => addDays(TODAY, -n);

const did = (date: string, i = 0, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#${i}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    climbs: [],
    ...patch,
  }) as unknown as Session;

/** `perWeek` sessions a week for `weeks` weeks, ending today. */
function trainedAt(perWeek: number, weeks: number): Session[] {
  const out: Session[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let i = 0; i < perWeek; i++) out.push(did(back(w * 7 + i), i));
  }
  return out;
}

// `Partial<DriftInput>` intersected with a partial `stated` still demands a
// whole `stated`, which type-checks nowhere and is why M93 shipped red.
const drift = (
  patch: { sessions?: Session[]; today?: string; stated?: Partial<DriftInput['stated']> } = {},
) =>
  baselineDrift({
    stated: { experience: 'intermediate', daysPerWeek: 4, ...patch.stated },
    sessions: patch.sessions ?? [],
    today: patch.today ?? TODAY,
  });

describe('the days you said you would train', () => {
  it('says nothing while the log agrees', () => {
    expect(drift({ sessions: trainedAt(4, 8) }).days).toBeNull();
  });

  // One day either way is ordinary life, and a note that fires on it is a
  // note people learn to dismiss.
  it('says nothing about one day either way', () => {
    expect(drift({ sessions: trainedAt(3, 8) }).days).toBeNull();
    expect(drift({ sessions: trainedAt(5, 8) }).days).toBeNull();
  });

  it('says so when the log is two days short', () => {
    const d = drift({ sessions: trainedAt(2, 8) }).days;
    expect(d).toMatchObject({ stated: 4, observed: 2 });
  });

  it('says so when the log is two days over', () => {
    expect(drift({ sessions: trainedAt(6, 8) }).days?.observed).toBe(6);
  });

  /** Five of eight weeks with no app is not five weeks of not training. */
  it('measures a short history over the weeks it has', () => {
    const d = drift({ sessions: trainedAt(1, 5) }).days;
    // Five weekly sessions span four elapsed weeks and a day.
    expect(d?.weeks).toBe(4);
    expect(d?.observed).toBe(1);
  });

  it('says nothing at all on a log too thin to read', () => {
    expect(drift({ sessions: trainedAt(1, 2) }).days).toBeNull();
    expect(drift({ sessions: [] }).days).toBeNull();
  });

  /**
   * Not silence: a climber who says four days a week and has logged nothing
   * for two months is exactly the case worth saying something about, and
   * the old rate is not evidence of the current one.
   */
  it('reads a lapsed climber as zero rather than as their old rate', () => {
    const old = trainedAt(6, 4).map((s) => did(addDays(s.date, -90), 0));
    expect(drift({ sessions: old }).days).toMatchObject({ stated: 4, observed: 0, weeks: DRIFT_WEEKS });
  });

  it('does not count rest days as training days', () => {
    const rest = { restChecklist: { hydration: true, mobility: true, zone1: true, sleep: true } };
    const sessions = [...trainedAt(2, 8), ...trainedAt(4, 8).map((s) => did(s.date, 9, rest))];
    expect(drift({ sessions }).days?.observed).toBe(2);
  });

  it('does not count a session that was never finished', () => {
    const sessions = [...trainedAt(2, 8), ...trainedAt(4, 8).map((s) => did(s.date, 9, { completed: false }))];
    expect(drift({ sessions }).days?.observed).toBe(2);
  });

  it('says both numbers and the window it read', () => {
    // Nine weeks of history, so the window is the full eight rather than
    // the span of the log inside it.
    const d = drift({ sessions: trainedAt(2, DRIFT_WEEKS + 1) }).days!;
    expect(describeDaysDrift(d)).toBe('You said 4 days a week. Your log says 2 days, over the last 8 weeks.');
  });

  it('agrees with itself about one day', () => {
    const d = drift({ stated: { daysPerWeek: 4 }, sessions: trainedAt(1, 8) }).days!;
    expect(describeDaysDrift(d)).toContain('says 1 day,');
  });
});

describe('the phase you said you were in', () => {
  const settled = trainedAt(3, 12);

  it('notices that "new" has stopped being true', () => {
    const d = drift({ stated: { experience: 'new' }, sessions: settled }).experience;
    expect(d).toMatchObject({ stated: 'new' });
    expect(d!.sessions).toBeGreaterThanOrEqual(SETTLED_SESSIONS);
  });

  it('notices the same about coming back', () => {
    expect(drift({ stated: { experience: 'returning' }, sessions: settled }).experience?.stated).toBe('returning');
  });

  /**
   * One direction only. A climber calling themselves intermediate when the
   * app thinks otherwise is a coaching judgement about grades and years,
   * and the app second-guessing that from a row count would be worse than
   * saying nothing.
   */
  it('leaves intermediate and advanced alone, however much is logged', () => {
    expect(drift({ stated: { experience: 'intermediate' }, sessions: settled }).experience).toBeNull();
    expect(drift({ stated: { experience: 'advanced' }, sessions: settled }).experience).toBeNull();
  });

  it('waits for enough sessions', () => {
    expect(drift({ stated: { experience: 'new' }, sessions: trainedAt(1, 12) }).experience).toBeNull();
  });

  it('waits for enough weeks, however many sessions there are', () => {
    expect(drift({ stated: { experience: 'new' }, sessions: trainedAt(12, 3) }).experience).toBeNull();
  });

  it('counts what is there rather than claiming when it happened', () => {
    const d = drift({ stated: { experience: 'returning' }, sessions: settled }).experience!;
    expect(describeExperienceDrift(d)).toMatch(/^You said you were coming back\. The log has 36 sessions across 11 weeks\.$/);
    expect(describeExperienceDrift(d), 'claims a span it cannot know').not.toMatch(/since then/i);
  });
});
