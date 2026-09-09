import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, BookOpen, ChevronLeft, ChevronRight, Move, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import type { DayOfWeek } from '@/content/types';
import { addDays, dayOfWeek, fromKey, monthGrid, monthLabel, shortLabel, startOfWeek, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { effectivePlan, previewMove, type MovePreview } from '@/engine/reschedule';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
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

  if (!program || !startDate || !plan) {
    return (
      <>
        <PageHeader title="Calendar" action={<JournalLink />} />
        <Card>
          <p className="text-sm text-ink-soft mb-3">
            No active program yet. Pick one and plan your week, and your sessions will appear here.
          </p>
          <Link href="/find" className="text-accent font-semibold text-sm">
            Find my program →
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle={program.name} action={<JournalLink />} />

      {rearranging && !moving && !pending && (
        <Card className="mb-3">
          <p className="text-sm">
            Tap a planned session to pick it up. Logged days and finished weeks stay put — they are
            history, not a plan.
          </p>
        </Card>
      )}

      {moving && (
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
            <button onClick={() => setMoving(null)} className="text-ink-soft p-2.5 -m-1.5" aria-label="Cancel move">
              <X size={16} />
            </button>
          </div>
        </Card>
      )}

      {pending && (
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
        <button onClick={() => shift(-1)} className="p-2 -m-2 text-ink-soft" aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold">{monthLabel(year, month)}</span>
        <button onClick={() => shift(1)} className="p-2 -m-2 text-ink-soft" aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex justify-end mb-2">
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
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_INITIALS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-ink-soft py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const day = plannedDay(program, startDate, plan, date, overrides);
          const logged = byDate[date] ?? [];
          const done = logged.some((s) => s.completed);
          const inMonth = fromKey(date).getMonth() === month;
          const isToday = date === today();
          const planned = day.sessionType && !day.isRest;
          const preview = previews?.[date];
          const isSource = moving === date;
          const landing = previews !== null && preview !== undefined && !isSource;
          // Before a pick, a planned day that has not been logged is
          // pickable — but only from this week on. A finished week's plan is
          // meaningless, and an override written against it is pruned on the
          // way out, which would make the move silently vanish.
          const pickable =
            rearranging && !moving && Boolean(planned) && !done && startOfWeek(date) >= thisWeek;

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
                <span className="text-sm leading-none">{day.sessionType!.icon}</span>
              ) : (
                <span className="text-sm leading-none text-ink-soft/40">·</span>
              )}
              {day.isDeload && inMonth && (
                <span className="text-[8px] font-bold uppercase text-warn leading-none">DL</span>
              )}
            </>
          );

          const shell = `aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${tone} ${
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
                    ? `Cancel moving ${day.sessionType?.name ?? 'session'}`
                    : moving
                      ? `Move to ${shortLabel(date)}`
                      : `Move ${day.sessionType?.name ?? 'session'} from ${shortLabel(date)}`
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

      <Card className="mt-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
          <span>✅ Logged</span>
          <span>{program.sessionTypes.find((t) => !t.isRest)?.icon} Planned session</span>
          <span className="text-warn font-bold">DL — deload week</span>
        </div>
      </Card>
    </>
  );
}
