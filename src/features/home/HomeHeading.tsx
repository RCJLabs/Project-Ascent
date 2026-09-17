import { Link } from 'wouter';
import { CalendarDays, Check, Flag } from 'lucide-react';
import type { Program } from '@/content/types';
import { fromKey } from '@/engine/dates';
import { describeWeekDays, nextLimitDay } from '@/engine/week';
import type { DayStatus, WeekDay, WeekOutline } from '@/engine/week';
import { logHref } from '@/ui/routes';

/**
 * The day, and where it sits in the week (PLAN.md M241).
 *
 * Home used `DayHeading`, which is the **logger's** heading and right where
 * it lives: `/log/<date>` is one day, and paging to the day either side is
 * the job. On the front door all three of its parts were wrong.
 *
 * - **Both arrows navigated off Home**, to `/log/<yesterday>` and
 *   `/log/<tomorrow>`. They were the only controls on the screen whose whole
 *   function was to leave it, on a screen that is always today.
 * - **Its subtitle was said again below.** *"Week 5 · The Hammer"* over a
 *   *Your week* card reading *"Iron Grip · Week 5 of 12 · The Hammer (Max
 *   Hangs)"*, a few hundred pixels apart.
 * - **It cost about 150px** — a fifth of a phone's content height — to say
 *   the date.
 *
 * What replaces it says more in less: the date, seven marks for the seven
 * days, and one line for the block. *Your week* is gone, folded in here,
 * because it was the same fact in a card of its own.
 *
 * ## Seven links, not two arrows
 *
 * The arrows could reach yesterday and tomorrow. Every day of the week is a
 * link now, so the day a climber actually wants — the session they forgot to
 * log on Tuesday — is one tap rather than two, and the strip says which day
 * that is before they go looking.
 */

/**
 * What each state is called, in one place, so the mark and the label agree.
 *
 * Note what is **not** here: *today*. `statusOf` returns `'rest'` before it
 * ever asks whether the date is today — right for the week page, where a
 * rest day is a rest day whatever day it is, and wrong for a strip whose
 * whole job is saying where you are now. Drawn on a rest day it put a grey
 * dot on Thursday and a ring on nothing. So today is read from the date
 * here, and the status only says what happened on it.
 */
const STATE: Record<DayStatus, string> = {
  done: 'done',
  started: 'started',
  planned: 'planned',
  missed: 'missed',
  rest: 'rest day',
  today: 'planned',
};

const LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function HomeHeading({
  date,
  outline,
  program,
}: {
  date: string;
  outline: WeekOutline;
  program: Program | undefined;
}) {
  const heading = fromKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  const limit = nextLimitDay(outline);
  const count = describeWeekDays(outline, date);
  // A week with nothing planned and nothing logged has no shape to draw, and
  // seven empty dots on a first run is a worse first impression than none.
  const worth = outline.planned > 0 || outline.days.some((d) => d.sessions.length > 0);

  const where =
    outline.week !== null && program
      ? `Week ${outline.week} of ${program.weeks}${outline.phase ? ` · ${outline.phase.name}` : ''}${outline.isDeload ? ' · Deload' : ''}`
      : null;
  const line = [where, count].filter(Boolean).join(' · ');

  return (
    <header className="mb-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight min-w-0 truncate">{heading}</h1>
        <Link
          href="/calendar"
          aria-label="Open calendar"
          className="focus-ring shrink-0 inline-flex items-center justify-center w-11 h-11 -mr-2 rounded-xl text-accent"
        >
          <CalendarDays size={20} />
        </Link>
      </div>

      {worth && (
        <>
          <div className="flex mt-1">
            {outline.days.map((day, i) => (
              <DayMark
                key={day.date}
                day={day}
                letter={LETTER[i] ?? ''}
                isToday={day.date === date}
                isLimit={limit?.date === day.date}
              />
            ))}
          </div>
          {line && (
            <Link href="/week" className="focus-ring block rounded-lg mt-1">
              <p className="text-sm text-ink-soft leading-snug">
                {line}
                {limit && (
                  <>
                    {' · '}
                    limit day{' '}
                    {fromKey(limit.date).toLocaleDateString(undefined, { weekday: 'long' })}
                  </>
                )}
              </p>
            </Link>
          )}
        </>
      )}
    </header>
  );
}

/**
 * One day, as a link to its own log.
 *
 * The accessible name carries the date and the state, because a ring and a
 * filled circle say nothing to a reader — and the letter alone would have
 * seven days reading "S, M, T, W, T, F, S" with no way to tell Tuesday's
 * finished session from Friday's empty plan.
 */
function DayMark({
  day,
  letter,
  isToday,
  isLimit,
}: {
  day: WeekDay;
  letter: string;
  isToday: boolean;
  isLimit: boolean;
}) {
  const done = day.status === 'done';
  const started = day.status === 'started';
  const name = fromKey(day.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric' });
  const label = `${name} — ${isToday ? 'today, ' : ''}${STATE[day.status]}${isLimit ? ', the limit day' : ''}`;

  return (
    <Link
      href={logHref(day.date)}
      aria-label={label}
      aria-current={isToday ? 'date' : undefined}
      className="focus-ring flex-1 min-w-0 min-h-11 flex flex-col items-center justify-center gap-1 rounded-lg"
    >
      <span
        className={`text-2xs font-extrabold ${isToday ? 'text-accent' : 'text-ink-soft'}`}
        aria-hidden
      >
        {letter}
      </span>
      {done ? (
        <span
          className={`w-4 h-4 rounded-full bg-accent flex items-center justify-center ${isToday ? 'ring-2 ring-accent/35' : ''}`}
          aria-hidden
        >
          <Check size={10} strokeWidth={3.5} className="text-accent-ink" />
        </span>
      ) : isToday || started ? (
        <span className="w-4 h-4 rounded-full border-2 border-accent" aria-hidden />
      ) : isLimit ? (
        <Flag size={13} strokeWidth={2.4} className="text-warn" aria-hidden />
      ) : day.training ? (
        <span className="w-2.5 h-2.5 rounded-full border border-line bg-sunken" aria-hidden />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-line" aria-hidden />
      )}
    </Link>
  );
}
