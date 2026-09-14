import { describe, expect, it } from 'vitest';
import { buildLoadIndex, deriveClimberState, loadSeries, sessionLoad } from './derive';
import { buildTips } from './coach';
import { buildHeatGrid } from './consistency';
import { newSession, type Session } from '@/db/sessions';
import { addDays } from './dates';

/**
 * A session with no effort score is not a rest day (PLAN.md M162).
 *
 * `sessionLoad` was `(rpe ?? 0) × ((durationMin ?? 0) / 60)`, so a completed
 * session carrying climbs, a duration and notes but no RPE was arithmetically
 * a day off. Once there was enough scored history behind it to build a
 * baseline, the ratio divided by that baseline and answered zero.
 *
 * The case that matters is not hypothetical: the detraining tip's own advice
 * is *"mark those days on the calendar and everything here follows"*, with a
 * button that does it. Marking them is what produced the sessions that broke
 * the reading.
 */

const TODAY = '2026-03-30';
const scored = (date: string): Session => ({
  ...newSession(date, 0),
  completed: true,
  rpe: 7,
  durationMin: 90,
});
const unscored = (date: string): Session => ({ ...newSession(date, 0), completed: true });

/** Eight weeks of scored training, then a fortnight of `tail`. */
function log(tail: ((date: string) => Session) | null): Session[] {
  const out: Session[] = [];
  for (let i = 70; i > 14; i -= 2) out.push(scored(addDays(TODAY, -i)));
  if (tail) for (let i = 14; i >= 0; i -= 2) out.push(tail(addDays(TODAY, -i)));
  return out;
}

const stateOf = (sessions: Session[]) => deriveClimberState(sessions, { today: TODAY }).load;

const dayFor = (grid: ReturnType<typeof buildHeatGrid>, date: string) =>
  grid.weeks.flat().find((d) => d.date === date);

describe('sessionLoad', () => {
  it('is null when the effort was never given', () => {
    expect(sessionLoad(unscored(TODAY))).toBeNull();
    expect(sessionLoad({ ...newSession(TODAY, 0), completed: true, durationMin: 90 })).toBeNull();
    expect(sessionLoad({ ...newSession(TODAY, 0), completed: true, rpe: 7 })).toBeNull();
  });

  it('is zero when the climber said zero, which is a different fact', () => {
    expect(sessionLoad({ ...newSession(TODAY, 0), completed: true, rpe: 0, durationMin: 0 })).toBe(0);
  });

  it('is RPE × hours when it has both', () => {
    expect(sessionLoad(scored(TODAY))).toBeCloseTo(10.5);
  });
});

