import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { addDays, fromKey } from '@/engine/dates';
import { IconButton } from '@/ui/IconButton';
import { logHref } from '@/ui/routes';
import { usePlannedDay } from './usePlannedDay';

/**
 * The day, and the way to the days either side of it (PLAN.md M117).
 *
 * Home's heading and the logger's, in one place, because both show a day.
 * Its own file for the same reason `TodayRedirect` has one: Home is eager,
 * the logger's body is not, and a heading that lived in `LogPage.tsx`
 * would carry two thousand lines onto the boot path to say what day it is.
 *
 * The arrows go through `logHref`, so every day is reached at one address
 * — including today, since M124 gave it its page back.
 */
export function DayHeading({ date }: { date: string }) {
  const [, navigate] = useLocation();
  const { day } = usePlannedDay(date);
  const heading = fromKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="flex items-center justify-between mb-4">
      <IconButton onClick={() => navigate(logHref(addDays(date, -1)))} label="Previous day">
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
      <IconButton onClick={() => navigate(logHref(addDays(date, 1)))} label="Next day">
        <ArrowLeft size={18} className="rotate-180" />
      </IconButton>
    </div>
  );
}
