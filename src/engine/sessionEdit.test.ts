import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import {
  canMerge,
  describeSession,
  isRest,
  loadOf,
  mergeSessions,
  moveSession,
} from './sessionEdit';

function session(patch: Partial<Session> = {}): Session {
  return newSession('2026-03-04', 0, {
    completed: true, rewarded: true, mode: 'indoor', rpe: 7, durationMin: 60, warmup: true,
    climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    startedAt: '2026-03-04T18:00:00.000Z', endedAt: '2026-03-04T19:00:00.000Z',
    ...patch,
  });
}
const rest = (patch: Partial<Session> = {}) =>
  session({ climbs: [], restChecklist: { hydration: true, mobility: false, zone1: false, sleep: true }, ...patch });

describe('moving a session to another day', () => {
  it('takes the new date and id', () => {
    const moved = moveSession(session(), '2026-03-06', 0);
    expect(moved.date).toBe('2026-03-06');
    expect(moved.id).toBe('2026-03-06#0');
  });

  it('respects the index so it does not collide with what is there', () => {
    expect(moveSession(session(), '2026-03-06', 2).id).toBe('2026-03-06#2');
  });

  // Wall-clock times were true on the day they were recorded. On another
  // day they are a statement about something that did not happen.
  it('drops the clock but keeps how long you trained', () => {
    const moved = moveSession(session(), '2026-03-06', 0);
    expect(moved.startedAt).toBeUndefined();
    expect(moved.endedAt).toBeUndefined();
    expect(moved.durationMin).toBe(60);
  });

  it('keeps everything else, including what was logged', () => {
    const moved = moveSession(session({ notes: 'Good day' }), '2026-03-06', 0);
    expect(moved.climbs).toHaveLength(1);
    expect(moved.notes).toBe('Good day');
    expect(moved.rpe).toBe(7);
    expect(moved.completed).toBe(true);
  });

  it('does not mutate the original', () => {
    const original = session();
    moveSession(original, '2026-03-06', 0);
    expect(original.date).toBe('2026-03-04');
    expect(original.startedAt).toBeDefined();
  });
});

describe('whether two sessions can be merged', () => {
  it('accepts two training sessions on the same day', () => {
    expect(canMerge(session(), session({ id: '2026-03-04#1' })).ok).toBe(true);
  });

  it('refuses a session and itself', () => {
    expect(canMerge(session(), session()).ok).toBe(false);
  });

  it('refuses across days', () => {
    expect(canMerge(session(), session({ id: '2026-03-05#0', date: '2026-03-05' })).ok).toBe(false);
  });

  // They are different claims about a day, not two halves of one.
  it('refuses to fuse a rest day with training', () => {
    const check = canMerge(session(), rest({ id: '2026-03-04#1' }));
    expect(check.ok).toBe(false);
    expect(check.reason).toMatch(/rest day/i);
  });

  it('allows two rest days, which is just a duplicate', () => {
    expect(canMerge(rest(), rest({ id: '2026-03-04#1' })).ok).toBe(true);
  });
});

