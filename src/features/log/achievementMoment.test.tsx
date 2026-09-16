// @vitest-environment jsdom
import { useEffect } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession, type Climb, type Session } from '@/db/sessions';
import { CLEAN_SHEET_CLIMBS } from '@/engine/achievements';
import { addDays, today } from '@/engine/dates';
import { useXp } from '@/store/game';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';

/**
 * The moment an achievement arrives (PLAN.md M229).
 *
 * Twenty-six of them existed from M32 with two readers, both a list: a
 * climber could earn every one and never once be told. This is M26's moment
 * extended, so it is checked the same way — against the page rather than the
 * engine, because "the engine is right about the shape and the card never
 * mentions it" is precisely the state this milestone found.
 *
 * `clean-sheet` is the fixture's achievement because it is a shape **one
 * session** makes: five climbs with nothing failed. A week-shaped one cannot
 * be built honestly against a `today()` that moves — the first draft tried,
 * and on a Wednesday there are not four earlier days in the week to put
 * sessions on.
 *
 * **Seven quiet days behind it, and the number is not arbitrary.** A level
 * or a rank crossed by today's session leads the card ahead of anything
 * here, so the history has to land between two boundaries. Three days ranks
 * up, five levels up, eleven ranks up; seven crosses neither. XP is decided
 * by what is logged rather than by when, so this stays true.
 */

const TODAY = today();
const QUIET_DAYS = 7;

function sends(n: number): Climb[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `s${i}`,
    grade: 'V3',
    scale: 'V' as const,
    count: 1,
    result: 'send' as const,
  }));
}

/** Two climbs with one of them unfinished: not a clean sheet. */
const MIXED: Climb[] = [
  { id: 'a', grade: 'V3', scale: 'V', count: 1, result: 'attempt' },
  { id: 'b', grade: 'V3', scale: 'V', count: 1, result: 'send' },
];

function day(date: string, body: Partial<Session> = {}): Session {
  return {
    ...newSession(date, 0),
    completed: true,
    rewarded: true,
    rpe: 6,
    durationMin: 60,
    warmup: true,
    climbs: MIXED,
    ...body,
  };
}

/**
 * Force the XP derivation before rendering the day.
 *
 * `RewardCard` returns null until `xp.bySession` holds this session, so a
 * test that renders straight after hydrating sees the editor and asserts
 * against it. `rewardCard.test.tsx` has done this since M26.
 */
function readXp(id: string): Promise<void> {
  return new Promise((resolve) => {
    function Probe() {
      const xp = useXp();
      useEffect(() => {
        if (xp.bySession[id]) resolve();
      }, [xp]);
      return null;
    }
    renderAt('/', <Probe />);
  });
}

async function openToday(session: Session): Promise<void> {
  await putSession(session);
  await hydrate();
  await readXp(session.id);
  renderAt('/', <DayBody date={TODAY} />);
}

beforeEach(async () => {
  await reset();
  for (let i = 0; i < QUIET_DAYS; i++) await putSession(day(addDays(TODAY, -(i + 2) * 3)));
});

describe('the reward card names what the session earned', () => {
  it('leads with the achievement when nothing else did', async () => {
    await openToday(day(TODAY, { rewarded: false, climbs: sends(CLEAN_SHEET_CLIMBS) }));
    expect(await screen.findByText('Clean Sheet')).toBeTruthy();
    // The eyebrow above it, which is what makes it read as an achievement
    // rather than as another line on a card about XP.
    expect(screen.getByText('Achievement')).toBeTruthy();
    expect(screen.getByText(/no failed attempt in it/)).toBeTruthy();
    expect(screen.queryByText('Session logged.')).toBeNull();
  });

  it('offers the card for it, which had no way of being reached', async () => {
    await openToday(day(TODAY, { rewarded: false, climbs: sends(CLEAN_SHEET_CLIMBS) }));
    await screen.findByText('Clean Sheet');
    expect(screen.getByRole('button', { name: /Share this/ })).toBeTruthy();
  });

  it('lists it under the headline when a milestone leads', async () => {
    // Three quiet days rather than seven: today's session crosses a rank,
    // which leads the card. The achievement goes under it rather than being
    // dropped — and the rank is the reason `QUIET_DAYS` is what it is.
    await reset();
    for (let i = 0; i < 3; i++) await putSession(day(addDays(TODAY, -(i + 2) * 3)));
    await openToday(day(TODAY, { rewarded: false, climbs: sends(CLEAN_SHEET_CLIMBS) }));
    expect(await screen.findByText('New rank')).toBeTruthy();
    expect(screen.getByText('Clean Sheet')).toBeTruthy();
    expect(screen.getByText(/no failed attempt in it/)).toBeTruthy();
  });

  it('says nothing about one that was already held', async () => {
    // Why this is a comparison rather than "what do I hold now": an earlier
    // clean sheet means today's session did not earn it.
    await putSession(day(addDays(TODAY, -3), { climbs: sends(CLEAN_SHEET_CLIMBS) }));
    await openToday(day(TODAY, { rewarded: false, climbs: sends(CLEAN_SHEET_CLIMBS) }));
    await screen.findByRole('button', { name: 'How it was counted' });
    expect(screen.queryByText('Clean Sheet')).toBeNull();
    expect(screen.queryByText('Achievement')).toBeNull();
  });

  it('says nothing at all on a day that earned none', async () => {
    await openToday(day(TODAY, { rewarded: false }));
    await screen.findByText('Session logged.');
    expect(screen.queryByText('Achievement')).toBeNull();
    expect(screen.queryByText('Clean Sheet')).toBeNull();
  });
});
