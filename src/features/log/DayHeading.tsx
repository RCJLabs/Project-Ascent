import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { addDays, fromKey, today } from '@/engine/dates';
import { IconButton } from '@/ui/IconButton';
import { logHref } from '@/ui/routes';
import { usePlannedDay } from './usePlannedDay';

/**
 * The day, and the way to the days either side of it (PLAN.md M117).
 *
 * Home's heading and the logger's, in one place, because Home *is* the
 * logger for today. Its own file for the same reason `TodayRedirect` has
 * one: Home is eager, the logger's body need not be, and a heading that
 * lived in `LogPage.tsx` would carry two thousand lines onto the boot path
 * to say what day it is.
 *
 * The arrows go through `logHref`, so stepping from yesterday to today
 * lands on Home rather than on a second address for the same day.
 */
export function DayHeading({ date }: { date: string }) {
  const [, navigate] = useLocation();
  const { day } = usePlannedDay(date);
  const heading = fromKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const now = today();

  return (
    <div className="flex items-center justify-between mb-4">
      <IconButton onClick={() => navigate(logHref(addDays(date, -1), now))} label="Previous day">
        <ArrowLeft size={18} />
      </IconButton>
      <div className="text-center">
        <h1 className="text-xl font-black tracking-tight">{heading}</h1>
        {day?.week && (
          <p className="text-sm text-ink-soft">
            Week {day.week}
            {day.phase ? ` · ${day.phase.name}` : ''}
            {day.isDeload ? ' · Deload' : ''}
          </p>
        )}
      </div>
      <IconButton onClick={() => navigate(logHref(addDays(date, 1), now))} label="Next day">
        <ArrowLeft size={18} className="rotate-180" />
      </IconButton>
    </div>
  );
}
