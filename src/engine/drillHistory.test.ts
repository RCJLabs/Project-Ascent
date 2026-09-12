import { describe, expect, it } from 'vitest';
import { newSession, type Session } from '@/db/sessions';
import type { DrillId, ProgramId } from '@/content/types';
import { describeRecord, drillHistory, prescribedBy, recordFor } from './drillHistory';

/**
 * Your own history with a drill (PLAN.md M107).
 *
 * `drillId` and `drillDone` have been written since the beginning and read
 * by the challenges, the plateau diagnosis and the derived category counts
 * — none of which ever says "you have been given this one six times and
 * done it twice".
 */

const TODAY = '2026-03-01';

const day = (date: string, drillId?: string, drillDone?: boolean, patch: Partial<Session> = {}): Session =>
  newSession(date, 0, {
    completed: true,
    ...(drillId ? { drillId } : {}),
    ...(drillDone === undefined ? {} : { drillDone }),
    ...patch,
  });

const read = (sessions: Session[]) => drillHistory({ sessions, today: TODAY });
const of = (sessions: Session[], id: string) => recordFor(read(sessions), id as DrillId);

describe('what came up and what got done', () => {
  it('counts the times it was given, not only the times it was done', () => {
    const row = of(
      [
        day('2026-02-01', 'sticky_feet', true),
        day('2026-02-08', 'sticky_feet', false),
        day('2026-02-15', 'sticky_feet', true),
      ],
      'sticky_feet',
    )!;
    expect([row.given, row.done]).toEqual([3, 2]);
  });

  // A drill you were given and skipped is the interesting row.
  it('counts a drill that was given and never ticked', () => {
    const row = of([day('2026-02-01', 'flagging', false)], 'flagging')!;
    expect([row.given, row.done]).toEqual([1, 0]);
  });

  it('treats a drill with no answer as given and not done', () => {
    const row = of([day('2026-02-01', 'flagging')], 'flagging')!;
    expect([row.given, row.done]).toEqual([1, 0]);
  });

  it('ignores a session that was never finished', () => {
    expect(of([day('2026-02-01', 'flagging', true, { completed: false })], 'flagging')).toBeNull();
  });

  it('keeps drills apart', () => {
    const history = read([day('2026-02-01', 'flagging', true), day('2026-02-02', 'sticky_feet', false)]);
    expect(recordFor(history, 'flagging' as DrillId)!.done).toBe(1);
    expect(recordFor(history, 'sticky_feet' as DrillId)!.done).toBe(0);
  });

  it('says nothing about a drill never prescribed', () => {
    expect(of([day('2026-02-01', 'flagging', true)], 'sticky_feet')).toBeNull();
  });

  it('takes the newest day it was actually done', () => {
    const row = of(
      [
        day('2026-02-01', 'flagging', true),
        day('2026-02-20', 'flagging', true),
        day('2026-02-25', 'flagging', false),
      ],
      'flagging',
    )!;
    expect(row.lastDone).toBe('2026-02-20');
    expect(row.daysSince).toBe(9);
  });

  it('has no last day for a drill never done', () => {
    const row = of([day('2026-02-01', 'flagging', false)], 'flagging')!;
    expect(row.lastDone).toBeNull();
    expect(row.daysSince).toBeNull();
  });
});

describe('saying it', () => {
  const say = (sessions: Session[], id: string) => describeRecord(of(sessions, id));

  it('says nothing about a drill the climber has never met', () => {
    expect(say([], 'flagging')).toBeNull();
  });

  it('gives the count over what it could have been', () => {
    expect(say([day('2026-02-01', 'flagging', true), day('2026-02-08', 'flagging', false)], 'flagging')).toMatch(
      /^1 of 2 times it came up/,
    );
  });

  it('counts one occasion in the singular', () => {
    expect(say([day('2026-02-01', 'flagging', true)], 'flagging')).toMatch(/1 of 1 time it came up/);
  });

  it('says so when it has never been done', () => {
    expect(say([day('2026-02-01', 'flagging', false)], 'flagging')).toMatch(/Never done, so far/);
  });

  it('reads the recent days in words', () => {
    expect(say([day(TODAY, 'flagging', true)], 'flagging')).toMatch(/Last done today/);
    expect(say([day('2026-02-28', 'flagging', true)], 'flagging')).toMatch(/Last done yesterday/);
    expect(say([day('2026-02-01', 'flagging', true)], 'flagging')).toMatch(/Last done 28 days ago/);
  });
});

describe('which programs prescribe it', () => {
  it('names them', () => {
    expect(prescribedBy(['base_camp'] as ProgramId[])).toEqual(['Base Camp']);
  });

  it('names each one once', () => {
    const names = prescribedBy(['base_camp', 'base_camp', 'iron_grip'] as ProgramId[]);
    expect(names).toEqual(['Base Camp', 'Iron Grip']);
  });

  // A drill from a program that is no longer shipped has provenance the
  // catalogue cannot resolve, and a blank row reads better than 'undefined'.
  it('leaves out a program the catalogue does not have', () => {
    expect(prescribedBy(['base_camp', 'gone_program'] as ProgramId[])).toEqual(['Base Camp']);
  });
});
