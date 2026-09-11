import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, Clock, Copy, Flame, Plus, RotateCw, Sparkles, Timer, Trash2, TrendingUp, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getProtocol } from '@/content/protocols';
import { SCALE_MAX, getField, type FieldSpec } from '@/content/fields';
import type { FieldId, SessionType } from '@/content/types';
import { addDays, fromKey, isDateKey, shortLabel, today } from '@/engine/dates';
import { clearTimerState, loadTimerState, saveTimerState } from '@/lib/timerState';
import { ClimbEntry, RepeatLast, type Outcome } from './ClimbEntry';
import { sessionOwner } from '@/db/media';
import { MediaCard } from '@/features/media/MediaCard';
import { offerUndo } from '@/store/undo';
import { rankFor } from '@/engine/economy';
import { useSettings } from '@/store/settings';
import type { SessionXp } from '@/engine/xp';
import {
  announcementFor,
  headlineMilestone,
  recordsInReward,
  sessionMilestones,
  type Milestone,
  type MilestoneKind,
} from '@/engine/milestones';
import { recordCard } from '@/ui/shareCard';
import { useClimberAvatar } from '@/ui/useClimberAvatar';
import { ShareButton } from '@/features/share/ShareSheet';
import {
  describeSpan,
  durationFromSpan,
  elapsedMs,
  formatClock,
  isLive,
  isStale,
} from '@/engine/live';
import { plannedDay, prescriptionFor } from '@/engine/plan';
import { DEFAULT_TARGET_SECONDS, focusFor, generateWarmup, type WarmupPlan } from '@/engine/warmup';
import { V_GRADES, YDS_GRADES, displayGrade, type GradeScale } from '@/engine/grades';
import type { Climb, ProjectAttempt, Session } from '@/db/sessions';
import type { AttemptOutcome } from '@/db/projects';
import { OUTCOME_HIGH_POINT } from '@/engine/projects';
import { useXp } from '@/store/game';
import { useProjects } from '@/store/projects';
import { useSkillEffects } from '@/store/skills';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { useTemplates } from '@/store/templates';
import { parseCount } from '@/content/types';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox, Input, Select, TextArea } from '@/ui/Field';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { announce } from '@/ui/Announce';
import { Term } from '@/ui/Term';
import { TimerSheet } from '@/ui/TimerSheet';
import {useGradeLabel} from '@/ui/useGrade';
import { alreadySaved, applyTemplate, rankTemplates, suggestName } from '@/engine/templates';
import { canMerge, describeSession } from '@/engine/sessionEdit';
import { concerning, injuryPolicy } from '@/engine/injury';
import {
  FINGER_ANSWERS,
  FINGER_CHIP,
  SLEEP_ANSWERS,
  SLEEP_CHIP,
  readinessFor,
  type CheckIn,
  type ReadinessCall,
} from '@/engine/readiness';
import { describeParts, drillConflict, exerciseConflict, exerciseLoads } from '@/engine/bodyLoad';
import { BadParameter } from '@/ui/RecordNotFound';

const REST_ITEMS = [
  { key: 'hydration', label: 'Hydration' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'zone1', label: 'Walking / Zone 1' },
  { key: 'sleep', label: 'Sleep 8+ hrs' },
] as const;

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * The date has to be a date before anything else happens (PLAN.md M42).
 *
 * A wrapper rather than an early return inside the page: the page runs
 * twenty-odd hooks off this value, and hooks cannot be skipped. This way the
 * page is never mounted with a date that is not one.
 */
export function LogPage({ params }: { params: { date: string } }) {
  if (!isDateKey(params.date)) {
    return (
      <BadParameter expected="a date, like 2026-09-10" got={params.date} goTo={`/log/${today()}`} goLabel="Go to today">
        Dates are written year, month, day, with both the month and the day padded to two digits.
      </BadParameter>
    );
  }
  return <LogDay date={params.date} />;
}

function LogDay({ date }: { date: string }) {
  const [, navigate] = useLocation();

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const tracks = useProfile((s) => s.tracks);

  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const create = useSessions((s) => s.create);
  const update = useSessions((s) => s.update);
  const remove = useSessions((s) => s.remove);
  const restore = useSessions((s) => s.restore);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;
  const trackId = activeProgramId ? tracks[activeProgramId] : undefined;

  const day = useMemo(
    () => (program && startDate && plan ? plannedDay(program, startDate, plan, date, overrides) : undefined),
    [program, startDate, plan, date],
  );

  const sessions = byDate[date] ?? [];
  // A day can hold several sessions — the schema always allowed it, nextIndex
  // hands out the slots, and templates create them. Showing only the first
  // made the rest invisible, which reads as data loss.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  async function startSession(sessionTypeId?: string) {
    await create(date, {
      // A clock only makes sense on the day it is ticking through. Logging
      // Tuesday's session on Thursday has nothing to time.
      ...(date === today() ? { startedAt: new Date().toISOString() } : {}),
      ...(activeProgramId ? { programId: activeProgramId } : {}),
      ...(sessionTypeId ? { sessionTypeId } : {}),
      ...(trackId ? { trackId } : {}),
      ...(day?.drill ? { drillId: day.drill.id } : {}),
      ...(day?.isDeload ? { deload: true } : {}),
      planned: Boolean(day?.sessionType),
    });
  }

  const heading = fromKey(date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <>
      <BackLink />

      <div className="flex items-center justify-between mb-4">
        <IconButton onClick={() => navigate(`/log/${addDays(date, -1)}`)} label="Previous day">
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
        <IconButton onClick={() => navigate(`/log/${addDays(date, 1)}`)} label="Next day">
          <ArrowLeft size={18} className="rotate-180" />
        </IconButton>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {!session && (
          <>
            {day?.sessionType && !day.isRest ? (
              <Card>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-lg leading-none">{day.sessionType.icon}</span>
                  <h2 className="font-bold">{day.sessionType.name}</h2>
                </div>
                <p className="text-sm text-ink-soft mb-3">Planned for today.</p>
                <Button className="w-full" onClick={() => void startSession(day.sessionType!.id)}>
                  Start this session
                </Button>
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-ink-soft mb-3">
                  {day?.isRest && day.week ? 'Rest day. Log it to bank the recovery.' : 'Nothing planned.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {program?.sessionTypes.map((t) => (
                    <Button key={t.id} size="sm" variant="outline" onClick={() => void startSession(t.id)}>
                      {t.icon} {t.name}
                    </Button>
                  ))}
                  {!program && (
                    <Button size="sm" onClick={() => void startSession()}>
                      <Plus size={15} /> Log a session
                    </Button>
                  )}
                </div>
              </Card>
            )}

            <TemplatePicker date={date} onApplied={() => undefined} />

            {day?.drill && (
              <Card title="Drill this week">
                <div className="font-semibold text-sm mb-1">{day.drill.name}</div>
                <p className="text-sm text-ink-soft leading-relaxed">{day.drill.description}</p>
                <p className="text-xs text-ink-soft/80 mt-2 flex items-center gap-1.5">
                  <Clock size={11} /> {day.drill.duration} · {day.drill.focus}
                </p>
              </Card>
            )}
          </>
        )}

        {sessions.length > 1 && session && (
          <SessionSwitcher
            sessions={sessions}
            current={session}
            program={program}
            onSelect={setSelectedId}
          />
        )}

        {session && (
          <SessionEditor
            key={session.id}
            session={session}
            program={program}
            day={day}
            trackId={trackId}
            others={sessions.filter((s) => s.id !== session.id)}
            onChange={(s) => void update(s)}
            onDelete={() => {
              const deleted = session;
              void remove(deleted).then(() =>
                offerUndo(`${fromKey(deleted.date).toLocaleDateString(undefined, { weekday: 'long' })}'s session`, () =>
                  restore(deleted),
                ),
              );
            }}
            onMoved={(s) => setSelectedId(s.id)}
          />
        )}

        {session && sessions.length < 4 && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => void startSession(day?.sessionType?.id)}
          >
            <Plus size={15} /> Add another session today
          </Button>
        )}
      </div>
    </>
  );
}

