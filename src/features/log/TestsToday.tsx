import { useMemo } from 'react';
import { dayOfWeek, today } from '@/engine/dates';
import { concerning, injuryPolicy } from '@/engine/injury';
import { joinList } from '@/engine/phrase';
import { DAY_NAMES } from '@/engine/scheduler';
import { stillToTake, takenIn, testsOn } from '@/engine/testDays';
import { TestSafety } from '@/features/assessments/TestSafety';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useTestWeek } from './useTestWeek';

/**
 * Which of the week's tests are this day's (PLAN.md M325).
 *
 * The line above says the numbers are due; this says which ones, today, in
 * the order the program lists them — because the list the link opens is the
 * whole battery at once, and nine maximal efforts is not a session.
 */
export function TestsToday({ date }: { date: string }) {
  const week = useTestWeek(date);
  const entries = useMetrics((s) => s.entries);
  const injuries = useProfile((s) => s.injuries);
  const hurt = useMemo(() => concerning(injuryPolicy(injuries)), [injuries]);
  if (week === null) return null;
  // The log opens on any date, so the day is named unless it is today.
  const name = DAY_NAMES[dayOfWeek(date)]!;
  const isToday = date === today();
  const mine = testsOn(week, date);
  const taken = takenIn(week, entries);
  const earlier = stillToTake(week, entries, date);
  // Only read when this day has none, so every day listed is another one.
  const elsewhere = week.days.map((d) => DAY_NAMES[dayOfWeek(d.date)]!);

  return (
    <>
      {mine.length === 0 ? (
        <span className="block mt-1">
          Nothing to test {isToday ? 'today' : `on ${name}`}
          {elsewhere.length > 0 ? ` — this week's tests are on ${joinList(elsewhere)}` : ''}.
        </span>
      ) : mine.every((m) => taken.has(m.id)) ? (
        // "Wednesday's tests are in" read as if Wednesday had happened, on the
        // log of a Wednesday that was missed and whose grade was taken on the
        // Saturday. What is true is that the week has the numbers.
        <span className="block mt-1 font-semibold">
          Taken this week: {joinList(mine.map((m) => m.label))}.
        </span>
      ) : (
        <>
          <span className="block mt-1 font-semibold">
            {isToday ? 'Today' : `On ${name}`}, in this order, after the warm-up:
          </span>
          <ol className="mt-0.5 list-decimal list-inside">
            {mine.map((m) => (
              <li key={m.id}>
                {m.label}
                {taken.has(m.id) ? ' ✓' : ''}
                <TestSafety metric={m} injured={hurt} compact />
              </li>
            ))}
          </ol>
        </>
      )}
      {earlier.length > 0 && (
        <span className="block mt-1">
          Still to take from earlier in the week: {joinList(earlier.map((m) => m.label))}.
        </span>
      )}
    </>
  );
}
