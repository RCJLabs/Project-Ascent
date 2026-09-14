import { useMemo, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { getProgram } from '@/content/programs';
import {
  DEFAULT_ALARM_MINUTES,
  calendarFilename,
  scheduleEvents,
  timesAreKnown,
  usualSession,
} from '@/engine/calendar';
import { today } from '@/engine/dates';
import { downloadFile } from '@/lib/download';
import { icsCalendar } from '@/lib/ics';
import { useProfile } from '@/store/profile';
import { useAllSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

/**
 * The plan, as a file the climber's own calendar can hold (PLAN.md M75).
 *
 * This is what M75 became after local notifications turned out to be
 * unbuildable in a PWA with no server — see `lib/ics.ts`. The reminding is
 * handed to the thing that is already good at it.
 *
 * Under Settings › Data since M122, where every other "get my data out"
 * lives. M75 put it on the calendar page as "a fact about the plan and not
 * about the data"; the audit read it the other way — the calendar is the
 * grid, and this is an export with a download button — and the calendar
 * page is only the grid now. Nothing to show without a running block.
 */
export function CalendarExportCard() {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const [message, setMessage] = useState<string | null>(null);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;

  const sessions = useAllSessions();
  const usual = useMemo(() => usualSession(sessions), [sessions]);
  const events = useMemo(
    () =>
      program && startDate && plan
        ? scheduleEvents({ program, startDate, plan, overrides, from: today(), usual })
        : [],
    [program, startDate, plan, overrides, usual],
  );

  if (!program || !startDate || !plan) return null;

  const known = timesAreKnown(usual);
  const at = `${String(Math.floor(usual.startMinute / 60)).padStart(2, '0')}:${String(
    usual.startMinute % 60,
  ).padStart(2, '0')}`;

  function save() {
    const text = icsCalendar(events, { name: `Project Ascent · ${program!.name}` });
    // `text/calendar` is what makes a phone offer to add it to a calendar
    // rather than opening it as a text file.
    downloadFile(new Blob([text], { type: 'text/calendar;charset=utf-8' }), calendarFilename(program!));
    setMessage(
      `${events.length} session${events.length === 1 ? '' : 's'} exported. Open the file on your phone to add them.`,
    );
  }

  return (
    <Card title="Put it in your calendar">
      <p className="text-sm text-ink-soft leading-relaxed mb-3">
        {events.length === 0
          ? 'Nothing left in this program to export.'
          : `The remaining ${events.length} session${events.length === 1 ? '' : 's'} of ${program.name}, as a calendar file with a reminder ${DEFAULT_ALARM_MINUTES / 60} hours before each one. Your phone does the reminding, so it works with the app closed.`}
      </p>
      {events.length > 0 && (
        <>
          <p className="text-xs text-ink-soft leading-relaxed mb-3">
            {known
              ? `Timed at ${at} for ${usual.durationMinutes} minutes, which is the middle of what you have been logging.`
              : `Timed at ${at} for ${usual.durationMinutes} minutes — a guess, because there is not enough in the log yet to read your usual hour off. Start a few sessions live and export again.`}{' '}
            Exporting again after changing the plan updates the same events rather than adding a
            second copy of them.
          </p>
          <Button size="sm" variant="outline" onClick={save}>
            <CalendarPlus size={15} /> Download the schedule
          </Button>
        </>
      )}
      {message && (
        <p className="text-sm text-positive mt-2" role="status">
          {message}
        </p>
      )}
    </Card>
  );
}
