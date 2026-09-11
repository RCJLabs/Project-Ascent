// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { listSessions, newSession, putSession } from '@/db/sessions';
import { addDays, shortLabel, today } from '@/engine/dates';
import { isBare } from '@/engine/thinLog';
import { useUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * Days you trained and did not write down (PLAN.md M100).
 *
 * Marking a day has always been possible — open its log, mark it complete —
 * and has always taken a navigation and a tap per day. This is the half that
 * was missing: a range, from the calendar, without a program.
 */

const TODAY = today();

async function calendar(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/calendar', <CalendarPage />);
}

/** The cell's label flips to "Unmark" once it is picked. */
const mark = (date: string) =>
  screen.getByLabelText(new RegExp(`^(Un)?[Mm]ark ${shortLabel(date)} as trained$`));

describe('marking the days you trained', () => {
  // The climber this is for is the one who has been away from the app, and
  // whether a program is running has nothing to do with whether they climbed.
  it('is offered without an active program', async () => {
    await calendar();
    expect(screen.getByText('Mark days')).toBeTruthy();
    expect(screen.queryByText('Rearrange')).toBeNull();
  });

  it('turns the grid into a picker and says what it will do', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    expect(screen.getByText('Days you trained but did not log')).toBeTruthy();
    expect(screen.getByText(/carry no training load/)).toBeTruthy();
    expect(mark(addDays(TODAY, -3))).toBeTruthy();
  });

  it('offers nothing to confirm until a day is picked', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    expect(screen.queryByText(/Mark \d+ days? trained/)).toBeNull();
    fireEvent.click(mark(addDays(TODAY, -3)));
    expect(screen.getByText('Mark 1 day trained')).toBeTruthy();
  });

  it('writes one bare session per day picked', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    for (const back of [2, 3, 5]) fireEvent.click(mark(addDays(TODAY, -back)));
    fireEvent.click(screen.getByText('Mark 3 days trained'));

    await waitFor(async () => {
      const written = await listSessions();
      expect(written).toHaveLength(3);
      expect(written.map((s) => s.date).sort()).toEqual([5, 3, 2].map((b) => addDays(TODAY, -b)));
      expect(written.every(isBare)).toBe(true);
    });
  });

  it('unpicks a day that was picked by mistake', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    fireEvent.click(mark(addDays(TODAY, -2)));
    fireEvent.click(mark(addDays(TODAY, -3)));
    expect(screen.getByText('Mark 2 days trained')).toBeTruthy();
    fireEvent.click(mark(addDays(TODAY, -2)));
    expect(screen.getByText('Mark 1 day trained')).toBeTruthy();
  });

  /**
   * A picked day has to look picked.
   *
   * The first version appended `border-accent bg-accent/25` to a shell that
   * already carried `border-line bg-surface`. Both set the same properties,
   * so which won came down to Tailwind's emit order rather than class order,
   * and a picked day rendered identically to an unpicked one. jsdom resolves
   * no cascade, so the only thing a test can hold is that the two never
   * appear together — which is the condition that made it a coin flip.
   */
  it('does not leave the picked and unpicked styles fighting', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    const date = addDays(TODAY, -3);
    expect(mark(date).className).toContain('border-line');

    fireEvent.click(mark(date));
    const picked = mark(date).className;
    expect(picked).toContain('border-accent');
    expect(picked).not.toContain('border-line');
    // And the same for the fill, which is the half that stayed broken after
    // the border was fixed: `bg-surface` was still in the shell.
    expect(picked).toContain('bg-accent/30');
    expect(picked).not.toContain('bg-surface');
  });

  // One background per cell, whatever state it is in: the condition that
  // made the picked day a coin flip in the first place.
  it('never emits two backgrounds for one day', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    fireEvent.click(mark(addDays(TODAY, -3)));
    for (const cell of screen.getAllByLabelText(/as trained$/)) {
      const backgrounds = cell.className.split(/\s+/).filter((c) => c.startsWith('bg-'));
      expect(backgrounds, cell.getAttribute('aria-label') ?? '').toHaveLength(1);
    }
  });

  // You cannot have trained tomorrow.
  it('refuses a day in the future', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    expect((mark(addDays(TODAY, 2)) as HTMLButtonElement).disabled).toBe(true);
    expect((mark(TODAY) as HTMLButtonElement).disabled).toBe(false);
  });

  // A day that already has a session is already answered.
  it('refuses a day that is already logged', async () => {
    await reset();
    const date = addDays(TODAY, -4);
    await putSession({ ...newSession(date, 0, { completed: true, rpe: 7, durationMin: 60 }) } as never);
    await hydrate();
    renderAt('/calendar', <CalendarPage />);
    fireEvent.click(screen.getByText('Mark days'));
    expect((mark(date) as HTMLButtonElement).disabled).toBe(true);
  });

  // A fortnight in one tap is a lot of records to have made by accident.
  it('offers an undo that takes all of them back', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    for (const back of [2, 3, 5]) fireEvent.click(mark(addDays(TODAY, -back)));
    fireEvent.click(screen.getByText('Mark 3 days trained'));
    await waitFor(async () => expect(await listSessions()).toHaveLength(3));

    // "3 days marked", not "3 days marked deleted" — the bar used to append
    // the verb itself, because every undoable action before this was a
    // delete. Found in a browser (PLAN.md M100).
    const offer = useUndo.getState().offer;
    expect(offer?.label).toBe('3 days');
    expect(offer?.verb).toBe('marked');
    await offer!.run();
    await waitFor(async () => expect(await listSessions()).toEqual([]));
  });

  it('leaves the picker when it is done', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    fireEvent.click(mark(addDays(TODAY, -2)));
    fireEvent.click(screen.getByText('Mark 1 day trained'));
    await waitFor(() => expect(screen.queryByText('Days you trained but did not log')).toBeNull());
  });

  it('goes back to opening the day when the mode is off', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Mark days'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Days you trained but did not log')).toBeNull();
    expect(screen.queryByLabelText(/as trained/)).toBeNull();
  });
});
