// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { addDays, shortLabel, today } from '@/engine/dates';
import { useAway } from '@/store/away';
import { useUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { daysBeforeLastMonthEnded, showMonthOf } from '@/test/calendarMonth';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * Telling the app you were away (PLAN.md M275).
 *
 * The screen borrows M100's gesture — the same tapped days, read as a range
 * rather than a list — because the two are the two answers to one question:
 * the days are quiet, and only the climber knows whether they trained through
 * them or were somewhere else.
 */

const TODAY = today();

async function calendar(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/calendar', <CalendarPage />);
}

const pick = (date: string) =>
  screen.getByLabelText(new RegExp(`^(Un)?[Mm]ark ${shortLabel(date)} as away$`));

/**
 * A day behind us, in a month the calendar can be pointed at (PLAN.md
 * M299). `calendarMonth.ts` holds the reason and the arithmetic; the range
 * these tests store used to be `addDays(TODAY, -9)` to `addDays(TODAY, -2)`,
 * which splits across two months at the start of one.
 */
const behind = daysBeforeLastMonthEnded;

/** The away picker, open on the month `behind` counts in. */
function marking(): void {
  fireEvent.click(screen.getByText('Away'));
  showMonthOf(behind(0));
}

describe('marking a stretch away', () => {
  it('is offered beside the other answer, not instead of it', async () => {
    await calendar();
    expect(screen.getByText('Mark days')).toBeTruthy();
    expect(screen.getByText('Away')).toBeTruthy();
  });

  /**
   * One picker, two meanings. A climber halfway through both at once with one
   * set of tapped days is the bug the mode exists to prevent.
   */
  it('shows one card at a time, and the labels say which', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Away'));
    expect(screen.getByText('Days you were away')).toBeTruthy();
    expect(screen.queryByText('Days you trained but did not log')).toBeNull();

    fireEvent.click(screen.getByText('Mark days'));
    expect(screen.getByText('Days you trained but did not log')).toBeTruthy();
    expect(screen.queryByText('Days you were away')).toBeNull();
  });

  it('offers nothing to confirm until a day is picked', async () => {
    await calendar();
    marking();
    expect(screen.queryByText(/^Mark .* away$/)).toBeNull();
    fireEvent.click(pick(behind(3)));
    expect(screen.getByText(/^Mark .* away$/)).toBeTruthy();
  });

  /** First tap to last tap, everything between included — and it says so. */
  it('stores one range from the earliest tap to the latest', async () => {
    await calendar();
    marking();
    expect(screen.getByText(/Tap the first day and the last/)).toBeTruthy();
    fireEvent.click(pick(behind(9)));
    fireEvent.click(pick(behind(2)));
    fireEvent.click(screen.getByText(/^Mark .* away$/));

    await waitFor(() => expect(useAway.getState().periods).toHaveLength(1));
    const stored = useAway.getState().periods[0]!;
    expect(stored.from).toBe(behind(9));
    expect(stored.to).toBe(behind(2));
    expect(stored.kind).toBe('trip');
  });

  it('carries the name the climber typed', async () => {
    await calendar();
    marking();
    fireEvent.change(screen.getByLabelText('Call it something'), {
      target: { value: "  Font   '26 " },
    });
    fireEvent.click(pick(behind(4)));
    fireEvent.click(screen.getByText(/^Mark .* away$/));
    await waitFor(() => expect(useAway.getState().periods[0]?.note).toBe("Font '26"));
  });

  it('stores the kind the climber chose', async () => {
    await calendar();
    marking();
    fireEvent.click(screen.getByText('Injured'));
    fireEvent.click(pick(behind(4)));
    fireEvent.click(screen.getByText(/^Mark .* away$/));
    await waitFor(() => expect(useAway.getState().periods[0]?.kind).toBe('injured'));
  });

  it('lists what is already stored, and takes one back', async () => {
    await calendar();
    marking();
    fireEvent.click(pick(behind(4)));
    fireEvent.click(screen.getByText(/^Mark .* away$/));
    await waitFor(() => expect(useAway.getState().periods).toHaveLength(1));

    fireEvent.click(screen.getByLabelText(/^Remove /));
    await waitFor(() => expect(useAway.getState().periods).toHaveLength(0));
  });

  /**
   * The offer every destructive call in the app makes — `ui/safety.test.ts`
   * holds the rule, and it is what caught this missing.
   */
  it('puts a removed marker back, whole', async () => {
    await calendar();
    marking();
    fireEvent.change(screen.getByLabelText('Call it something'), { target: { value: 'Font' } });
    fireEvent.click(pick(behind(9)));
    fireEvent.click(pick(behind(2)));
    fireEvent.click(screen.getByText(/^Mark .* away$/));
    await waitFor(() => expect(useAway.getState().periods).toHaveLength(1));

    fireEvent.click(screen.getByLabelText(/^Remove /));
    await waitFor(() => expect(useAway.getState().periods).toHaveLength(0));
    await useUndo.getState().offer!.run();

    const back = useAway.getState().periods[0];
    expect(back?.note).toBe('Font');
    expect(back?.from).toBe(behind(9));
    expect(back?.to).toBe(behind(2));
  });

  /**
   * A fortnight in Font with one day logged is still a fortnight in Font.
   * `trained` keeps M100's rule and refuses a logged day; `away` must not,
   * or the marker is unusable for exactly the climbers who are trying.
   */
  it('lets a logged day sit inside a range, where marking-trained would not', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Away'));
    expect(pick(TODAY).hasAttribute('disabled')).toBe(false);
  });

  it('cannot mark a day that has not happened', async () => {
    await calendar();
    fireEvent.click(screen.getByText('Away'));
    // In the month that holds it (PLAN.md M299): tomorrow is next month on
    // the last day of this one, and a month ending on a Saturday lends the
    // grid no trailing days to find it among.
    const tomorrow = addDays(TODAY, 1);
    showMonthOf(tomorrow);
    expect(pick(tomorrow).hasAttribute('disabled')).toBe(true);
  });
});
