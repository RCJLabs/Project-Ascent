import { useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Flag,
  Move,
  Ruler,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { getProgram } from '@/content/programs';
import { INTENSITY_LABEL, type DayOfWeek } from '@/content/types';
import { TEST_REASON_LABEL } from '@/engine/assessments';
import { describeDayLoad, describeParts } from '@/engine/bodyLoad';
import { addDays, dayOfWeek, fromKey, isDateKey, shortLabel, startOfWeek, today } from '@/engine/dates';
import { blockWindow, DELOAD_STEP } from '@/engine/plan';
import { effectivePlan, previewMove, type MovePreview } from '@/engine/reschedule';
import { intensityOf } from '@/engine/scheduler';
import { describeWeekDays, type WeekDay, type WeekOutline } from '@/engine/week';
import { useProfile } from '@/store/profile';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { IconButton } from '@/ui/IconButton';
import { logHref, weekHref } from '@/ui/routes';
import { useWeekOutline } from './useWeekOutline';

/**
 * The week, as a screen (PLAN.md M135).
 *
 * The program model is week-shaped and the app had no week: a day, a month
 * and a block, and everything a program says per week — the dose moving,
 * the deload, the test, the drill, the hard day, what was done — answered
 * in pieces on four pages, with a month of forty-pixel cells as the nearest
 * thing to a week view.
 *
 * Three things, in order. **The week's facts:** where the block is, what
 * this week asks that last week did not, the deload, the test, the drills.
 * **The seven days,** each a row — what it asks, how hard, roughly how long,
 * what it loads of what is hurt, and what happened on it. **The moves,**
 * which lived on the month until now and were confined to a week the whole
 * time: a session cannot leave its week without changing which week it
 * belongs to, so the screen that shows a week is the screen to move one on.
 *
 * What it is not: the session. A row is a door to the day; the dose and the
 * log stay there. The month stays too, for the shape of a block and for
 * marking days trained without a log. Day, week, month — each shows one
 * grain and links to the others.
 */
export function WeekPage({ params }: { params?: { start?: string } } = {}) {
  const [, navigate] = useLocation();
  const now = today();
  // Any date in the week will do; junk is this week rather than an error.
  const anchor = params?.start && isDateKey(params.start) ? params.start : now;
  const start = startOfWeek(anchor);
  const end = addDays(start, 6);

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const setWeekPlan = useProfile((s) => s.setWeekPlan);
  const setPlan = useProfile((s) => s.setPlan);
  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;
  const planning = program !== undefined && startDate !== undefined && plan !== undefined;

  const outline = useWeekOutline(start);

  /**
   * Pick-then-place, as the calendar did it from §5.3 to M134, and for the
   * reasons it gave: a drag is a coin flip under a thumb and unreachable by
   * keyboard, and two taps leave room to say what the move would do before
   * it happens. The landings are the other six days of this week, because
   * that is the only place a session can land.
   */
  const [rearranging, setRearranging] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [pending, setPending] = useState<{ to: string; preview: MovePreview } | null>(null);

  const previews = useMemo(() => {
    if (!moving || !planning) return null;
    const week = effectivePlan(plan, overrides, moving);
    const from = dayOfWeek(moving) as DayOfWeek;
    const out: Record<string, MovePreview> = {};
    for (let i = 0; i < 7; i++) out[addDays(start, i)] = previewMove(program, week, from, i as DayOfWeek);
    return out;
  }, [moving, planning, program, plan, overrides, start]);

  // A finished week's plan is history, and an override written against it
  // is pruned on the way out, so the move would silently vanish.
  const movable = planning && !outline.before && !outline.over && start >= startOfWeek(now);

  function land(to: string) {
    const preview = previews?.[to];
    if (!preview || !moving) return;
    setPending({ to, preview });
  }

  function applyMove(scope: 'week' | 'always') {
    if (!pending || !moving || !activeProgramId || !plan) return;
    if (scope === 'week') setWeekPlan(activeProgramId, start, pending.preview.plan);
    else setPlan(activeProgramId, pending.preview.plan);
    setPending(null);
    setMoving(null);
  }

  function stopRearranging() {
    setRearranging(false);
    setMoving(null);
    setPending(null);
  }

  const range = `${shortLabel(start)} – ${shortLabel(end)}`;
  const heading = outline.week !== null ? `Week ${outline.week} of ${program!.weeks}` : `The week of ${shortLabel(start)}`;
  const subtitle = [
    outline.week !== null ? range : null,
    program?.name ?? null,
    outline.phase?.name ?? null,
    outline.isDeload ? 'Deload' : null,
    outline.test !== undefined ? 'Test week' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const count = describeWeekDays(outline, now);
  const parts = [...new Set(outline.days.flatMap((d) => d.load.parts))];

  return (
    <>
      <BackLink />
      <div className="flex items-center justify-between mb-4">
        <IconButton onClick={() => navigate(weekHref(addDays(start, -7)))} label="Previous week">
          <ArrowLeft size={18} />
        </IconButton>
        <div className="text-center min-w-0">
          <h1 className="text-xl font-black tracking-tight">{heading}</h1>
          <p className="text-sm text-ink-soft">{subtitle || range}</p>
        </div>
        <IconButton onClick={() => navigate(weekHref(addDays(start, 7)))} label="Next week">
          <ArrowLeft size={18} className="rotate-180" />
        </IconButton>
      </div>

      <WeekFacts outline={outline} program={program} startDate={startDate} planning={planning} count={count} />

      {movable && !rearranging && (
        <div className="flex justify-end mb-2">
          <Button size="sm" variant="ghost" onClick={() => setRearranging(true)}>
            <Move size={14} /> Rearrange
          </Button>
        </div>
      )}
      {rearranging && !moving && (
        <Card className="mb-3">
          <div className="flex items-start gap-2">
            <p className="text-sm flex-1">
              Tap a session to pick it up. Days already logged stay put — they are history, not a plan.
            </p>
            <Button size="sm" variant="outline" onClick={stopRearranging}>
              Done
            </Button>
          </div>
        </Card>
      )}
      {moving && (
        <Card className="mb-3">
          <div className="flex items-start gap-2">
            <Move size={16} className="text-accent shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                Moving {outline.days.find((d) => d.date === moving)?.day?.sessionType?.name}
              </p>
              <p className="text-xs text-ink-soft mt-0.5">
                Pick another day this week. Green is clear, amber is untidy, red breaks a rule.
              </p>
            </div>
            <IconButton onClick={() => setMoving(null)} label="Cancel move">
              <X size={16} />
            </IconButton>
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

      <Card>
        <ul className="grid grid-cols-1 gap-1">
          {outline.days.map((d) => (
            <DayRow
              key={d.date}
              d={d}
              today={now}
              mode={
                moving
                  ? d.date === moving
                    ? 'source'
                    : d.status === 'done' || d.status === 'started'
                      ? 'still'
                      : 'land'
                  : rearranging
                    ? d.day?.sessionType && !d.day.isRest && d.status !== 'done' && d.status !== 'started'
                      ? 'pick'
                      : 'still'
                    : 'link'
              }
              preview={previews?.[d.date]}
              onPick={() => setMoving(d.date)}
              onLand={() => land(d.date)}
              onCancel={() => setMoving(null)}
            />
          ))}
        </ul>
        {parts.length > 0 && (
          <p className="text-xs text-ink-soft mt-3 flex items-start gap-1.5">
            <AlertTriangle size={12} className="text-warn shrink-0 mt-0.5" />
            <span>Counts what that day loads of {describeParts(parts)}.</span>
          </p>
        )}
        {planning && !movable && !outline.before && !outline.over && (
          <p className="text-xs text-ink-soft mt-3">A finished week stays as it was — it is history, not a plan.</p>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-2 mt-3">
        <Link href="/calendar" className={ROW}>
          <CalendarDays size={16} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0 text-sm">The month</span>
          <ChevronRight size={16} className="text-ink-soft shrink-0" />
        </Link>
        {planning && (
          <>
            <Link href={`/train/${activeProgramId}/start`} className={ROW}>
              <Move size={16} className="text-accent shrink-0" />
              <span className="flex-1 min-w-0 text-sm">Change the shape of every week</span>
              <ChevronRight size={16} className="text-ink-soft shrink-0" />
            </Link>
            <Link href="/finish" className={ROW}>
              <Flag size={16} className="text-accent shrink-0" />
              <span className="flex-1 min-w-0 text-sm">The block, and how it is going</span>
              <ChevronRight size={16} className="text-ink-soft shrink-0" />
            </Link>
          </>
        )}
      </div>
    </>
  );
}

const ROW = 'focus-ring flex items-center gap-2 bg-surface border border-line rounded-2xl p-3';

/**
 * Where the block is this week, and what the week asks.
 *
 * Four states and the ordinary one: no program, a block not yet begun, a
 * block that has finished, and a week inside one. The calendar made the
 * first of these a dead end once (PLAN.md M45) — no program, no page — and
 * a week with sessions logged in it is a week, program or not.
 */
function WeekFacts({
  outline,
  program,
  startDate,
  planning,
  count,
}: {
  outline: WeekOutline;
  program: ReturnType<typeof getProgram>;
  startDate: string | undefined;
  planning: boolean;
  count: string | null;
}) {
  if (!planning) {
    return (
      <Card className="mb-3">
        <p className="text-sm text-ink-soft mb-3">
          No program is running, so this is your log for the week rather than a plan. Pick one and
          the days fill in around what you are already doing.
        </p>
        <Link href="/find" className="text-accent font-semibold text-sm">
          Find my program →
        </Link>
      </Card>
    );
  }
  if (outline.before) {
    return (
      <Card className="mb-3">
        <p className="text-sm text-ink-soft">
          {program!.name} has not started yet. Its first week begins{' '}
          {shortLabel(blockWindow(program!, startDate!).from)}.
        </p>
      </Card>
    );
  }
  if (outline.over) {
    return (
      <Card className="mb-3">
        <p className="text-sm text-ink-soft mb-3">
          {program!.name} has run its course. Nothing is planned this week until you pick what is next.
        </p>
        <Link href="/finish" className="text-accent font-semibold text-sm">
          See what the block moved →
        </Link>
      </Card>
    );
  }
  return (
    <Card className="mb-3">
      {count && <p className="text-sm font-semibold mb-2">{count}.</p>}
      {outline.isDeload && (
        <p className="text-sm text-ink-soft leading-relaxed mb-2 flex items-start gap-1.5">
          <TrendingDown size={14} className="text-accent shrink-0 mt-0.5" />
          {/* The derived deload says what it took; an authored one says it
              below, in the program's own words, and a marker over an
              unchanged dose is the fault M128 was built to end. */}
          <span>{outline.lightened ? DELOAD_STEP : 'Deload week.'}</span>
        </p>
      )}
      {outline.test !== undefined && (
        <Link href="/assessments" className="focus-ring text-sm leading-relaxed mb-2 flex items-start gap-1.5 rounded-lg">
          <Ruler size={14} className="text-accent shrink-0 mt-0.5" />
          <span>{TEST_REASON_LABEL[outline.test]}</span>
        </Link>
      )}
      {outline.steps.length > 0 && (
        <div className="mb-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">
            What this week asks that last week did not
          </h2>
          <ul className="grid grid-cols-1 gap-1.5">
            {outline.steps.map((s, i) => (
              <li key={`${s.type.id}-${i}`} className="text-sm leading-relaxed flex items-start gap-1.5">
                <TrendingUp size={14} className="text-accent shrink-0 mt-0.5" />
                <span>
                  <span className="font-semibold">{s.type.name}</span> — {s.step}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {outline.drills.length > 0 && (
        <p className="text-sm text-ink-soft">
          Drill this week:{' '}
          {outline.drills.map((d, i) => (
            <span key={d.drill.id}>
              {i > 0 && ', '}
              <Link href={`/drills/${d.drill.id}`} className="text-accent font-semibold">
                {d.drill.name}
              </Link>
              {outline.drills.length > 1 ? ` (${d.type.name})` : ''}
            </span>
          ))}
          .
        </p>
      )}
    </Card>
  );
}

/**
 * What a row is while the week is being rearranged: a door to the day, a
 * session that can be picked up, the one being moved, a day it can land
 * on — or none of those, in which case it is not a control at all. A
 * disabled button labelled *Move to Tuesday* on a day that cannot be landed
 * on is a promise a screen reader hears and cannot act on.
 */
type RowMode = 'link' | 'pick' | 'still' | 'source' | 'land';

/** What the day says at its right edge, or nothing. */
const STATUS: Record<WeekDay['status'], { text: string; tone: string } | null> = {
  done: { text: 'Done', tone: 'text-positive' },
  started: { text: 'Started', tone: 'text-accent' },
  missed: { text: 'Missed', tone: 'text-danger' },
  today: { text: 'Today', tone: 'text-accent' },
  planned: null,
  rest: null,
};

function DayRow({
  d,
  today,
  mode,
  preview,
  onPick,
  onLand,
  onCancel,
}: {
  d: WeekDay;
  today: string;
  mode: RowMode;
  preview: MovePreview | undefined;
  onPick: () => void;
  onLand: () => void;
  onCancel: () => void;
}) {
  const type = d.day?.sessionType;
  const training = type !== undefined && !d.day!.isRest;
  const status = STATUS[d.status];
  const intensity = training ? intensityOf(type) : null;
  const isToday = d.date === today;
  const weekday = fromKey(d.date).toLocaleDateString(undefined, { weekday: 'short' });

  // Folded into one class rather than stacked (the M100 lesson, recorded
  // on the calendar): a landing's tint and a source's tint both set a
  // border and a background, and the winner would be Tailwind's emit order.
  const edge =
    mode === 'source'
      ? 'border-accent bg-accent/25'
      : mode === 'land' && preview
        ? preview.blocking.length > 0
          ? 'border-danger/60 bg-danger/10'
          : preview.introduced.length > 0
            ? 'border-warn/60 bg-warn/10'
            : 'border-positive/60 bg-positive/10'
        : mode === 'pick'
          ? 'border-accent/60 bg-accent/5'
          : mode === 'still'
            ? 'border-line opacity-60'
            : isToday
              ? 'border-accent'
              : 'border-line';

  const body = (
    <>
      <span className="w-12 shrink-0 text-left">
        <span className={`block text-xs ${isToday ? 'font-black text-accent' : 'text-ink-soft'}`}>{weekday}</span>
        <span className="block text-xs text-ink-soft">{fromKey(d.date).getDate()}</span>
      </span>
      <span className="text-base leading-none shrink-0" aria-hidden="true">
        {training ? type.icon : '·'}
      </span>
      <span className="flex-1 min-w-0 text-left">
        <span className={`block text-sm ${training ? 'font-semibold' : 'text-ink-soft'}`}>
          {training ? type.name : 'Rest'}
        </span>
        {training && (
          <span className="block text-xs text-ink-soft">
            {/* The limit day, marked as the calendar marks it (PLAN.md
                M131): the one thing a climber most wants to see in a week
                at a glance. */}
            <span className={intensity === 'max' ? 'text-warn font-bold' : ''}>{INTENSITY_LABEL[intensity!]}</span>
            {d.spent ? ` · ${d.spent}` : ''}
            {d.day!.drill ? ` · ${d.day!.drill.name}` : ''}
          </span>
        )}
      </span>
      {d.load.conflicts.length > 0 && (
        <span className="text-warn text-xs flex items-center gap-1 shrink-0 tabular-nums">
          <AlertTriangle size={12} aria-hidden="true" />
          <span aria-hidden="true">{d.load.conflicts.length}</span>
          <span className="sr-only">{describeDayLoad(d.load)}</span>
        </span>
      )}
      {status && (
        <span className={`text-xs font-semibold shrink-0 flex items-center gap-1 ${status.tone}`}>
          {d.status === 'done' && <Check size={12} aria-hidden="true" />}
          {status.text}
        </span>
      )}
    </>
  );

  const shell = `focus-ring w-full flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${edge}`;

  if (mode === 'link') {
    return (
      <li>
        <Link href={logHref(d.date)} className={shell}>
          {body}
          <ChevronRight size={14} className="text-ink-soft shrink-0" />
        </Link>
      </li>
    );
  }
  if (mode === 'still') {
    return (
      <li>
        <div className={shell}>{body}</div>
      </li>
    );
  }
  const label =
    mode === 'source'
      ? `Cancel moving ${type?.name ?? 'session'}`
      : mode === 'land'
        ? `Move to ${shortLabel(d.date)}`
        : `Move ${type?.name ?? 'session'} from ${shortLabel(d.date)}`;
  return (
    <li>
      <button
        type="button"
        className={shell}
        aria-label={label}
        onClick={mode === 'source' ? onCancel : mode === 'land' ? onLand : onPick}
      >
        {body}
      </button>
    </li>
  );
}
