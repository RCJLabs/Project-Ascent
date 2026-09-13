// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * The calendar is the grid (PLAN.md M122).
 *
 * The .ics export lived on it from M75; it is under Settings › Data now,
 * and a copy left behind would be two buttons for one file.
 */
describe('the calendar page', () => {
  it('no longer carries the export', async () => {
    await reset();
    await hydrate();
    const program = getProgram('iron_grip')!;
    useProfile.setState({
      activeProgramId: program.id,
      startDates: { [program.id]: addDays(today(), -7) },
      plans: { [program.id]: { [dayOfWeek(today())]: program.sessionTypes[0]!.id } },
      weekOverrides: {},
      adaptations: {},
    });
    renderAt('/calendar', <CalendarPage />);
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Put it in your calendar')).toBeNull();
    expect(screen.queryByRole('button', { name: /Download the schedule/ })).toBeNull();
  });
});
