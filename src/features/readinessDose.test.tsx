// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, startOfWeek, today } from '@/engine/dates';
import type { CheckIn } from '@/engine/readiness';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';

/**
 * The check-in reaches the dose (PLAN.md M129).
 *
 * `readinessFor` has computed an RPE ceiling and a set of body-part flags
 * since M72, and both already reached the screen — the ceiling beside the
 * effort field, the flags on the lines that load them. What never reached it
 * was the prescription: a climber who said they had barely slept was shown
 * the same five sets as anyone, and the advice to "drop the hardest block"
 * sat above a card that had not moved.
 *
 * It stays a suggestion. These check that the program's numbers are still
 * there beside it — an app that quietly rewrote a prescription on the
 * strength of two questions would be worse than one that said nothing.
 */

const DATE = today();
const TEXT = () => document.body.textContent ?? '';

/** Iron Grip, `week` weeks in, with today's check-in already answered. */
async function checkedIn(checkIn: CheckIn | undefined, week = 2): Promise<void> {
  await reset();
  const program = getProgram('iron_grip')!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: 'fp',
    ...(checkIn ? { checkIn } : {}),
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: addDays(startOfWeek(DATE), -(week - 1) * 7) },
    plans: { [program.id]: { [dayOfWeek(DATE)]: 'fp' } },
    weekOverrides: {},
    adaptations: {},
    injuries: [],
  });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText("Today's prescription");
}

describe('a day the climber said was fine', () => {
  it('suggests nothing', async () => {
    await checkedIn({ fingers: 'good', sleep: 'good' });
    expect(screen.queryByText(/suggests less of it today/)).toBeNull();
    expect(TEXT()).not.toMatch(/today \d+ sets/);
  });

  it('suggests nothing when there was no check-in at all', async () => {
    await checkedIn(undefined);
    expect(screen.queryByText(/suggests less of it today/)).toBeNull();
  });
});

describe('a day the climber said was not', () => {
  it('says so once, naming the answers that said it', async () => {
    await checkedIn({ fingers: 'tender', sleep: 'good' });
    const note = screen.getAllByText(/suggests less of it today/);
    expect(note).toHaveLength(1);
    expect(note[0]!.textContent).toMatch(/Fingers tender/);
  });

  it('puts the lighter dose beside the one the program wrote', async () => {
    // Pull is three sets in The Anvil. The suggestion is two, and the three
    // is still on screen: this proposes and never writes.
    await checkedIn({ fingers: 'tender', sleep: 'good' });
    expect(TEXT()).toContain('3 sets · 8-10 · 2-3 min rest · today 2 sets');
  });

  it('goes deeper on a worse day', async () => {
    // Sore fingers on no sleep is two notches, so 3-5 lands on 2 rather
    // than 3.
    await checkedIn({ fingers: 'sore', sleep: 'none' });
    expect(TEXT()).toContain('3-5 sets · 6 hangs per set · 60-70% max added weight · 3 min rest · today 2 sets');
  });

  it('takes one notch where the day asks for one', async () => {
    await checkedIn({ fingers: 'tender', sleep: 'good' });
    expect(TEXT()).toContain('3-5 sets · 6 hangs per set · 60-70% max added weight · 3 min rest · today 3 sets');
  });
});

describe('the check-in and the program stack', () => {
  it('eases from the deload dose, not from the one the phase opened at', async () => {
    // Week 4 is a deload, so Pull is already down to two sets; there is no
    // second notch in it, and the app must not invent one.
    await checkedIn({ fingers: 'tender', sleep: 'good' }, 4);
    expect(TEXT()).toContain('2 sets · 8-10 · 2-3 min rest');
    expect(TEXT()).not.toContain('2 sets · 8-10 · 2-3 min rest · today');
  });

  it('still says nothing at all when no block has a notch left', async () => {
    // Every block of Iron Grip's week-4 deload is at two sets or fewer
    // except the finger protocol, which the program itself wrote down at
    // three — so one suggestion survives and the note is honest.
    await checkedIn({ fingers: 'tender', sleep: 'good' }, 4);
    expect(TEXT()).toContain('today 2 sets');
  });
});
