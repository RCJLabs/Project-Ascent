// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { newSession, type Session } from '@/db/sessions';
import { addDays, shortLabel, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { hydrate, renderAt, reset } from '@/test/render';
import { TrainingState } from './TrainingState';

/**
 * The seven-day reset on a week that has already run light (PLAN.md M342).
 *
 * Its first two days are rest, and this week has done that, so the card says
 * they are done and dates the rest of the reset from today — rather than
 * putting two more rest days in front of a climber the coach is telling to
 * train.
 */

const TODAY = today();
let n = 0;

/** Twelve flat weeks, three sessions each, the last week's third still to come. */
function flat(extra: string[] = []): Session[] {
  const dates: string[] = [...extra];
  for (let w = 12; w >= 1; w--) for (const off of [0, 3, 5]) dates.push(addDays(TODAY, -(w * 7) + off));
  return dates.map((date) =>
    newSession(date, n++, {
      completed: true,
      rpe: 7,
      durationMin: 75,
      climbs: [
        { id: `a${n}`, grade: 'V3', scale: 'V', count: 4, result: 'send' },
        { id: `b${n}`, grade: 'V5', scale: 'V', count: 2, result: 'send' },
        { id: `c${n}`, grade: 'V6', scale: 'V', count: 5, result: 'attempt' },
      ],
    }) as Session,
  );
}

async function open(sessions: Session[]): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/progress', <TrainingState state={deriveClimberState(sessions)} sessions={sessions} program={undefined} scale="V" />);
  fireEvent.click(await screen.findByText('The seven-day reset'));
}

describe('the reset, on a light week', () => {
  it('says the rest is done and starts the half-volume days today', async () => {
    const sessions = flat();
    expect(deriveClimberState(sessions).load.zone, 'the fixture is not a light week').toBe('detraining');
    await open(sessions);
    expect(screen.getByText('Done already')).toBeTruthy();
    expect(screen.getByText('done')).toBeTruthy();
    expect(screen.getByText(`from ${shortLabel(TODAY)}`)).toBeTruthy();
    expect(screen.getByText(/This week has already run light/)).toBeTruthy();
  });

  it('starts with rest, today, on an ordinary week', async () => {
    await open(flat([TODAY]));
    expect(screen.getByText('Nothing')).toBeTruthy();
    expect(screen.queryByText('done')).toBeNull();
    expect(screen.getByText(`from ${shortLabel(TODAY)}`)).toBeTruthy();
    expect(screen.getByText(`from ${shortLabel(addDays(TODAY, 2))}`)).toBeTruthy();
  });
});
