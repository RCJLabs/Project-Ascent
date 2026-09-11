// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import { putSession } from '@/db/sessions';
import { getProgram } from '@/content/programs';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { ENOUGH } from '@/engine/calendar';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { CalendarPage } from '@/features/calendar/CalendarPage';

/**
 * Downloading the schedule (PLAN.md M75).
 *
 * The engine's arithmetic is tested next door. This is about the two things
 * a climber can be misled by: a file full of events at the wrong time of
 * day, and a card that offers one when there is no plan behind it.
 */

const TODAY = today();
const PROGRAM = getProgram('iron_grip')!;

/** What the download handed the browser: the bytes, and the name on them. */
function capture(): { file: () => Promise<string>; name: () => string; type: () => string } {
  let held: Blob | null = null;
  let name = '';
  URL.createObjectURL = vi.fn((blob: Blob | MediaSource) => {
    held = blob as Blob;
    return 'blob:ics';
  }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    name = this.download;
  };
  afterEach(() => {
    HTMLAnchorElement.prototype.click = click;
  });
  return {
    file: async () => {
      if (!held) throw new Error('nothing was downloaded');
      return (held as Blob).text();
    },
    name: () => name,
    type: () => (held as Blob | null)?.type ?? '',
  };
}

const live = (n: number, hour: number, minutes: number): Session[] =>
  Array.from({ length: n }, (_, i) => {
    const date = addDays(TODAY, -(i + 1) * 3);
    return {
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      climbs: [],
      durationMin: minutes,
      startedAt: new Date(new Date(`${date}T00:00:00`).setHours(hour, 0, 0, 0)).toISOString(),
      createdAt: date,
      updatedAt: date,
    } as Session;
  });

async function page(options: { active?: boolean; sessions?: Session[] } = {}): Promise<void> {
  await reset();
  for (const session of options.sessions ?? []) await putSession(session);
  await hydrate();
  useProfile.setState(
    options.active === false
      ? { activeProgramId: null, startDates: {}, plans: {}, weekOverrides: {}, adaptations: {} }
      : {
          activeProgramId: PROGRAM.id,
          // Started three weeks ago, so "from today" and "from the start"
          // are different answers and a test can tell them apart.
          startDates: { [PROGRAM.id]: addDays(TODAY, -21) },
          plans: {
            [PROGRAM.id]: Object.fromEntries(
              PROGRAM.sessionTypes.filter((t) => !t.isRest).slice(0, 3).map((t, i) => [(dayOfWeek(TODAY) + i) % 7, t.id]),
            ),
          },
          weekOverrides: {},
          adaptations: {},
        },
  );
  renderAt('/calendar', <CalendarPage />);
}

describe('the card', () => {
  it('offers nothing without a plan behind it', async () => {
    await page({ active: false });
    await screen.findByText(/No active program/);
    expect(screen.queryByText('Put it in your calendar')).toBeNull();
  });

  it('says how many sessions are in the file before writing one', async () => {
    await page();
    expect(await screen.findByText('Put it in your calendar')).toBeTruthy();
    expect(screen.getByText(/sessions, as a calendar file/)).toBeTruthy();
  });

  it('owns up to guessing the hour when the log cannot say', async () => {
    await page();
    expect(await screen.findByText(/a guess, because there is not enough in the log/)).toBeTruthy();
  });

  it('stops guessing once there is a log to read', async () => {
    await page({ sessions: live(ENOUGH, 19, 75) });
    expect(await screen.findByText(/19:00 for 75 minutes, which is the middle/)).toBeTruthy();
  });
});

describe('the file it writes', () => {
  it('puts the events at the hour the log says, not at a default', async () => {
    const written = capture();
    await page({ sessions: live(ENOUGH + 2, 7, 60) });
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    const file = await written.file();
    expect(file).toMatch(/DTSTART:\d{8}T070000/);
    expect(file).not.toMatch(/DTSTART:\d{8}T180000/);
  });

  it('exports what is left, not what has already been and gone', async () => {
    const written = capture();
    await page({ sessions: live(ENOUGH, 18, 90) });
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    const dates = [...(await written.file()).matchAll(/DTSTART:(\d{4})(\d{2})(\d{2})/g)].map(
      (m) => `${m[1]}-${m[2]}-${m[3]}`,
    );
    expect(dates.length).toBeGreaterThan(0);
    // A calendar full of sessions you have already done or already missed is
    // the noise the whole milestone is trying not to make.
    for (const date of dates) expect(date >= TODAY).toBe(true);
  });

  it('is a calendar with an alarm on every session', async () => {
    const written = capture();
    await page({ sessions: live(ENOUGH, 18, 90) });
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    const file = await written.file();
    expect(file.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    const events = (file.match(/BEGIN:VEVENT/g) ?? []).length;
    expect(events).toBeGreaterThan(0);
    expect((file.match(/BEGIN:VALARM/g) ?? []).length).toBe(events);
  });

  it('names the file after the program, and as a calendar', async () => {
    const written = capture();
    await page();
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    expect(written.name()).toBe('project-ascent-iron-grip.ics');
    // The type is what makes a phone offer to add it to a calendar rather
    // than opening it as a text file.
    expect(written.type()).toMatch(/^text\/calendar/);
  });

  it('leaves no anchor behind in the page', async () => {
    capture();
    await page();
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    expect(document.body.querySelector('a[download]')).toBeNull();
  });

  it('says what it did, rather than leaving a silent download', async () => {
    capture();
    await page();
    fireEvent.click(await screen.findByRole('button', { name: /Download the schedule/ }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toMatch(/exported/);
  });
});
