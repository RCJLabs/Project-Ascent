// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { newSession, putSession, type Climb, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';

/**
 * "Same as last time" means last time *this* session happened (PLAN.md M335).
 *
 * M21 built it for the climber who repeats a program's sessions — the same
 * four grades most weeks — and took whichever session last had climbs. So
 * on Iron Grip's finger day, which has none, it offered Saturday's eleven
 * boulders. Until now nothing held which session it read: the only test
 * checked that the logger mentions it.
 */

const TODAY = today();
const climb = (grade: string, count: number, name?: string): Climb =>
  ({ id: `${grade}-${count}`, grade, scale: 'V', count, result: 'send', ...(name ? { name } : {}) }) as Climb;

function done(date: string, patch: Partial<Session>): Session {
  return { ...newSession(date, 0, { completed: true }), ...patch } as Session;
}

/** Seed the log, then open today's session in the logger. */
async function open(today: Partial<Session>, before: Session[]): Promise<void> {
  await reset();
  for (const session of before) await putSession(session);
  await putSession({ ...newSession(TODAY, 0, { completed: false }), ...today } as Session);
  await hydrate();
  useSettings.setState({ logView: 'full' });
  renderAt(`/log/${TODAY}`, <DayBody date={TODAY} />);
  await screen.findByText('Climbs');
}

const offer = () => screen.queryByRole('button', { name: 'Same as last time' });

const SATURDAY = done(addDays(TODAY, -3), {
  programId: 'iron_grip',
  sessionTypeId: 'perf',
  climbs: [climb('V4', 5), climb('V5', 4), climb('V6', 2, 'Brad Pit')],
});
const LAST_FINGER_DAY = done(addDays(TODAY, -2), { programId: 'iron_grip', sessionTypeId: 'fp', climbs: [] });

describe('same as last time', () => {
  it('offers a finger day nothing, when the last finger day climbed nothing', async () => {
    await open({ programId: 'iron_grip', sessionTypeId: 'fp' }, [SATURDAY, LAST_FINGER_DAY]);
    expect(screen.getByText('Nothing logged yet.')).toBeTruthy();
    expect(offer()).toBeNull();
  });

  it('offers a climbing day the last climbing day, past the finger day since', async () => {
    await open({ programId: 'iron_grip', sessionTypeId: 'perf' }, [SATURDAY, LAST_FINGER_DAY]);
    expect(screen.getByText(/Last time \(.+\) you did 11 climbs\./)).toBeTruthy();
    fireEvent.click(offer()!);
    await waitFor(() => {
      const logged = useSessions.getState().byDate[TODAY]![0]!.climbs;
      expect(logged.map((c) => `${c.grade}×${c.count}`)).toEqual(['V4×5', 'V5×4', 'V6×2']);
      // A named climb is a piece of rock, and copying it would claim a send.
      expect(logged.every((c) => c.name === undefined)).toBe(true);
    });
  });

  it('does not take the same session from another program', async () => {
    const other = { ...SATURDAY, id: `${SATURDAY.date}#1`, programId: 'the_long_game' };
    await open({ programId: 'iron_grip', sessionTypeId: 'perf' }, [other]);
    expect(offer()).toBeNull();
  });

  it('takes the last session that climbed, for a free session with no type', async () => {
    await open({}, [SATURDAY, LAST_FINGER_DAY]);
    expect(screen.getByText(/you did 11 climbs/)).toBeTruthy();
  });

  it('takes the latest that climbed, past one of the same kind that logged none', async () => {
    const twoWeeks = done(addDays(TODAY, -15), { programId: 'iron_grip', sessionTypeId: 'perf', climbs: [climb('V2', 8)] });
    const lastWeek = done(addDays(TODAY, -8), { programId: 'iron_grip', sessionTypeId: 'perf', climbs: [climb('V3', 6)] });
    const empty = done(addDays(TODAY, -1), { programId: 'iron_grip', sessionTypeId: 'perf', climbs: [] });
    await open({ programId: 'iron_grip', sessionTypeId: 'perf' }, [twoWeeks, lastWeek, empty]);
    expect(screen.getByText(/you did 6 climbs/)).toBeTruthy();
  });

  it('reads neither a session still open nor one after this day', async () => {
    const stillOpen = { ...SATURDAY, completed: false };
    const later = done(addDays(TODAY, 2), { programId: 'iron_grip', sessionTypeId: 'perf', climbs: [climb('V2', 9)] });
    await open({ programId: 'iron_grip', sessionTypeId: 'perf' }, [stillOpen, later]);
    expect(offer()).toBeNull();
  });
});
