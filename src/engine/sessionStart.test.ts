import { describe, expect, it } from 'vitest';
import { restStart, trainingStart } from './sessionStart';

/**
 * One writer for a started session (PLAN.md M324).
 *
 * `PreSession`'s buttons and the sample climber both go through this, so
 * what it stamps is what both of them carry — which is the point, and the
 * reason each rule is held here rather than at either caller.
 */

const perfDay = { sessionType: {}, drill: { id: 'limit_boulders_on_the_crimps' }, isDeload: false };
const freeDay = { isDeload: false };

describe('a training session', () => {
  it('stamps the block, the type and the track it was started under', () => {
    const patch = trainingStart({ programId: 'iron_grip', sessionTypeId: 'perf', trackId: 'no_board', day: perfDay });
    expect(patch).toMatchObject({ programId: 'iron_grip', sessionTypeId: 'perf', trackId: 'no_board' });
  });

  it('runs a clock only when the caller says one is running', () => {
    expect(trainingStart({ day: perfDay }).startedAt).toBeUndefined();
    expect(trainingStart({ day: perfDay, startedAt: '2026-09-22T17:45:00.000Z' }).startedAt).toBe('2026-09-22T17:45:00.000Z');
  });

  it('is planned when the plan put a session on the date, whatever was started', () => {
    expect(trainingStart({ day: perfDay }).planned).toBe(true);
    // A session moved to a free day carries its type and is not planned:
    // the climber chose the day, and that is the difference the field holds.
    expect(trainingStart({ sessionTypeId: 'fp', day: freeDay }).planned).toBe(false);
    expect(trainingStart({}).planned).toBe(false);
  });

  it('takes the plan’s drill, and the rest day’s only on a day without one', () => {
    expect(trainingStart({ day: perfDay, restDrill: { id: 'off_skin_repair' } }).drillId).toBe('limit_boulders_on_the_crimps');
    expect(trainingStart({ day: freeDay, restDrill: { id: 'off_skin_repair' } }).drillId).toBe('off_skin_repair');
    expect(trainingStart({ day: freeDay }).drillId).toBeUndefined();
  });

  it('marks a deload week, and only a deload week', () => {
    expect(trainingStart({ day: { ...perfDay, isDeload: true } }).deload).toBe(true);
    expect(trainingStart({ day: perfDay }).deload).toBeUndefined();
  });

  it('leaves the mode to `newSession`', () => {
    // M180: the session type's own declaration decides where it happened.
    expect('mode' in trainingStart({ day: perfDay })).toBe(false);
  });
});

describe('a rest day', () => {
  it('is an empty checklist, unplanned, under the block and track', () => {
    const patch = restStart({ programId: 'iron_grip', trackId: 'no_board', restDrill: { id: 'off_skin_repair' } });
    expect(patch.planned).toBe(false);
    expect(patch.drillId).toBe('off_skin_repair');
    expect(patch.trackId).toBe('no_board');
    expect(Object.values(patch.restChecklist ?? {}).every((v) => v === false)).toBe(true);
  });
});