describe('marking the days you trained', () => {
  it('no longer turns an honest message into a false one', () => {
    const marked = stateOf(log(unscored));
    expect(marked.acwr).toBeNull();
    expect(marked.zone).toBe('unknown');
    expect(marked.unknownBecause).toBe('unscored');
    expect(marked.unmeasuredDays).toBe(8);

    const tips = buildTips({ state: deriveClimberState(log(unscored), { today: TODAY }), sessions: log(unscored), today: TODAY });
    expect(tips.map((t) => t.id)).not.toContain('detraining');
  });

  it('says what is missing, and what filling it in gets back', () => {
    const sessions = log(unscored);
    const tips = buildTips({ state: deriveClimberState(sessions, { today: TODAY }), sessions, today: TODAY });
    const tip = tips.find((t) => t.id === 'unscored-effort');
    expect(tip, 'no tip explains why the ratio went quiet').toBeTruthy();
    expect(tip!.headline).toMatch(/8 days/);
    expect(tip!.action?.href).toBe('/calendar');
  });

  /**
   * The other half of the pair, unchanged. A climber who genuinely stopped
   * still gets told, because that branch reads dates rather than load.
   */
  it('leaves a real gap reading as a real gap', () => {
    const sessions = log(null);
    const tips = buildTips({ state: deriveClimberState(sessions, { today: TODAY }), sessions, today: TODAY });
    const tip = tips.find((t) => t.id === 'detraining');
    expect(tip?.headline).toMatch(/since you logged anything/);
  });

  /**
   * The tip is about scores, so it must not answer for the other reason the
   * ratio goes quiet — a climber three weeks in needs history, not RPE.
   */
  it('does not speak for a climber who is simply new', () => {
    const few = [0, 2, 4, 6].map((i) => scored(addDays(TODAY, -i)));
    const tips = buildTips({ state: deriveClimberState(few, { today: TODAY }), sessions: few, today: TODAY });
    expect(tips.map((t) => t.id)).not.toContain('unscored-effort');
  });

  /**
   * Including when they have left a couple blank. Ten days in, the ratio is
   * quiet for want of history and filling in two RPEs would not change that
   * — so telling them to is advice that does not work.
   */
  it('stays quiet on a new climber who has blanks as well', () => {
    // Seven sessions, so the "too early to mention it" guard is not what is
    // doing the work here — the reason is, and the reason is history.
    const sessions = [
      ...[0, 2, 4, 6].map((i) => scored(addDays(TODAY, -i))),
      ...[8, 9, 10].map((i) => unscored(addDays(TODAY, -i))),
    ];
    const state = deriveClimberState(sessions, { today: TODAY });
    expect(state.load.unmeasuredDays).toBeGreaterThan(0);
    expect(state.load.unknownBecause).toBe('history');
    const tips = buildTips({ state, sessions, today: TODAY });
    expect(tips.map((t) => t.id)).not.toContain('unscored-effort');
  });

  /**
   * And speaks to the climber in between, which is the case that made the
   * first version of this guard wrong. A month of history, three scored
   * days and five blank ones: the window is short of the six it needs, and
   * the five blanks are exactly what would supply them.
   */
  it('speaks when the blanks are what is standing in the way', () => {
    const sessions = [
      ...[25, 23, 21].map((i) => scored(addDays(TODAY, -i))),
      ...[8, 6, 4, 2, 0].map((i) => unscored(addDays(TODAY, -i))),
    ];
    const state = deriveClimberState(sessions, { today: TODAY });
    expect(state.load.zone).toBe('unknown');
    expect(state.load.unknownBecause, 'filling these in is what would answer it').toBe('unscored');
    const tips = buildTips({ state, sessions, today: TODAY });
    expect(tips.map((t) => t.id)).toContain('unscored-effort');
  });

  /**
   * And a drop the missing sessions cannot explain away is still called.
   * The guard is the zone, not the presence of an estimate — suppressing
   * every estimated reading would have hidden a real one.
   */
  it('still calls a drop that holds however the blanks went', () => {
    const sessions: Session[] = [];
    for (let i = 70; i > 9; i -= 2) sessions.push(scored(addDays(TODAY, -i)));
    sessions.push(unscored(addDays(TODAY, -8)));
    const state = deriveClimberState(sessions, { today: TODAY });
    expect(state.load.zone).toBe('detraining');
    const tips = buildTips({ state, sessions, today: TODAY });
    const tip = tips.find((t) => t.id === 'detraining');
    expect(tip?.headline).toBe('Training has dropped off');
    if (state.load.estimated) expect(tip!.body).toMatch(/about /);
  });

  it('leaves a fully scored climber exactly as they were', () => {
    const state = stateOf(log(scored));
    expect(state.estimated).toBe(false);
    expect(state.unmeasuredDays).toBe(0);
    expect(state.unknownBecause).toBeNull();
    expect(state.acwr).toBeCloseTo(1.14, 2);
    expect(state.zone).toBe('optimal');
  });
});

