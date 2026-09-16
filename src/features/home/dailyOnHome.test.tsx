// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newSession, putSession, type Session } from '@/db/sessions';
import { dailyChallenge } from '@/engine/challenges';
import { addDays, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { useGame } from '@/store/game';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from '@/features/home/HomePage';

/**
 * Today's task, on the screen the day starts on (PLAN.md M231).
 *
 * M117 moved the board off Home and M230 was withdrawn for walking into
 * that decision without reading it. The decision was then reversed for the
 * daily and only for the daily — so these check the thing itself, and
 * `gamePage.test.tsx` checks that the exception stayed one card wide.
 */

const TODAY = today();

function day(date: string, body: Partial<Session> = {}): Session {
  return {
    ...newSession(date, 0),
    completed: true,
    rewarded: true,
    rpe: 6,
    durationMin: 60,
    warmup: true,
    climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    ...body,
  };
}

/** The daily the board generates for today, from the same engine. */
function todaysDaily(sessions: Session[]) {
  return dailyChallenge(sessions, deriveClimberState(sessions), TODAY);
}

beforeEach(async () => {
  await reset();
});

describe('the daily on Home', () => {
  it('names the task and what it takes', async () => {
    const sessions = [day(addDays(TODAY, -6)), day(addDays(TODAY, -3))];
    for (const s of sessions) await putSession(s);
    await hydrate();
    renderAt('/', <HomePage />);

    const daily = todaysDaily(sessions);
    expect(await screen.findByText(daily.title)).toBeTruthy();
    // The sentence matters as much as the title: it is the one thing on the
    // board that says what the task actually asks for.
    expect(screen.getByText(daily.detail)).toBeTruthy();
  });

  it('shows the progress the log has already made', async () => {
    // A warm session logged today moves whichever daily asks for one, so the
    // card cannot be reading a fixed zero.
    const sessions = [day(addDays(TODAY, -3)), day(TODAY, { notes: 'felt good' })];
    for (const s of sessions) await putSession(s);
    await hydrate();
    renderAt('/', <HomePage />);

    const daily = todaysDaily(sessions);
    expect(daily.progress).toBeGreaterThan(0);
    expect(await screen.findByText(`${daily.progress} / ${daily.target} ${daily.unit}`)).toBeTruthy();
  });

  it('says how much is waiting, and offers no way to take it', async () => {
    /**
     * Home has never paid anything. The count is the state worth acting on;
     * the button would make the first thing a climber sees a thing to press,
     * and a claim writes to the ledger.
     */
    const sessions = [day(addDays(TODAY, -3)), day(TODAY, { notes: 'felt good' })];
    for (const s of sessions) await putSession(s);
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByText(todaysDaily(sessions).title);
    expect(screen.getByText(/ready to claim/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Claim/ })).toBeNull();
  });

  /**
   * The claimed state, which is the half a card that only counts what is
   * open would get wrong in the quietest way.
   *
   * The ledger lives in the game store, and until M231 nothing on Home ever
   * loaded it. An unloaded ledger does not read as missing — it reads as
   * *nothing claimed*, so a task taken this morning would sit here all day
   * looking untouched. `useBoard` loads it now; this is what says so.
   */
  it('knows when today\u2019s task has already been taken', async () => {
    const sessions = [day(addDays(TODAY, -3)), day(TODAY, { notes: 'felt good' })];
    for (const s of sessions) await putSession(s);
    await hydrate();
    const daily = todaysDaily(sessions);
    expect(daily.done, 'the fixture has to finish the task before it can claim it').toBe(true);
    await useGame.getState().claim(daily);
    // Back to an unloaded store, the way Home finds it: the card has to
    // fetch the ledger itself, not inherit it from the claim above.
    useGame.setState({ hydrated: false, ledger: [] });

    renderAt('/', <HomePage />);
    expect(await screen.findByText('Claimed')).toBeTruthy();
    expect(screen.queryByText(/ready to claim/), 'a claimed task is not still waiting').toBeNull();
  });

  /**
   * The bar, guarded where the guard can actually bite.
   *
   * It fills by `progress / target`, and every rung of the ladder asks for a
   * single thing — so today the fraction is nought or one, and a card that
   * filled from the raw count would look identical. A mutation battery says
   * so: that swap survives everything in the suite, because on this content
   * it is not a change.
   *
   * So the guard goes on the fact the equivalence rests on. The day a daily
   * asks for two of something, this fires — and that is the day the bar
   * needs a test of its own rather than this note.
   */
  it('has no daily that asks for more than one of anything', () => {
    const tiers = [0, 20, 60].map((n) =>
      deriveClimberState(
        Array.from({ length: n }, (_, i) => day(addDays(TODAY, -(i + 1)))),
      ),
    );
    const targets = new Set<number>();
    // A year, because the rung is picked by hashing the date: one day proves
    // nothing about the other three hundred and sixty-four.
    for (const state of tiers) {
      for (let d = 0; d < 365; d++) {
        targets.add(dailyChallenge([], state, addDays(TODAY, d)).target);
      }
    }
    expect([...targets]).toEqual([1]);
  });

  /**
   * Day one, which is the case the card's lack of a hydration gate rests on:
   * with nothing logged there is still a task, at zero, and zero is what an
   * unlogged day has. A card that read wrong here would be the one every
   * new install sees first.
   */
  it('has something to ask of a climber who has logged nothing', async () => {
    await hydrate();
    renderAt('/', <HomePage />);

    const daily = todaysDaily([]);
    expect(await screen.findByText(daily.title)).toBeTruthy();
    expect(screen.getByText(`0 / ${daily.target} ${daily.unit}`)).toBeTruthy();
    expect(screen.queryByText(/ready to claim/), 'nothing is owed on day one').toBeNull();
  });
});