describe('merging', () => {
  const a = session({ id: '2026-03-04#0', rpe: 8, durationMin: 60, notes: 'Morning felt sharp' });
  const b = session({
    id: '2026-03-04#1', rpe: 4, durationMin: 60, warmup: false, notes: 'Evening was flat',
    climbs: [{ id: 'c2', grade: 'V2', scale: 'V', count: 8, result: 'send' }],
    exercises: [{ name: 'Pull-Ups' }],
  });

  it('keeps the first session’s identity', () => {
    expect(mergeSessions(a, b).id).toBe('2026-03-04#0');
  });

  it('gathers the climbs from both', () => {
    expect(mergeSessions(a, b).climbs.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('sums duration', () => {
    expect(mergeSessions(a, b).durationMin).toBe(120);
  });

  // The property that matters: load is RPE × hours, so a duration-weighted
  // mean keeps the merged entry worth exactly what the two were. A merge
  // that changed training load would quietly rewrite the ACWR behind it.
  it('preserves training load exactly', () => {
    const merged = mergeSessions(a, b);
    expect(loadOf(merged)).toBeCloseTo(loadOf(a) + loadOf(b), 6);
  });

  it('falls back to a plain mean when nothing has a duration', () => {
    const x = session({ rpe: 8, durationMin: undefined });
    const y = session({ id: '2026-03-04#1', rpe: 4, durationMin: undefined });
    expect(mergeSessions(x, y).rpe).toBe(6);
  });

  it('takes the one RPE there is when only one was given', () => {
    const y = session({ id: '2026-03-04#1', rpe: undefined });
    expect(mergeSessions(a, y).rpe).toBe(8);
  });

  it('keeps a warmup if either had one', () => {
    expect(mergeSessions(a, b).warmup).toBe(true);
    expect(mergeSessions(b, a).warmup).toBe(true);
  });

  it('joins notes rather than losing one', () => {
    expect(mergeSessions(a, b).notes).toBe('Morning felt sharp\n\nEvening was flat');
  });

  it('unions the exercises without duplicating', () => {
    const x = session({ exercises: [{ name: 'Pull-Ups' }, { name: 'Max Hangs' }] });
    expect(mergeSessions(x, b).exercises?.map((e) => e.name)).toEqual(['Pull-Ups', 'Max Hangs']);
  });

  // Merging the two halves of a session logged twice must not throw away the
  // half that was written down (PLAN.md M98).
  it('keeps the numbers when one side is only a tick', () => {
    const ticked = session({ exercises: [{ name: 'Max Hangs' }] });
    const logged = session({ id: '2026-03-04#1', exercises: [{ name: 'Max Hangs', sets: 5, load: 20 }] });
    expect(mergeSessions(ticked, logged).exercises).toEqual([{ name: 'Max Hangs', sets: 5, load: 20 }]);
  });

  it('keeps the kept session\'s numbers when both sides have them', () => {
    const a2 = session({ exercises: [{ name: 'Max Hangs', load: 20 }] });
    const b2 = session({ id: '2026-03-04#1', exercises: [{ name: 'Max Hangs', load: 30 }] });
    expect(mergeSessions(a2, b2).exercises).toEqual([{ name: 'Max Hangs', load: 20 }]);
  });

  it('counts the day as outdoors if either half was', () => {
    expect(mergeSessions(a, session({ id: '2026-03-04#1', mode: 'outdoor' })).mode).toBe('outdoor');
  });

  it('drops the clock, like any other correction', () => {
    const merged = mergeSessions(a, b);
    expect(merged.startedAt).toBeUndefined();
    expect(merged.endedAt).toBeUndefined();
  });

  // The reward line-up changed, so the climber must see the new total.
  it('clears the reward acknowledgement', () => {
    expect(mergeSessions(a, b).rewarded).toBe(false);
  });

  it('stays incomplete if either half was', () => {
    expect(mergeSessions(a, session({ id: '2026-03-04#1', completed: false })).completed).toBe(false);
  });

  it('ors a rest checklist rather than picking one', () => {
    const merged = mergeSessions(rest(), rest({ id: '2026-03-04#1', restChecklist: { hydration: false, mobility: true, zone1: false, sleep: false } }));
    expect(merged.restChecklist).toEqual({ hydration: true, mobility: true, zone1: false, sleep: true });
  });

  it('does not mutate either input', () => {
    const before = JSON.stringify([a, b]);
    mergeSessions(a, b);
    expect(JSON.stringify([a, b])).toBe(before);
  });
});

describe('describing a session in a list', () => {
  it('names a rest day', () => {
    expect(describeSession(rest())).toBe('Rest day');
    expect(isRest(rest())).toBe(true);
  });

  it('leads with the session type and counts the sends', () => {
    expect(describeSession(session(), 'Finger Power')).toBe('Finger Power · 3 sends · 60 min');
  });

  it('says something for an empty session', () => {
    expect(describeSession(session({ climbs: [], durationMin: undefined }))).toBe('Session');
  });

  it('does not pluralise one send', () => {
    const one = session({ climbs: [{ id: 'c', grade: 'V4', scale: 'V', count: 1, result: 'send' }] });
    expect(describeSession(one)).toContain('1 send ·');
  });
});