describe('the bracket', () => {
  /**
   * One blank session in a month does not cost the climber their number:
   * whether it was rest or a hard day, the ratio lands in the same band, so
   * the band is reported and the number is flagged as the middle of a range.
   */
  it('still answers when the missing sessions cannot change the band', () => {
    const sessions = log(scored);
    sessions[sessions.length - 1] = unscored(TODAY);
    const state = stateOf(sessions);
    expect(state.estimated).toBe(true);
    expect(state.unmeasuredDays).toBe(1);
    expect(state.zone).not.toBe('unknown');
    expect(state.acwr).not.toBeNull();
  });

  it('refuses when they could', () => {
    const state = stateOf(log(unscored));
    expect(state.zone).toBe('unknown');
    expect(state.acwr).toBeNull();
  });

  /**
   * The low end has to carry the *denominator's* missing days, or an
   * unscored stretch further back reads as a shrinking baseline and the
   * ratio climbs. This is the spike direction of the same error.
   */
  it('lifts the baseline by what the unscored days might have been', () => {
    // Scored fortnight either side of an unscored fortnight in the middle
    // of the chronic window: the recent weeks are measured, the ones they
    // are compared against are not.
    const sessions: Session[] = [];
    for (let i = 70; i > 27; i -= 2) sessions.push(scored(addDays(TODAY, -i)));
    for (let i = 27; i > 13; i -= 2) sessions.push(unscored(addDays(TODAY, -i)));
    for (let i = 13; i >= 0; i -= 2) sessions.push(scored(addDays(TODAY, -i)));
    const state = stateOf(sessions);
    expect(state.unmeasuredDays).toBeGreaterThan(0);
    // Counting those days at zero would make the baseline small and the
    // ratio large. The bracket's low end keeps it honest, so the app does
    // not call a steady month a spike.
    expect(state.zone).not.toBe('danger');
  });

  it('says the reason is the scores, not the history', () => {
    const all: Session[] = [];
    for (let i = 70; i >= 0; i -= 2) all.push(unscored(addDays(TODAY, -i)));
    expect(stateOf(all).unknownBecause).toBe('unscored');
  });

  it('still says the reason is history when that is the reason', () => {
    // Four scored sessions and nothing else: short of both span and density.
    const few = [0, 2, 4, 6].map((i) => scored(addDays(TODAY, -i)));
    const state = stateOf(few);
    expect(state.zone).toBe('unknown');
    expect(state.unknownBecause).toBe('history');
  });

  it('does not estimate from nothing', () => {
    // Every day unscored: there is no typical day to value them at, and no
    // baseline either. 'history' rather than a guess.
    const all: Session[] = [];
    for (let i = 70; i >= 0; i -= 2) all.push(unscored(addDays(TODAY, -i)));
    const state = stateOf(all);
    expect(state.acwr).toBeNull();
    expect(state.zone).toBe('unknown');
  });
});

describe('everywhere else that read a zero', () => {
  it('does not paint an unscored day as a rest day on the grid', () => {
    const grid = buildHeatGrid({ sessions: [unscored(TODAY)], to: TODAY });
    const day = dayFor(grid, TODAY);
    expect(day?.sessions).toBe(1);
    expect(day?.rested, 'an afternoon of training was labelled a rest day').toBe(false);
  });

  it('still paints a day the climber scored as zero', () => {
    const rested = { ...newSession(TODAY, 0), completed: true, rpe: 0, durationMin: 0 };
    const grid = buildHeatGrid({ sessions: [rested], to: TODAY });
    expect(dayFor(grid, TODAY)?.rested).toBe(true);
  });

  it('does not call a logged rest day unscored training', () => {
    // A rest day is a recovery checklist and no climbs — see `rest.ts`.
    const rest: Session = { ...newSession(TODAY, 0), completed: true, restChecklist: { slept: true } as never };
    const index = buildLoadIndex([rest]);
    expect(index.byDate.get(TODAY)?.unmeasured ?? false).toBe(false);
  });

  it('carries the unscored day into the index rather than dropping it', () => {
    const index = buildLoadIndex([unscored(TODAY)]);
    expect(index.byDate.get(TODAY)?.unmeasured).toBe(true);
    // And it is not counted as measured history, so a log made only of these
    // answers "not enough history" rather than claiming a baseline.
    expect(index.earliest).toBeNull();
  });

  it('reports the same reading through the series as through the state', () => {
    const sessions = log(unscored);
    const point = loadSeries(buildLoadIndex(sessions), [TODAY])[0]!;
    const state = stateOf(sessions);
    expect(point.zone).toBe(state.zone);
    expect(point.acwr).toBe(state.acwr);
    expect(point.estimated).toBe(state.estimated);
  });
});
