// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, fromKey, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useSettings } from '@/store/settings';
import { DayBody } from '@/features/log/LogPage';

/**
 * Fixing the day a session landed on (PLAN.md M316).
 *
 * M298a's eighth entry: *"Correcting the day a session landed on is behind
 * two folds. Logging Saturday's session on Sunday morning is the most
 * common mistake there is, and the way to fix it is three taps into a
 * screen you have to know exists."*
 *
 * Six steps, in fact, from the quick view every climber starts in: open the
 * session, open the fold, scroll past every card the logger has, tap
 * *"Logged on the wrong day?"*, work a date picker, press Move. The engine
 * behind it — `move`, `merge`, `canMerge` — was tested from the first;
 * nothing had ever rendered the card, which is how its position went
 * unexamined for two hundred milestones.
 */

const DATE = today();
const YESTERDAY = addDays(DATE, -1);
const weekdayOf = (date: string) =>
  fromKey(date).toLocaleDateString(undefined, { weekday: 'long' });

async function logged(): Promise<void> {
  await reset();
  await putSession({ ...newSession(DATE, 0, { completed: true }) } as never);
  await hydrate();
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText(/wrong day/i);
}

describe('the way out of a session logged on the wrong day', () => {
  it('is offered without opening the fold', async () => {
    // The view every climber starts in: `logView` defaults to 'quick'.
    expect(useSettings.getState().logView).toBe('quick');
    await logged();
    expect(screen.getByText('Logged on the wrong day?')).toBeTruthy();
  });

  it('is offered with the fold open as well', async () => {
    useSettings.setState({ logView: 'full' });
    await logged();
    expect(screen.getByText('Logged on the wrong day?')).toBeTruthy();
    useSettings.setState({ logView: 'quick' });
  });

  it('opens the card rather than taking up room until it is wanted', async () => {
    await logged();
    expect(screen.queryByText('Correct this session')).toBeNull();
    fireEvent.click(screen.getByText('Logged on the wrong day?'));
    expect(screen.getByText('Correct this session')).toBeTruthy();
  });

  /**
   * The day before, named, in one tap.
   *
   * *"Logged on the wrong day"* is nearly always *"this was last night"*,
   * and the date input needs three interactions with a picker to say so.
   */
  it('moves it to the day before in one tap', async () => {
    await logged();
    fireEvent.click(screen.getByText('Logged on the wrong day?'));
    fireEvent.click(screen.getByText(weekdayOf(YESTERDAY)));
    await waitFor(async () => {
      expect(await getSession(`${YESTERDAY}#0`)).toBeTruthy();
    });
    expect(await getSession(`${DATE}#0`)).toBeUndefined();
  });

  /**
   * Named, not "Yesterday": the card is reached from any day in the log,
   * and a session three weeks old would move to the day before *it* while
   * the button claimed otherwise.
   */
  it('names the day it would move to, which is not always yesterday', async () => {
    const OLD = addDays(DATE, -21);
    await reset();
    await putSession({ ...newSession(OLD, 0, { completed: true }) } as never);
    await hydrate();
    renderAt('/', <DayBody date={OLD} />);
    fireEvent.click(await screen.findByText('Logged on the wrong day?'));
    expect(screen.getByText(weekdayOf(addDays(OLD, -1)))).toBeTruthy();
    expect(screen.queryByText('Yesterday')).toBeNull();
  });

  /**
   * And the climber is taken to the day it went to (PLAN.md M316).
   *
   * A move ends somewhere else by definition, and selecting the session by
   * id left the page showing a day it is no longer on — the session simply
   * vanished, with nothing said. Survivable behind two folds and a scroll;
   * two taps from the front of the logger it reads as a delete.
   */
  it('follows the session to the day it moved to', async () => {
    await logged();
    fireEvent.click(screen.getByText('Logged on the wrong day?'));
    fireEvent.click(screen.getByText(weekdayOf(YESTERDAY)));
    await waitFor(() => expect(window.location.hash).toContain(YESTERDAY));
  });

  it('stays put when the correction was a merge, which lands on this day', async () => {
    await reset();
    await putSession({ ...newSession(DATE, 0, { completed: true }) } as never);
    await putSession({ ...newSession(DATE, 1, { completed: true }) } as never);
    await hydrate();
    renderAt('/', <DayBody date={DATE} />);
    fireEvent.click((await screen.findAllByText('Logged on the wrong day?'))[0]!);
    const into = screen.queryByText(/^Merge in /);
    // The fixture only exercises this when the two are mergeable; if they
    // are not, the test would pass by doing nothing, so it says so.
    expect(into, 'the two sessions are not mergeable, so this checks nothing').toBeTruthy();
    fireEvent.click(into!);
    // `mergeSessions(a, b)` keeps `a`'s identity and the card calls
    // `merge(session, other)`, so the one being looked at survives and the
    // other is folded into it.
    await waitFor(async () => expect(await getSession(`${DATE}#1`)).toBeUndefined());
    expect(await getSession(`${DATE}#0`)).toBeTruthy();
    // Not "somewhere other than yesterday": navigating to *this* day is a
    // no-op on the log page and a bounce off Home, which renders this same
    // body at `/`. So the check is that it did not navigate at all.
    expect(window.location.hash, 'a merge stays where it happened').not.toContain('/log/');
  });

  it('still moves it anywhere the date input can say', async () => {
    await logged();
    fireEvent.click(screen.getByText('Logged on the wrong day?'));
    const far = addDays(DATE, -9);
    fireEvent.change(screen.getByLabelText('New date'), { target: { value: far } });
    fireEvent.click(screen.getByText('Move'));
    await waitFor(async () => {
      expect(await getSession(`${far}#0`)).toBeTruthy();
    });
  });

  it('will not move a session to the day it is already on', async () => {
    await logged();
    fireEvent.click(screen.getByText('Logged on the wrong day?'));
    expect((screen.getByText('Move') as HTMLButtonElement).disabled).toBe(true);
  });
});