function WarmupCard({
  session,
  day,
  onWarmedUp,
}: {
  session: Session;
  day: ReturnType<typeof plannedDay> | undefined;
  onWarmedUp: () => void;
}) {
  const equipment = useProfile((s) => s.equipment);
  const injuries = useProfile((s) => s.injuries);
  const recentWarmups = useProfile((s) => s.recentWarmups);
  const rememberWarmup = useProfile((s) => s.rememberWarmup);
  const variety = useSkillEffects().warmupVariety;
  const [plan, setPlan] = useState<WarmupPlan | null>(null);

  function build(seed?: number) {
    const next = generateWarmup({
      equipment,
      // Only what load should stay off; a niggle or a part in its return
      // is flagged elsewhere rather than stripped out of the warmup.
      injuries: injuryPolicy(injuries).excluded,
      recent: recentWarmups,
      ...(focusFor(day?.sessionType, day?.phase?.name) ? { focus: focusFor(day?.sessionType, day?.phase?.name)! } : {}),
      climbing: Boolean(day?.sessionType && !day.isRest),
      // Skill-tree variety perks buy a longer, richer warmup.
      targetSeconds: DEFAULT_TARGET_SECONDS + variety * 60,
      ...(seed !== undefined ? { seed } : {}),
    });
    setPlan(next);
    rememberWarmup(next.exercises.map((e) => e.id));
  }

  return (
    <Card title="Warmup">
      {!plan ? (
        <>
          <p className="text-sm text-ink-soft mb-3">
            {injuryPolicy(injuries).excluded.length > 0
              ? `Built around your ${injuryPolicy(injuries).excluded.join(' and ')} — nothing that loads it.`
              : 'A warmup built for today\u2019s session, varied from your recent ones.'}
          </p>
          <Button variant="outline" className="w-full" onClick={() => build()}>
            <Flame size={16} /> Build me a warmup
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-ink-soft">
              {Math.round(plan.totalSeconds / 60)} min · {plan.exercises.length} exercises
            </span>
            <Button variant="ghost" size="sm" onClick={() => build(Math.floor(Math.random() * 1_000_000))} className="text-accent">
              <RotateCw size={14} /> Swap
            </Button>
          </div>

          {plan.injuryFilterRelaxed && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              Everything available loads something you have injured. Go gently, or skip the warmup and
              rest instead.
            </p>
          )}

          <ol className="grid grid-cols-1 gap-2 mb-3">
            {plan.exercises.map((e, i) => (
              <li key={e.id} className="bg-sunken rounded-xl p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-ink-soft">{i + 1}</span>
                  <span className="font-semibold text-sm flex-1">{e.name}</span>
                  <span className="text-xs text-ink-soft">
                    {e.seconds >= 60 ? `${Math.round(e.seconds / 60)} min` : `${e.seconds}s`}
                  </span>
                </div>
                <p className="text-sm text-ink-soft mt-1 leading-relaxed">{e.description}</p>
              </li>
            ))}
          </ol>

          {plan.excluded.length > 0 && (
            <p className="text-xs text-ink-soft mb-3">
              Left out because of your injuries:{' '}
              {[...new Set(plan.excluded.map((x) => x.exercise.name))].join(', ')}.
            </p>
          )}

          {!session.warmup && (
            <Button variant="outline" size="sm" className="w-full" onClick={onWarmedUp}>
              <Check size={15} /> Done — mark warmed up
            </Button>
          )}
        </>
      )}
    </Card>
  );
}

