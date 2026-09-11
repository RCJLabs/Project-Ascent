import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, BookOpen, CalendarPlus, ChevronLeft, ChevronRight, Move, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import type { DayOfWeek, Program } from '@/content/types';
import {
  DEFAULT_ALARM_MINUTES,
  calendarFilename,
  scheduleEvents,
  timesAreKnown,
  usualSession,
} from '@/engine/calendar';
import { icsCalendar } from '@/lib/ics';
import { downloadFile } from '@/lib/download';
import type { WeekPlan } from '@/engine/scheduler';
import { addDays, dayOfWeek, fromKey, monthGrid, monthLabel, shortLabel, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { summarise } from '@/engine/injury';
import { effectivePlan, previewMove, type MovePreview, type WeekOverrides } from '@/engine/reschedule';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
import { PageHeader } from '@/ui/PageHeader';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function JournalLink() {
  return (
    <Link href="/journal" className="text-ink-soft p-2.5 -m-1.5" aria-label="Journal">
      <BookOpen size={20} />
    </Link>
  );
}

export function CalendarPage() {
  const now = fromKey(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const byDate = useSessions((s) => s.byDate);
  const load = useSessions((s) => s.load);
  const hydrated = useSessions((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const injuries = useProfile((s) => s.injuries);
  const setWeekPlan = useProfile((s) => s.setWeekPlan);
  const setPlan = useProfile((s) => s.setPlan);
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;

  /** The day being moved, if any. Pick-then-place rather than drag: a 40px
   *  cell is not a drag target on a phone, and drag is unreachable by
   *  keyboard. */
  const [moving, setMoving] = useState<string | null>(null);
  const [rearranging, setRearranging] = useState(false);
  const thisWeek = startOfWeek(today());

  const days = useMemo(() => monthGrid(year, month), [year, month]);

  // Landings are only meaningful inside the moving day's own week; a session
  // cannot move to another week without changing which week it belongs to.
  const previews = useMemo(() => {
    if (!moving || !program || !plan) return null;
    const week = effectivePlan(plan, overrides, moving);
    const from = dayOfWeek(moving) as DayOfWeek;
    const out: Record<string, MovePreview> = {};
    for (let i = 0; i < 7; i++) {
      const date = addDays(startOfWeek(moving), i);
      out[date] = previewMove(program, week, from, i as DayOfWeek);
    }
    return out;
  }, [moving, program, plan, overrides]);

  /** Land the moving session on `date`, asking for scope first. */
  const [pending, setPending] = useState<{ to: string; preview: MovePreview } | null>(null);

  function commitMove(to: string) {
    const preview = previews?.[to];
    if (!preview || !moving) return;
    setPending({ to, preview });
  }

  function applyMove(scope: 'week' | 'always') {
    if (!pending || !moving || !activeProgramId) return;
    if (scope === 'week') setWeekPlan(activeProgramId, startOfWeek(moving), pending.preview.plan);
    else setPlan(activeProgramId, pending.preview.plan);
    setPending(null);
    setMoving(null);
  }

  function shift(by: number) {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  /**
   * Whether there is a plan to draw on top of the month (PLAN.md M45).
   *
   * This used to be an early return: no program, no calendar, and the
   * sentence in its place promised that sessions would appear here — which
   * they already had, hundreds of them, invisible. A program says what you
   * *should* do; it has never had anything to do with what you already did,
   * and the half of this page that shows the second half needs nothing from
   * it.
   */
  const planning = program !== undefined && startDate !== undefined && plan !== undefined;

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={
          planning ? [program.name, summarise(injuries)].filter(Boolean).join(' · ') : 'What you have logged'
        }
        action={<JournalLink />}
      />

      {!planning && (
        <Card className="mb-3">
          <p className="text-sm text-ink-soft mb-3">
            No active program, so this is your log rather than a plan. Pick one and the weeks fill
            in around what you are already doing.
          </p>
          <Link href="/find" className="text-accent font-semibold text-sm">
            Find my program →
          </Link>
        </Card>
      )}

      {planning && rearranging && !moving && !pending && (
        <Card className="mb-3">
          <p className="text-sm">
            Tap a planned session to pick it up. Logged days and finished weeks stay put — they are
            history, not a plan.
          </p>
        </Card>
      )}

      {planning && moving && (
        <Card className="mb-3">
          <div className="flex items-start gap-2 mb-2">
            <Move size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                Moving {plannedDay(program, startDate, plan, moving, overrides).sessionType?.name}
              </p>
              <p className="text-xs text-ink-soft mt-0.5">
                Pick a day in the same week. Green is clear, amber is untidy, red breaks a rule.
              </p>
            </div>
            <IconButton onClick={() => setMoving(null)} label="Cancel move">
              <X size={16} />
            </IconButton>
          </div>
        </Card>
      )}

      {planning && pending && (
        <Card className="mb-3">
          <p className="text-sm font-semibold mb-1">
            {pending.preview.swaps ? 'Swap with' : 'Move to'} {shortLabel(pending.to)}?
          </p>
          {pending.preview.introduced.length > 0 ? (
            <ul className="grid grid-cols-1 gap-1.5 my-2">
              {pending.preview.introduced.map((v) => (
                <li key={v.message} className="flex gap-2 text-sm">
                  <AlertTriangle
                    size={14}
                    className={`shrink-0 mt-0.5 ${v.severity === 'error' ? 'text-danger' : 'text-warn'}`}
                  />
                  <span className="text-ink-soft">{v.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-soft mb-2">Nothing in the program objects to this.</p>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            {/* A move the program calls unsafe is still the climber's to make
                — the app advises — but it must not look endorsed. */}
            <Button
              size="sm"
              variant={pending.preview.blocking.length > 0 ? 'outline' : 'primary'}
              onClick={() => applyMove('week')}
            >
              This week only
            </Button>
            <Button size="sm" variant="outline" onClick={() => applyMove('always')}>
              Every week
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
          </div>
          <p className="text-xs text-ink-soft mt-2.5 leading-relaxed">
            This week only leaves the program's plan alone. Every week rewrites it, and drops any
            single-week changes you had made.
          </p>
        </Card>
      )}

      <div className="flex items-center justify-between mb-3">
        <IconButton onClick={() => shift(-1)} label="Previous month">
          <ChevronLeft size={20} />
        </IconButton>
        <span className="font-bold">{monthLabel(year, month)}</span>
        <IconButton onClick={() => shift(1)} label="Next month">
          <ChevronRight size={20} />
        </IconButton>
      </div>

      <div className="flex justify-end mb-2">
        {planning && (
        <Button
          size="sm"
          variant={rearranging ? 'primary' : 'ghost'}
          onClick={() => {
            setRearranging(!rearranging);
            setMoving(null);
            setPending(null);
          }}
        >
          <Move size={14} /> {rearranging ? 'Done' : 'Rearrange'}
        </Button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_INITIALS.map((d, i) => (
          <div key={i} className="text-center text-2xs font-bold uppercase text-ink-soft py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const day = planning ? plannedDay(program, startDate, plan, date, overrides) : null;
          const logged = byDate[date] ?? [];
          const done = logged.some((s) => s.completed);
          const inMonth = fromKey(date).getMonth() === month;
          const isToday = date === today();
          const planned = day !== null && day.sessionType && !day.isRest;
          const preview = previews?.[date];
          const isSource = moving === date;
          const landing = previews !== null && preview !== undefined && !isSource;
          // Before a pick, a planned day that has not been logged is
          // pickable — but only from this week on. A finished week's plan is
          // meaningless, and an override written against it is pruned on the
          // way out, which would make the move silently vanish.
          const pickable =
            planning && rearranging && !moving && Boolean(planned) && !done && startOfWeek(date) >= thisWeek;

          const tone = isSource
            ? 'border-accent bg-accent/25'
            : landing
              ? preview.blocking.length > 0
                ? 'border-danger/60 bg-danger/10'
                : preview.introduced.length > 0
                  ? 'border-warn/60 bg-warn/10'
                  : 'border-positive/60 bg-positive/10'
              : pickable
                ? 'border-accent/60 bg-accent/5'
                : isToday
                  ? 'border-accent'
                  : 'border-line';

          const body = (
            <>
              <span className={`text-xs ${isToday ? 'font-black text-accent' : 'text-ink-soft'}`}>
                {fromKey(date).getDate()}
              </span>
              {done ? (
                <span className="text-sm leading-none">✅</span>
              ) : planned ? (
                <span className="text-sm leading-none">{day!.sessionType!.icon}</span>
              ) : (
                <span className="text-sm leading-none text-ink-soft/40">·</span>
              )}
              {/* Both, when a week is both (PLAN.md M67). Suppressing the
                  test marker on a deload week sounded tidy and lost Peak
                  Performance *both* of its mid-block tests: it deloads on
                  weeks 5 and 9, which are the two weeks its phases start.
                  A deload is also the week you are freshest to test in. */}
              {inMonth && (day?.isDeload || day?.test !== undefined) && (
                <span className="flex items-center gap-0.5 leading-none">
                  {day?.isDeload && (
                    <span className="text-2xs font-bold uppercase text-warn leading-none">DL</span>
                  )}
                  {day?.test !== undefined && (
                    <span className="text-2xs font-bold uppercase text-accent leading-none">T</span>
                  )}
                </span>
              )}
            </>
          );

          const shell = `focus-ring aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${tone} ${
            inMonth ? 'bg-surface' : 'bg-transparent opacity-40'
          } ${done && !landing && !isSource ? 'bg-accent/15' : ''}`;

          // While a move is in progress the whole grid becomes targets, so
          // navigating away by accident is impossible.
          if (rearranging || moving) {
            const enabled = moving ? landing || isSource : pickable;
            return (
              <button
                key={date}
                className={shell}
                disabled={!enabled}
                aria-label={
                  isSource
                    ? `Cancel moving ${day?.sessionType?.name ?? 'session'}`
                    : moving
                      ? `Move to ${shortLabel(date)}`
                      : `Move ${day?.sessionType?.name ?? 'session'} from ${shortLabel(date)}`
                }
                onClick={() => {
                  if (isSource) setMoving(null);
                  else if (moving) commitMove(date);
                  else setMoving(date);
                }}
              >
                {body}
              </button>
            );
          }

          return (
            <Link key={date} href={`/log/${date}`} className={shell}>
              {body}
            </Link>
          );
        })}
      </div>

      {planning && (
        <SubscribeCard program={program} startDate={startDate} plan={plan} overrides={overrides} />
      )}

      <Card className="mt-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
          <span>✅ Logged</span>
          {planning && (
            <>
              <span>{program.sessionTypes.find((t) => !t.isRest)?.icon} Planned session</span>
              <span className="text-warn font-bold">DL — deload week</span>
              <span className="text-accent font-bold">T — assessment week</span>
            </>
          )}
        </div>
      </Card>
    </>
  );
}

/**
 * The plan, as a file the climber's own calendar can hold (PLAN.md M75).
 *
 * This is what M75 became after local notifications turned out to be
 * unbuildable in a PWA with no server — see `lib/ics.ts`. The reminding is
 * handed to the thing that is already good at it.
 *
 * On the calendar page rather than in Settings, because it is a fact about
 * the plan and not about the data. The download itself is `lib/download.ts`,
 * shared with the backup export rather than written out twice.
 */
function SubscribeCard({
  program,
  startDate,
  plan,
  overrides,
}: {
  program: Program;
  startDate: string;
  plan: WeekPlan;
  overrides?: WeekOverrides;
}) {
  const byDate = useSessions((s) => s.byDate);
  const [message, setMessage] = useState<string | null>(null);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const usual = useMemo(() => usualSession(sessions), [sessions]);
  const events = useMemo(
    () => scheduleEvents({ program, startDate, plan, overrides, from: today(), usual }),
    [program, startDate, plan, overrides, usual],
  );

  const known = timesAreKnown(usual);
  const at = `${String(Math.floor(usual.startMinute / 60)).padStart(2, '0')}:${String(
    usual.startMinute % 60,
  ).padStart(2, '0')}`;

  function save() {
    const text = icsCalendar(events, { name: `Project Ascent · ${program.name}` });
    // `text/calendar` is what makes a phone offer to add it to a calendar
    // rather than opening it as a text file.
    downloadFile(new Blob([text], { type: 'text/calendar;charset=utf-8' }), calendarFilename(program));
    setMessage(
      `${events.length} session${events.length === 1 ? '' : 's'} exported. Open the file on your phone to add them.`,
    );
  }

  return (
    <Card title="Put it in your calendar" className="mt-4">
      <p className="text-sm text-ink-soft leading-relaxed mb-3">
        {events.length === 0
          ? 'Nothing left in this program to export.'
          : `The remaining ${events.length} session${events.length === 1 ? '' : 's'}, as a calendar file with a reminder ${DEFAULT_ALARM_MINUTES / 60} hours before each one. Your phone does the reminding, so it works with the app closed.`}
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