function SessionEditor({
  session,
  program,
  day,
  trackId,
  others,
  onChange,
  onDelete,
  onMoved,
}: {
  session: Session;
  program: ReturnType<typeof getProgram>;
  day: ReturnType<typeof plannedDay> | undefined;
  trackId: string | undefined;
  /** The day's other sessions, which this one can be merged into. */
  others: Session[];
  onChange: (s: Session) => void;
  onDelete: () => void;
  onMoved: (s: Session) => void;
}) {
  const type = program?.sessionTypes.find((t) => t.id === session.sessionTypeId);
  const gradeLabel = useGradeLabel();
  const isRest = type?.isRest === true;
  const patch = (p: Partial<Session>) => onChange({ ...session, ...p });

  // Everything worth marking: what load should stay off, plus what is being
  // loaded again on purpose and wants watching.
  const editorInjuries = useProfile((s) => s.injuries);
  const hurtParts = useMemo(() => concerning(injuryPolicy(editorInjuries)), [editorInjuries]);

  const [now, setNow] = useState(() => Date.now());
  const live = isLive(session);

  // The most recent completed session before this one, for "same as last
  // time". Read from the store rather than passed down: `others` is only
  // this day's sessions, and the last one was almost certainly another day.
  const allByDate = useSessions((s) => s.byDate);
  const previousClimbs = useMemo(() => {
    const before = Object.values(allByDate)
      .flat()
      .filter((s) => s.completed && s.id !== session.id && s.date <= session.date && s.climbs.length > 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    if (!before) return null;
    return {
      // Names are dropped on purpose — see RepeatLast.
      climbs: before.climbs.map(({ name: _name, ...rest }) => rest),
      label: fromKey(before.date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }),
    };
  }, [allByDate, session.id, session.date]);
  const stale = isStale(session, now);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  const elapsed = elapsedMs(session, now);

  /** Close the session, and let the clock fill in the duration if it can. */
  function complete() {
    if (!session.startedAt || session.endedAt) {
      patch({ completed: true });
      return;
    }
    const endedAt = new Date().toISOString();
    const measured = durationFromSpan(elapsedMs({ ...session, endedAt }));
    patch({
      completed: true,
      endedAt,
      // Never overwrite a duration typed by hand, and never invent one from
      // a span the clock does not believe.
      ...(session.durationMin === undefined && measured !== undefined
        ? { durationMin: measured }
        : {}),
    });
  }

  /**
   * Reopening is an edit, not a resumption. Leaving the start time in place
   * would make yesterday's corrected session look abandoned an hour later.
   */
  function reopen() {
    const { startedAt: _s, endedAt: _e, ...rest } = session;
    onChange({ ...rest, completed: false, rewarded: false });
  }

  const [scale, setScale] = useState<GradeScale>('V');
  const [grade, setGrade] = useState('V3');
  // One control instead of two: style is part of how a climb went, and a
  // separate selector for it would not survive a phone-width row.
  const [outcome, setOutcome] = useState<Outcome>('send');
  const [climbName, setClimbName] = useState('');
  const [timer, setTimer] = useState<{
    protocolId: string;
    name: string;
    sets: number;
    override?: Partial<import('@/content/types').ProtocolTimer>;
  } | null>(null);

  // A timer left running when the page went away comes back where it was —
  // the M19 finding: this was component state and nothing else, so a refresh
  // or a phone reclaiming the tab restarted a hangboard protocol from set one.
  const [resume, setResume] = useState<{ baseElapsed: number; startedAt: number | null }>();
  useEffect(() => {
    const saved = loadTimerState(session.id);
    if (!saved) return;
    const protocol = getProtocol(saved.protocolId);
    if (!protocol) return;
    setResume({ baseElapsed: saved.baseElapsed, startedAt: saved.startedAt });
    setTimer({ protocolId: saved.protocolId, name: saved.exerciseName, sets: saved.sets });
  }, [session.id]);

  const doneExercises = session.completedExercises ?? [];
  const markExerciseDone = (name: string) =>
    patch({
      completedExercises: doneExercises.includes(name)
        ? doneExercises.filter((n) => n !== name)
        : [...doneExercises, name],
    });

  function addClimb() {
    const name = climbName.trim();
    const result: Climb['result'] = outcome === 'attempt' ? 'attempt' : 'send';
    const style = outcome === 'onsight' || outcome === 'flash' ? outcome : undefined;
    // A named climb never merges into an unnamed tally — the name is what
    // makes project auto-suggest possible — and nor do two different styles.
    const existing = session.climbs.find(
      (c) =>
        c.grade === grade &&
        c.scale === scale &&
        c.result === result &&
        c.style === style &&
        (c.name ?? '') === name,
    );
    const climbs = existing
      ? session.climbs.map((c) => (c === existing ? { ...c, count: c.count + 1 } : c))
      : [
          ...session.climbs,
          {
            id: rid(),
            grade,
            scale,
            count: 1,
            result,
            ...(style ? { style } : {}),
            ...(name ? { name } : {}),
          } as Climb,
        ];
    patch({ climbs });
    setClimbName('');
  }

  function bump(climb: Climb, by: number) {
    const next = climb.count + by;
    patch({
      climbs:
        next <= 0
          ? session.climbs.filter((c) => c.id !== climb.id)
          : session.climbs.map((c) => (c.id === climb.id ? { ...c, count: next } : c)),
    });
  }

  const blocks = type && day?.phase ? prescriptionFor(type, day.phase, trackId) : [];
  // What today actually loads, so the check-in does not tell a climber on a
  // legs-and-core day to leave the fingerboard alone.
  const loads = type
    ? [...new Set(blocks.flatMap((b) => b.entry.exercises).flatMap(exerciseLoads))]
    : undefined;
  const readiness = session.checkIn
    ? readinessFor(session.checkIn, { ...(loads ? { loads } : {}), test: day?.test !== undefined })
    : null;

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg leading-none">{type?.icon ?? '🧗'}</span>
            <h2 className="font-bold">{type?.name ?? 'Session'}</h2>
          </div>
          <IconButton onClick={onDelete} label="Delete session">
            <Trash2 size={16} />
          </IconButton>
        </div>
        {session.completed ? (
          <p className="text-sm text-positive flex items-center gap-1.5">
            <Check size={15} /> Logged
            {session.endedAt && (
              <span className="text-ink-soft font-normal">· {describeSpan(elapsed)} on the clock</span>
            )}
          </p>
        ) : live && !stale ? (
          <p className="flex items-center gap-2 text-sm">
            <span className="relative flex size-2.5">
              <span className="absolute inset-0 rounded-full bg-accent/60 animate-ping" />
              <span className="relative size-2.5 rounded-full bg-accent" />
            </span>
            <span className="text-ink-soft">Live</span>
            <span className="font-bold tabular-nums text-base">{formatClock(elapsed)}</span>
          </p>
        ) : (
          <p className="text-sm text-ink-soft">In progress — fill in what you did, then mark it complete.</p>
        )}
      </Card>

      {stale && (
        <Card>
          <div className="flex items-baseline gap-2 mb-1.5">
            <AlertTriangle size={15} className="text-warn shrink-0 translate-y-0.5" />
            <h3 className="font-bold text-sm">This session was left open</h3>
          </div>
          <p className="text-sm text-ink-soft leading-relaxed mb-3">
            The clock has been running for {describeSpan(elapsed)}
            {durationFromSpan(elapsed) === undefined
              ? ', which is too long to record as training. Finish it and set the duration yourself, or throw it away.'
              : '. Finish it to keep what you logged, or throw it away.'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={complete}>
              <Check size={15} /> Finish it
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}>
              <Trash2 size={15} /> Discard
            </Button>
          </div>
        </Card>
      )}

      {isRest ? (
        <Card title="Recovery checklist">
          <div className="grid grid-cols-1 gap-2">
            {REST_ITEMS.map((item) => {
              const checked = session.restChecklist?.[item.key] ?? false;
              return (
                <Checkbox
                  key={item.key}
                  checked={checked}
                  onChange={() =>
                    patch({
                      restChecklist: {
                        hydration: false,
                        mobility: false,
                        zone1: false,
                        sleep: false,
                        ...session.restChecklist,
                        [item.key]: !checked,
                      },
                    })
                  }
                  label={item.label}
                  className="rounded-xl px-3 py-2.5 border border-line bg-sunken items-center"
                />
              );
            })}
          </div>
        </Card>
      ) : (
        <>
          <CheckInCard
            checkIn={session.checkIn}
            readiness={readiness}
            onAnswer={(checkIn) => patch({ checkIn })}
          />

          <Card title="Climbs">
            <ClimbEntry
              scale={scale}
              grade={grade}
              outcome={outcome}
              onScale={setScale}
              onGrade={setGrade}
              onOutcome={setOutcome}
              onAdd={addClimb}
            />

            <Input
              value={climbName}
              onChange={(e) => setClimbName(e.target.value)}
              placeholder="Name it (optional) — named climbs can become projects"
              aria-label="Climb name"
              className="mb-3"
            />

            {session.climbs.length === 0 ? (
              <RepeatLast
                previous={previousClimbs}
                onRepeat={(climbs) => patch({ climbs: climbs as Climb[] })}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {session.climbs.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2">
                    <span className="font-bold text-sm w-14">{gradeLabel(c.scale, c.grade)}</span>
                    <span className="text-xs text-ink-soft flex-1 truncate">
                      {c.name ? `${c.name} · ` : ''}
                      {c.result === 'attempt'
                        ? 'tried'
                        : c.style === 'onsight'
                          ? 'on-sight'
                          : c.style === 'flash'
                            ? 'flashed'
                            : 'sent'}
                    </span>
                    <IconButton onClick={() => bump(c, -1)} label={`One fewer ${c.grade}`} className="border border-line bg-surface" inline={false}>
                      −
                    </IconButton>
                    <span className="w-6 text-center font-semibold text-sm">{c.count}</span>
                    <IconButton onClick={() => bump(c, 1)} label={`One more ${c.grade}`} className="border border-line bg-surface" inline={false}>
                      +
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <FieldsCard session={session} type={type} onChange={onChange} />

          <ProjectBurnsCard session={session} onChange={onChange} />

          {blocks.length > 0 && (
            <Card title="Today's prescription">
              {blocks.map((b) => (
                <div key={b.blockId} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-1.5">{b.name}</h4>
                  <ul className="grid grid-cols-1 gap-2">
                    {b.entry.exercises.map((ex, i) => {
                      const protocol = ex.protocolId ? getProtocol(ex.protocolId) : undefined;
                      const isDone = doneExercises.includes(ex.name);
                      return (
                        <li
                          key={`${ex.name}-${i}`}
                          className="flex items-start gap-2 bg-sunken rounded-xl px-3 py-2.5"
                        >
                          <Checkbox
                            checked={isDone}
                            onChange={() => markExerciseDone(ex.name)}
                            label={<span className="sr-only">Mark {ex.name} done</span>}
                            className="shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-sm ${isDone ? 'line-through opacity-60' : ''}`}>
                              <Term name={ex.name} />
                            </div>
                            <div className="text-ink-soft text-xs">
                              {[ex.sets && `${ex.sets} sets`, ex.reps, ex.hold, ex.load, ex.rest && `${ex.rest} rest`]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            {ex.notes && <div className="text-ink-soft/80 text-xs italic mt-0.5">{ex.notes}</div>}
                            {(() => {
                              // Advisory, never a refusal to show the program.
                              const clash = exerciseConflict(ex, hurtParts);
                              if (clash) {
                                return (
                                  <div className="text-warn text-xs mt-1 flex items-start gap-1.5">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    <span>
                                      Loads {describeParts(clash.parts)} — {clash.because}.
                                    </span>
                                  </div>
                                );
                              }
                              // One warning a line. An injury is a standing
                              // condition and today's check-in is not; saying
                              // both on the same exercise makes the first mean
                              // less, and the injury is the one that outranks.
                              const today = readiness ? exerciseConflict(ex, readiness.flag) : null;
                              return today ? (
                                <div className="text-accent text-xs mt-1 flex items-start gap-1.5">
                                  <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                  <span>
                                    {readiness!.flagBecause} — {today.because}.
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                          {protocol?.timer && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setTimer({
                                  protocolId: protocol.id,
                                  name: ex.name,
                                  sets: parseCount(ex.sets) ?? 1,
                                })
                              }
                              className="shrink-0 text-xs font-bold uppercase tracking-wide text-accent border-accent/40"
                            >
                              <Timer size={13} />
                              Timer
                            </Button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </Card>
          )}

          {day?.drill && (
            <Card title="Drill">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm">{day.drill.name}</div>
                  <p className="text-xs text-ink-soft mt-0.5">
                    {day.drill.duration} · {day.drill.focus}
                  </p>
                </div>
                <Chip
                  active={Boolean(session.drillDone)}
                  onClick={() => patch({ drillDone: !session.drillDone })}
                  className="shrink-0 text-xs font-bold uppercase tracking-wide"
                >
                  {session.drillDone ? 'Done' : 'Mark done'}
                </Chip>
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">{day.drill.description}</p>
              {(() => {
                const clash = drillConflict(day.drill!, hurtParts);
                return clash ? (
                  <p className="text-warn text-xs mt-2 flex items-start gap-1.5">
                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                    <span>
                      Loads {describeParts(clash.parts)} — {clash.because}.
                    </span>
                  </p>
                ) : null;
              })()}
              {(() => {
                const protocol = day.drill.protocolId ? getProtocol(day.drill.protocolId) : undefined;
                if (!protocol?.timer) return null;
                return (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setTimer({
                        protocolId: protocol.id,
                        name: day.drill!.name,
                        sets: day.drill!.timerOverride?.sets ?? 2,
                        ...(day.drill!.timerOverride ? { override: day.drill!.timerOverride } : {}),
                      })
                    }
                    className="mt-3 text-accent"
                  >
                    <Timer size={15} /> Open the {protocol.name} timer
                  </Button>
                );
              })()}
            </Card>
          )}

          <WarmupCard session={session} day={day} onWarmedUp={() => patch({ warmup: true })} />

          <Card title="Effort">
            <div className="mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-ink-soft">RPE</span>
                <span className="font-bold">{session.rpe ?? '—'}</span>
              </div>
              <div className="grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <Chip
                    key={n}
                    active={session.rpe === n}
                    onClick={() => patch({ rpe: n })}
                    className="justify-center text-center px-0 text-xs"
                  >
                    {n}
                  </Chip>
                ))}
              </div>
              {readiness?.cap !== null && readiness !== null && (
                // Said, not enforced. The climber gets to log what the
                // session actually was, including that they ignored this.
                <p className="text-xs text-ink-soft mt-1.5">
                  {readiness.because} — the check-in suggested {readiness.cap} or below.
                </p>
              )}
            </div>
            <label className="text-sm block mb-3">
              <span className="block text-ink-soft mb-1">Duration (minutes)</span>
              <Input
                type="number"
                inputMode="numeric"
                value={session.durationMin ?? ''}
                placeholder={live && !stale ? 'From the clock when you finish' : ''}
                onChange={(e) => patch({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
                
              />
            </label>
            <Chip
              active={Boolean(session.warmup)}
              onClick={() => patch({ warmup: !session.warmup })}
              className="w-full"
            >
              {session.warmup ? '✓ Warmed up' : 'Did you warm up?'}
            </Chip>
          </Card>
        </>
      )}

      <Card title="Notes">
        <TextArea
          value={session.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          placeholder="How did it feel? What worked?"
          className="resize-y"
        />
      </Card>

      {/* After the notes, because a photo is the other half of what the
          notes are for (PLAN.md M30). Keyed on the session id, which the
          date is part of — `sessions.move` and `sessions.merge` carry the
          pictures across when that id changes. */}
      <MediaCard
        owner={sessionOwner(session.id)}
        blurb="The board you set, the wall on a trip, the sequence you want to remember. Photos are resized on the way in and live on this device — they go into a backup with everything else."
        fullNote="That is the limit for one session. Delete one to add another — storage here is finite and nothing is backed up anywhere but your own export."
      />

      {timer && (
        <TimerSheet
          protocol={getProtocol(timer.protocolId)!}
          sets={timer.sets}
          {...(timer.override ? { override: timer.override } : {})}
          exerciseName={timer.name}
          resume={resume}
          onPersist={(state) =>
            saveTimerState({
              protocolId: timer.protocolId,
              exerciseName: timer.name,
              sets: timer.sets,
              sessionId: session.id,
              ...state,
            })
          }
          onClose={() => {
            clearTimerState();
            setResume(undefined);
            setTimer(null);
          }}
          onComplete={() => {
            clearTimerState();
            if (!doneExercises.includes(timer.name)) markExerciseDone(timer.name);
          }}
        />
      )}

      {session.completed && (
        <RewardCard session={session} onAcknowledge={() => patch({ rewarded: true })} />
      )}

      {session.completed && <SaveTemplateCard session={session} typeName={type?.name} />}

      <CorrectionCard session={session} others={others} typeName={type?.name} onMoved={onMoved} />

      {session.completed ? (
        <Button
          variant="outline"
          className="w-full"
          // Reopening clears the acknowledgement: if the session changes, the
          // climber should see the new total rather than the old one.
          onClick={reopen}
        >
          <X size={16} /> Reopen session
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={complete}>
          <Check size={18} /> Mark complete
        </Button>
      )}
    </>
  );
}

export function TodayRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate(`/log/${today()}`, { replace: true });
  }, [navigate]);
  return null;
}

const OUTCOMES: { value: AttemptOutcome; label: string }[] = [
  { value: 'worked', label: 'Worked' },
  { value: 'fell-low', label: 'Low' },
  { value: 'fell-mid', label: 'Mid' },
  { value: 'fell-high', label: 'High' },
  { value: 'fell-crux', label: 'Crux' },
  { value: 'send', label: 'Sent' },
];

/**
 * Burns on your active projects, logged where they happened.
 *
 * The session owns the attempt; the project's totals, high point and status
 * are all derived from it (engine/projects.ts). Logging a send here is what
 * flips the project to sent — via reconciliation, once, on the next write.
 */
/**
 * The extra questions this session type asks (PLAN.md M70).
 *
 * Nine programs declare `fields` on their session types and nothing ever
 * rendered one: Outdoor Climbing asks every session where it happened, how
 * many attempts and what the high point was, and the logger never put any of
 * it on screen. A question the content asks and the app never shows is a
 * promise the content cannot keep.
 *
 * Sparse on purpose — clearing an answer removes it rather than storing an
 * empty string, so a session never claims a blank it was not given.
 */
/**
 * The readiness check-in (PLAN.md M72).
 *
 * Two questions, above the session, and no insistence: leave them and the
 * card is three lines of chips that do nothing. The readout appears only
 * once both are answered, because a check-in with one answer is not a
 * check-in — and guessing the missing half as "fine" would put words in the
 * climber's mouth and then advise them on it.
 *
 * Everything it decides is shown somewhere it bites: the ceiling next to the
 * RPE chips, the flags on the prescription lines that load the part. The
 * card itself only says what the rules made of the answers.
 */
const CALL_TONE: Record<ReadinessCall, string> = {
  full: 'text-positive',
  adjusted: 'text-accent',
  easy: 'text-warn',
};

function CheckInCard({
  checkIn,
  readiness,
  onAnswer,
}: {
  checkIn?: CheckIn;
  readiness: ReturnType<typeof readinessFor> | null;
  onAnswer: (checkIn: CheckIn) => void;
}) {
  const [draft, setDraft] = useState<Partial<CheckIn>>(checkIn ?? {});

  function pick(patch: Partial<CheckIn>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.fingers && next.sleep) onAnswer(next as CheckIn);
  }

  return (
    <Card title="Before you start">
      <fieldset className="mb-3">
        <legend className="text-sm text-ink-soft mb-1.5">How do the fingers feel?</legend>
        <div className="grid grid-cols-3 gap-2">
          {FINGER_ANSWERS.map((answer) => (
            <Chip
              key={answer}
              active={draft.fingers === answer}
              onClick={() => pick({ fingers: answer })}
              className="justify-center text-center px-1"
            >
              {FINGER_CHIP[answer]}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-sm text-ink-soft mb-1.5">How was the sleep?</legend>
        <div className="grid grid-cols-3 gap-2">
          {SLEEP_ANSWERS.map((answer) => (
            <Chip
              key={answer}
              active={draft.sleep === answer}
              onClick={() => pick({ sleep: answer })}
              className="justify-center text-center px-1"
            >
              {SLEEP_CHIP[answer]}
            </Chip>
          ))}
        </div>
      </fieldset>

      {readiness && (
        <div className="mt-3 pt-3 border-t border-line">
          <p className={`font-bold text-sm ${CALL_TONE[readiness.call]}`}>{readiness.headline}</p>
          <p className="text-xs text-ink-soft mt-0.5">{readiness.because}</p>
          {readiness.advice.length > 0 && (
            <ul className="mt-2 grid grid-cols-1 gap-1.5">
              {readiness.advice.map((line) => (
                <li key={line} className="text-sm leading-relaxed text-ink-soft">
                  {line}
                </li>
              ))}
            </ul>
          )}
          {readiness.deferTest && (
            <p className="text-warn text-xs mt-2 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              <span>Let the test wait for a better day. {readiness.deferTest}</span>
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function FieldsCard({
  session,
  type,
  onChange,
}: {
  session: Session;
  type?: SessionType;
  onChange: (session: Session) => void;
}) {
  const display = useSettings((s) => s.display);
  const specs = (type?.fields ?? []).map(getField).filter((f): f is FieldSpec => f !== undefined);
  if (specs.length === 0) return null;

  const set = (id: FieldId, value: string | number | undefined) => {
    const { [id]: _dropped, ...rest } = session.fields ?? {};
    const fields = value === undefined || value === '' ? rest : { ...rest, [id]: value };
    onChange({
      ...session,
      ...(Object.keys(fields).length > 0 ? { fields } : { fields: undefined }),
    });
  };

  return (
    <Card title="This session">
      <div className="grid grid-cols-1 gap-3">
        {specs.map((spec) => {
          const value = session.fields?.[spec.id];
          if (spec.kind === 'scale') {
            return (
              <div key={spec.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-ink-soft">{spec.label}</span>
                  <span className="font-bold">{value ?? '—'}</span>
                </div>
                <div className="grid grid-cols-10 gap-1">
                  {Array.from({ length: SCALE_MAX }, (_, i) => i + 1).map((n) => (
                    <Chip
                      key={n}
                      active={value === n}
                      onClick={() => set(spec.id, value === n ? undefined : n)}
                      className="justify-center text-center px-0 text-xs"
                    >
                      {n}
                    </Chip>
                  ))}
                </div>
                {spec.ends && (
                  <div className="flex justify-between text-2xs text-ink-soft mt-1">
                    <span>{spec.ends[0]}</span>
                    <span>{spec.ends[1]}</span>
                  </div>
                )}
              </div>
            );
          }

          if (spec.kind === 'grade') {
            const ladder = spec.scale === 'route' ? YDS_GRADES : V_GRADES;
            return (
              <label key={spec.id} className="text-sm block">
                <span className="block text-ink-soft mb-1">{spec.label}</span>
                <Select
                  value={String(value ?? '')}
                  onChange={(e) => set(spec.id, e.target.value || undefined)}
                >
                  <option value="">—</option>
                  {ladder.map((g) => (
                    <option key={g} value={g}>
                      {displayGrade(spec.scale === 'route' ? 'YDS' : 'V', g, display)}
                    </option>
                  ))}
                </Select>
              </label>
            );
          }

          return (
            <label key={spec.id} className="text-sm block">
              <span className="block text-ink-soft mb-1">
                {spec.label}
                {spec.unit ? ` (${spec.unit})` : ''}
              </span>
              <Input
                type={spec.kind === 'number' ? 'number' : 'text'}
                {...(spec.kind === 'number' ? { inputMode: 'numeric' as const } : {})}
                value={String(value ?? '')}
                {...(spec.placeholder ? { placeholder: spec.placeholder } : {})}
                onChange={(e) =>
                  set(
                    spec.id,
                    e.target.value === ''
                      ? undefined
                      : spec.kind === 'number'
                        ? Number(e.target.value)
                        : e.target.value,
                  )
                }
              />
            </label>
          );
        })}
      </div>
    </Card>
  );
}

function ProjectBurnsCard({
  session,
  onChange,
}: {
  session: Session;
  onChange: (s: Session) => void;
}) {
  const gradeLabel = useGradeLabel();
  const projects = useProjects((s) => s.projects);
  const hydrated = useProjects((s) => s.hydrated);
  const load = useProjects((s) => s.load);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const attempts = session.projectAttempts ?? [];
  const shown = projects.filter(
    (p) => p.status === 'active' || attempts.some((a) => a.projectId === p.id),
  );
  if (shown.length === 0) return null;

  function bump(projectId: string, outcome: AttemptOutcome, by: number) {
    const existing = attempts.find((a) => a.projectId === projectId && a.outcome === outcome);
    if (!existing) {
      if (by < 0) return;
      const attempt: ProjectAttempt = { id: rid(), projectId, outcome, count: 1 };
      const implied = OUTCOME_HIGH_POINT[outcome];
      onChange({
        ...session,
        projectAttempts: [...attempts, implied === null ? attempt : { ...attempt, highPoint: implied }],
      });
      return;
    }
    const count = existing.count + by;
    onChange({
      ...session,
      projectAttempts:
        count <= 0
          ? attempts.filter((a) => a !== existing)
          : attempts.map((a) => (a === existing ? { ...a, count } : a)),
    });
  }

  // Burn notes are the fourth thing the journal reads, so they have to be
  // writable somewhere — here, beside the burn they describe.
  function note(attempt: ProjectAttempt, text: string) {
    onChange({
      ...session,
      projectAttempts: attempts.map((a) =>
        a === attempt ? { ...a, ...(text.trim() ? { note: text } : { note: undefined }) } : a,
      ),
    });
  }

  return (
    <Card title="Projects">
      <div className="grid grid-cols-1 gap-3">
        {shown.map((project) => {
          const mine = attempts.filter((a) => a.projectId === project.id);
          return (
            <div key={project.id}>
              <div className="flex items-baseline gap-2 mb-2">
                <Link href={`/projects/${project.id}`} className="font-semibold text-sm truncate">
                  {project.name}
                </Link>
                <span className="text-xs font-bold text-accent shrink-0">
                  {gradeLabel(project.scale, project.grade)}
                </span>
                {project.status === 'sent' && (
                  <span className="text-xs font-bold text-positive shrink-0">sent</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <Button
                    key={o.value}
                    variant="outline"
                    size="sm"
                    onClick={() => bump(project.id, o.value, 1)}
                    className={`text-xs ${o.value === 'send' ? 'border-positive/50 text-positive' : 'bg-sunken text-ink-soft'}`}
                  >
                    {o.label}
                  </Button>
                ))}
              </div>
              {mine.length > 0 && (
                <ul className="grid grid-cols-1 gap-1.5 mt-2">
                  {mine.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/40 pl-2.5 pr-1 py-1 text-xs font-semibold">
                        {OUTCOMES.find((o) => o.value === a.outcome)?.label} ×{a.count}
                        <IconButton
                          onClick={() => bump(project.id, a.outcome, -1)}
                          label={`Remove one ${a.outcome} burn`}
                          className="w-8 h-8"
                        >
                          −
                        </IconButton>
                      </span>
                      <Input
                        value={a.note ?? ''}
                        onChange={(e) => note(a, e.target.value)}
                        placeholder="What happened?"
                        aria-label={`Note about the ${a.outcome} burns`}
                        className="flex-1 min-w-32" size="compact"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/**
 * What the session earned, itemised.
 *
 * XP is derived rather than banked, so `rewarded` no longer means "paid" —
 * it means "you have seen this". Reopening the session clears it, because
 * an edited session is worth a different number and hiding that would be
 * the same dishonesty the derived total exists to avoid.
 */
/** How the headline names itself, above the thing itself. */
const MILESTONE_EYEBROW: Record<MilestoneKind, string> = {
  'grade-pr': 'Personal record',
  'project-send': 'Project sent',
  'first-outdoor': 'A first',
  'first-session': 'A first',
  'rank-up': 'New rank',
  'level-up': 'Level up',
};

/**
 * What this session was, beyond its XP (PLAN.md M26).
 *
 * The records come out of the reward breakdown rather than a fresh
 * derivation — see `recordsInReward` — so the headline can never disagree
 * with the line that paid for it.
 */
function useSessionMilestones(session: Session, detail: SessionXp | undefined): Milestone[] {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const display = useSettings((s) => s.display);

  return useMemo(() => {
    if (!detail) return [];
    const all = Object.values(byDate).flat();
    const earlier = all.filter(
      (s) => s.completed && (s.date < session.date || (s.date === session.date && s.id < session.id)),
    );
    return sessionMilestones({
      session,
      records: recordsInReward(detail.reward.awards, session.date),
      earlierSessions: earlier.length,
      earlierOutdoor: earlier.filter((s) => s.mode === 'outdoor').length,
      levelBefore: detail.levelBefore,
      levelAfter: detail.levelAfter,
      rankBefore: rankFor(detail.levelBefore).title,
      rankAfter: rankFor(detail.levelAfter).title,
      projectsSent: projects
        .filter((p) => p.status === 'sent' && p.sentDate === session.date)
        .map((p) => ({ name: p.name, grade: p.grade, scale: p.scale })),
      display,
    });
  }, [byDate, projects, display, session, detail]);
}

function RewardCard({ session, onAcknowledge }: { session: Session; onAcknowledge: () => void }) {
  const xp = useXp();
  const detail = xp.bySession[session.id];
  const levelled = detail !== undefined && detail.levelAfter > detail.levelBefore;
  const milestones = useSessionMilestones(session, detail);
  const lead = headlineMilestone(milestones);
  const display = useSettings((s) => s.display);
  // Only derived when there is actually a card to put it on — see the hook.
  const avatar = useClimberAvatar(Boolean(lead?.shareable && lead.record));

  // The card appearing is the whole feedback for logging a session, and it
  // arrives without a navigation — so on screen it is unmissable and to a
  // screen reader it was, until this, completely silent. The record leads,
  // because "412 XP earned" says nothing about having just climbed the
  // hardest thing you ever have.
  useEffect(() => {
    if (detail === undefined || session.rewarded) return;
    announce(announcementFor(milestones, detail.xp));
  }, [detail?.xp, session.rewarded, detail, session.id, milestones]);

  if (!detail) return null;

  if (session.rewarded) {
    return (
      <p className="text-sm text-ink-soft text-center">
        Earned <span className="font-bold text-ink tabular-nums">+{detail.xp.toLocaleString()}</span> XP
      </p>
    );
  }

  return (
    <Card>
      {/* M26: when something happened, it is the card. The XP total drops to
          a line underneath — it is the same number either way, and a
          climber who has just done the hardest thing they ever have should
          not have to read an arithmetic breakdown to find that out. */}
      {lead ? (
        <div className="text-center mb-3">
          <div className="text-2xs font-bold uppercase tracking-widest text-accent">
            {MILESTONE_EYEBROW[lead.kind]}
          </div>
          <div className="text-3xl font-black tracking-tight leading-tight mt-1">
            {lead.headline}
          </div>
          <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">{lead.detail}</p>
          <p className="text-sm text-ink-soft mt-2 tabular-nums">
            +{detail.xp.toLocaleString()} XP
          </p>
        </div>
      ) : (
        <div className="text-center mb-3">
          <div className="text-3xl font-black tabular-nums leading-none">
            +{detail.xp.toLocaleString()}
          </div>
          <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mt-1.5">
            XP earned
          </div>
        </div>
      )}

      {/* Anything else the session was, under the headline rather than lost. */}
      {milestones.length > 1 && (
        <ul className="grid grid-cols-1 gap-1 mb-3">
          {milestones.slice(1).map((m) => (
            <li key={`${m.kind}-${m.headline}`} className="flex items-center gap-2 text-sm">
              <Sparkles size={13} className="text-accent shrink-0" aria-hidden />
              <span className="font-semibold">{m.headline}</span>
            </li>
          ))}
        </ul>
      )}

      {levelled && !lead && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent mb-3">
          <TrendingUp size={15} /> Level {detail.levelAfter} — {xp.rank.title}
        </p>
      )}

      <ul className="grid grid-cols-1 gap-1 mb-3">
        {detail.lines.map((line, i) => (
          <li key={`${line.label}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-ink-soft truncate">{line.label}</span>
            <span className="font-semibold tabular-nums shrink-0">+{line.xp.toLocaleString()}</span>
          </li>
        ))}
      </ul>

      {detail.reward.multiplier !== 1 && (
        <p className="text-xs text-ink-soft mb-3">
          {[
            detail.reward.effort !== 1 && `effort ×${detail.reward.effort}`,
            detail.reward.drill !== 1 && `drill streak ×${detail.reward.drill}`,
            detail.reward.outdoor !== 1 && `outdoor ×${detail.reward.outdoor}`,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          already applied.
        </p>
      )}

      {detail.reward.effortBraked && (
        <p className="text-sm flex gap-2 items-start mb-3">
          <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
          High load week — the effort bonus was withheld. Recover.
        </p>
      )}

      <div className="grid grid-cols-1 gap-2">
        {/* The card for exactly this was written in M13 and reachable from
            nowhere until now. */}
        {lead?.shareable && lead.record && (
          <ShareButton
            content={recordCard(lead.record.grade, lead.record.date, avatar, lead.record.scale, display)}
            filename={`personal-record-${lead.record.grade}`}
            label="Share this"
            className="w-full justify-center"
          />
        )}
        <Button className="w-full" onClick={onAcknowledge}>
          <Sparkles size={16} /> Nice
        </Button>
      </div>
    </Card>
  );
}

/**
 * The climber's own saved shapes, offered alongside the program's session
 * types on a day with nothing logged.
 */
function TemplatePicker({ date, onApplied }: { date: string; onApplied: () => void }) {
  const templates = useTemplates((s) => s.templates);
  const hydrated = useTemplates((s) => s.hydrated);
  const load = useTemplates((s) => s.load);
  const use = useTemplates((s) => s.use);
  const create = useSessions((s) => s.create);
  const byDate = useSessions((s) => s.byDate);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  if (templates.length === 0) return null;

  async function apply(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    const index = (byDate[date] ?? []).length;
    const planned = applyTemplate(template, date, index, date === today());
    // create() assigns the id and timestamps; the template supplies the rest.
    const { id: _id, date: _date, createdAt: _c, updatedAt: _u, ...body } = planned;
    await create(date, body);
    await use(id);
    onApplied();
  }

  return (
    <Card title="Your templates">
      <div className="flex flex-wrap gap-2">
        {rankTemplates(templates).map((t) => (
          <Button key={t.id} size="sm" variant="outline" onClick={() => void apply(t.id)}>
            <Copy size={14} /> {t.name}
          </Button>
        ))}
      </div>
      <p className="text-xs text-ink-soft mt-3 leading-relaxed">
        A template sets up the session — type, length, warmup, drill. It never fills in climbs,
        because those are what happened rather than what you planned.
      </p>
    </Card>
  );
}

/** Turn a finished session into a template, once. */
function SaveTemplateCard({ session, typeName }: { session: Session; typeName?: string }) {
  const templates = useTemplates((s) => s.templates);
  const save = useTemplates((s) => s.save);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);

  const covered = alreadySaved(templates, session);
  if (covered || saved) {
    return (
      <p className="text-xs text-ink-soft text-center px-4">
        {saved ? 'Saved as a template.' : 'You already have a template for this kind of session.'}
      </p>
    );
  }

  return (
    <Card title="Save as a template">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Keeps the shape of this session — type, length, warmup, drill — so the next one is one tap.
        The climbs are not saved.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={suggestName(session, typeName)}
          aria-label="Template name"
          className="flex-1 min-w-0"
        />
        <Button
          size="sm"
          onClick={() => {
            void save(session, name, typeName);
            setSaved(true);
          }}
        >
          <Copy size={15} /> Save
        </Button>
      </div>
    </Card>
  );
}

/** Which of the day's sessions is on screen. */
function SessionSwitcher({
  sessions,
  current,
  program,
  onSelect,
}: {
  sessions: Session[];
  current: Session;
  program: ReturnType<typeof getProgram>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {sessions.map((s, i) => {
        const typeName = program?.sessionTypes.find((t) => t.id === s.sessionTypeId)?.name;
        return (
          <Chip key={s.id} active={s.id === current.id} onClick={() => onSelect(s.id)}>
            <span className="font-semibold">#{i + 1}</span>{' '}
            <span className="text-xs">{describeSession(s, typeName)}</span>
          </Chip>
        );
      })}
    </div>
  );
}

/**
 * Fixing a session that went in wrong: the date, or two entries that were
 * really one. Both are corrections, and both drop the wall clock — see
 * engine/sessionEdit.ts.
 */
function CorrectionCard({
  session,
  others,
  typeName,
  onMoved,
}: {
  session: Session;
  others: Session[];
  typeName?: string;
  onMoved: (s: Session) => void;
}) {
  const move = useSessions((s) => s.move);
  const merge = useSessions((s) => s.merge);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(session.date);
  const [message, setMessage] = useState<string | null>(null);

  const mergeable = others
    .map((other) => ({ other, check: canMerge(session, other) }))
    .filter((m) => m.check.ok);

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="underline self-center">
        Logged on the wrong day?
      </Button>
    );
  }

  return (
    <Card title="Correct this session">
      <label className="text-sm block mb-3">
        <span className="block text-ink-soft mb-1">Move to a different day</span>
        <div className="flex flex-wrap gap-2">
          <Input
            type="date"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="New date"
            className="flex-1 min-w-0"
          />
          <Button
            size="sm"
            disabled={target === session.date || target === ''}
            onClick={() => {
              void move(session, target).then((moved) => {
                onMoved(moved);
                setMessage(`Moved to ${shortLabel(target)}.`);
              });
            }}
          >
            Move
          </Button>
        </div>
      </label>

      {mergeable.length > 0 && (
        <div className="border-t border-line pt-3">
          <p className="text-sm text-ink-soft mb-2">
            Merge into another session on this day. Durations add up and the effort is averaged
            across them, so your training load stays exactly what it was.
          </p>
          <div className="flex flex-wrap gap-2">
            {mergeable.map(({ other }) => (
              <Button
                key={other.id}
                size="sm"
                variant="outline"
                onClick={() => {
                  void merge(session, other).then((merged) => {
                    onMoved(merged);
                    setMessage('Merged.');
                  });
                }}
              >
                <RotateCw size={14} /> Merge in {describeSession(other, typeName)}
              </Button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-ink-soft mt-3 leading-relaxed">
        Correcting a session drops its start and finish times — they were true on the day they were
        recorded. The duration you trained for is kept.
      </p>
      {message && <p className="text-sm text-positive mt-2">{message}</p>}
    </Card>
  );
}
