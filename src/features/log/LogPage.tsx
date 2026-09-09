import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AlertTriangle, ArrowLeft, Check, Clock, Flame, Plus, RotateCw, Sparkles, Timer, Trash2, TrendingUp, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getProtocol } from '@/content/protocols';
import { addDays, fromKey, today } from '@/engine/dates';
import { plannedDay, prescriptionFor } from '@/engine/plan';
import { DEFAULT_TARGET_SECONDS, focusFor, generateWarmup, type WarmupPlan } from '@/engine/warmup';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import type { Climb, ProjectAttempt, Session } from '@/db/sessions';
import type { AttemptOutcome } from '@/db/projects';
import { OUTCOME_HIGH_POINT } from '@/engine/projects';
import { useXp } from '@/store/game';
import { useProjects } from '@/store/projects';
import { useSkillEffects } from '@/store/skills';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { parseCount } from '@/content/types';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { TimerSheet } from '@/ui/TimerSheet';

const REST_ITEMS = [
  { key: 'hydration', label: 'Hydration' },
  { key: 'mobility', label: 'Mobility' },
  { key: 'zone1', label: 'Walking / Zone 1' },
  { key: 'sleep', label: 'Sleep 8+ hrs' },
] as const;

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function LogPage({ params }: { params: { date: string } }) {
  const date = params.date;
  const [, navigate] = useLocation();

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const tracks = useProfile((s) => s.tracks);

  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const create = useSessions((s) => s.create);
  const update = useSessions((s) => s.update);
  const remove = useSessions((s) => s.remove);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const trackId = activeProgramId ? tracks[activeProgramId] : undefined;

  const day = useMemo(
    () => (program && startDate && plan ? plannedDay(program, startDate, plan, date) : undefined),
    [program, startDate, plan, date],
  );

  const sessions = byDate[date] ?? [];
  const session = sessions[0];

  async function startSession(sessionTypeId?: string) {
    await create(date, {
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
      <Link href="/calendar" className="inline-flex items-center gap-1 text-sm text-ink-soft mb-3">
        <ArrowLeft size={15} /> Calendar
      </Link>

      <div className="flex items-center justify-between mb-4">
        <button onClick={() => navigate(`/log/${addDays(date, -1)}`)} className="p-2 -m-2 text-ink-soft">
          <ArrowLeft size={18} />
        </button>
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
        <button
          onClick={() => navigate(`/log/${addDays(date, 1)}`)}
          className="p-2 -m-2 text-ink-soft rotate-180"
        >
          <ArrowLeft size={18} />
        </button>
      </div>

      <div className="grid gap-3">
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

        {session && (
          <SessionEditor
            session={session}
            program={program}
            day={day}
            trackId={trackId}
            onChange={(s) => void update(s)}
            onDelete={() => void remove(session)}
          />
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
      injuries: injuries.map((i) => i.part),
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
            {injuries.length > 0
              ? `Built around your ${injuries.map((i) => i.part).join(' and ')} — nothing that loads it.`
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
            <button
              onClick={() => build(Math.floor(Math.random() * 1_000_000))}
              className="text-sm font-semibold text-accent inline-flex items-center gap-1"
            >
              <RotateCw size={14} /> Swap
            </button>
          </div>

          {plan.injuryFilterRelaxed && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              Everything available loads something you have injured. Go gently, or skip the warmup and
              rest instead.
            </p>
          )}

          <ol className="grid gap-2 mb-3">
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
  onChange,
  onDelete,
}: {
  session: Session;
  program: ReturnType<typeof getProgram>;
  day: ReturnType<typeof plannedDay> | undefined;
  trackId: string | undefined;
  onChange: (s: Session) => void;
  onDelete: () => void;
}) {
  const type = program?.sessionTypes.find((t) => t.id === session.sessionTypeId);
  const isRest = type?.isRest === true;
  const patch = (p: Partial<Session>) => onChange({ ...session, ...p });

  const [scale, setScale] = useState<GradeScale>('V');
  const [grade, setGrade] = useState('V3');
  // One control instead of two: style is part of how a climb went, and a
  // separate selector for it would not survive a phone-width row.
  const [outcome, setOutcome] = useState<'onsight' | 'flash' | 'send' | 'attempt'>('send');
  const [climbName, setClimbName] = useState('');
  const [timer, setTimer] = useState<{
    protocolId: string;
    name: string;
    sets: number;
    override?: Partial<import('@/content/types').ProtocolTimer>;
  } | null>(null);

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

  const grades = scale === 'V' ? V_GRADES : YDS_GRADES;
  const blocks = type && day?.phase ? prescriptionFor(type, day.phase, trackId) : [];

  return (
    <>
      <Card>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-baseline gap-2">
            <span className="text-lg leading-none">{type?.icon ?? '🧗'}</span>
            <h2 className="font-bold">{type?.name ?? 'Session'}</h2>
          </div>
          <button onClick={onDelete} className="text-ink-soft p-1 -m-1" aria-label="Delete session">
            <Trash2 size={16} />
          </button>
        </div>
        {session.completed ? (
          <p className="text-sm text-positive flex items-center gap-1.5">
            <Check size={15} /> Logged
          </p>
        ) : (
          <p className="text-sm text-ink-soft">In progress — fill in what you did, then mark it complete.</p>
        )}
      </Card>

      {isRest ? (
        <Card title="Recovery checklist">
          <div className="grid gap-2">
            {REST_ITEMS.map((item) => {
              const checked = session.restChecklist?.[item.key] ?? false;
              return (
                <button
                  key={item.key}
                  onClick={() =>
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
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border text-sm text-left ${
                    checked ? 'border-accent bg-accent/10' : 'border-line bg-sunken text-ink-soft'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      checked ? 'bg-accent border-accent' : 'border-line'
                    }`}
                  >
                    {checked && <Check size={12} className="text-accent-ink" />}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </div>
        </Card>
      ) : (
        <>
          <Card title="Climbs">
            <div className="flex gap-2 mb-3">
              <select
                value={scale}
                onChange={(e) => {
                  const next = e.target.value as GradeScale;
                  setScale(next);
                  setGrade(next === 'V' ? 'V3' : '5.10a');
                }}
                className="bg-sunken border border-line rounded-xl px-2.5 py-2 text-sm"
              >
                <option value="V">Boulder</option>
                <option value="YDS">Route</option>
              </select>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                className="flex-1 bg-sunken border border-line rounded-xl px-2.5 py-2 text-sm"
              >
                {grades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                aria-label="How it went"
                className="bg-sunken border border-line rounded-xl px-2.5 py-2 text-sm"
              >
                <option value="onsight">On-sight</option>
                <option value="flash">Flash</option>
                <option value="send">Sent</option>
                <option value="attempt">Tried</option>
              </select>
              <Button size="sm" onClick={addClimb} aria-label="Add climb">
                <Plus size={16} />
              </Button>
            </div>

            <input
              value={climbName}
              onChange={(e) => setClimbName(e.target.value)}
              placeholder="Name it (optional) — named climbs can become projects"
              aria-label="Climb name"
              className="w-full bg-sunken border border-line rounded-xl px-3 py-2 text-sm mb-3"
            />

            {session.climbs.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-2">
                {session.climbs.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2">
                    <span className="font-bold text-sm w-14">{c.grade}</span>
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
                    <button onClick={() => bump(c, -1)} className="w-7 h-7 rounded-lg bg-surface border border-line">
                      −
                    </button>
                    <span className="w-6 text-center font-semibold text-sm">{c.count}</span>
                    <button onClick={() => bump(c, 1)} className="w-7 h-7 rounded-lg bg-surface border border-line">
                      +
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <ProjectBurnsCard session={session} onChange={onChange} />

          {blocks.length > 0 && (
            <Card title="Today's prescription">
              {blocks.map((b) => (
                <div key={b.blockId} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-1.5">{b.name}</h4>
                  <ul className="grid gap-2">
                    {b.entry.exercises.map((ex, i) => {
                      const protocol = ex.protocolId ? getProtocol(ex.protocolId) : undefined;
                      const isDone = doneExercises.includes(ex.name);
                      return (
                        <li
                          key={`${ex.name}-${i}`}
                          className="flex items-start gap-2 bg-sunken rounded-xl px-3 py-2.5"
                        >
                          <button
                            onClick={() => markExerciseDone(ex.name)}
                            className={`w-5 h-5 rounded border shrink-0 mt-0.5 flex items-center justify-center ${
                              isDone ? 'bg-accent border-accent' : 'border-line'
                            }`}
                            aria-label={`Mark ${ex.name} done`}
                          >
                            {isDone && <Check size={13} className="text-accent-ink" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`font-semibold text-sm ${isDone ? 'line-through opacity-60' : ''}`}>
                              {ex.name}
                            </div>
                            <div className="text-ink-soft text-xs">
                              {[ex.sets && `${ex.sets} sets`, ex.reps, ex.hold, ex.load, ex.rest && `${ex.rest} rest`]
                                .filter(Boolean)
                                .join(' · ')}
                            </div>
                            {ex.notes && <div className="text-ink-soft/80 text-xs italic mt-0.5">{ex.notes}</div>}
                          </div>
                          {protocol?.timer && (
                            <button
                              onClick={() =>
                                setTimer({
                                  protocolId: protocol.id,
                                  name: ex.name,
                                  sets: parseCount(ex.sets) ?? 1,
                                })
                              }
                              className="shrink-0 inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-accent border border-accent/40 rounded-lg px-2 py-1.5"
                            >
                              <Timer size={13} />
                              Timer
                            </button>
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
                <button
                  onClick={() => patch({ drillDone: !session.drillDone })}
                  className={`shrink-0 text-xs font-bold uppercase tracking-wide rounded-lg px-2.5 py-1.5 border ${
                    session.drillDone ? 'border-accent bg-accent/10 text-ink' : 'border-line text-ink-soft'
                  }`}
                >
                  {session.drillDone ? 'Done' : 'Mark done'}
                </button>
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">{day.drill.description}</p>
              {(() => {
                const protocol = day.drill.protocolId ? getProtocol(day.drill.protocolId) : undefined;
                if (!protocol?.timer) return null;
                return (
                  <button
                    onClick={() =>
                      setTimer({
                        protocolId: protocol.id,
                        name: day.drill!.name,
                        sets: day.drill!.timerOverride?.sets ?? 2,
                        ...(day.drill!.timerOverride ? { override: day.drill!.timerOverride } : {}),
                      })
                    }
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent"
                  >
                    <Timer size={15} /> Open the {protocol.name} timer
                  </button>
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
                  <button
                    key={n}
                    onClick={() => patch({ rpe: n })}
                    className={`py-2 rounded-lg text-xs font-semibold border ${
                      session.rpe === n ? 'border-accent bg-accent/15' : 'border-line bg-sunken text-ink-soft'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="text-sm block mb-3">
              <span className="block text-ink-soft mb-1">Duration (minutes)</span>
              <input
                type="number"
                inputMode="numeric"
                value={session.durationMin ?? ''}
                onChange={(e) => patch({ durationMin: e.target.value ? Number(e.target.value) : undefined })}
                className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5"
              />
            </label>
            <button
              onClick={() => patch({ warmup: !session.warmup })}
              className={`text-sm rounded-xl px-3 py-2.5 border w-full text-left ${
                session.warmup ? 'border-accent bg-accent/10' : 'border-line bg-sunken text-ink-soft'
              }`}
            >
              {session.warmup ? '✓ Warmed up' : 'Did you warm up?'}
            </button>
          </Card>
        </>
      )}

      <Card title="Notes">
        <textarea
          value={session.notes ?? ''}
          onChange={(e) => patch({ notes: e.target.value })}
          rows={3}
          placeholder="How did it feel? What worked?"
          className="w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm resize-y"
        />
      </Card>

      {timer && (
        <TimerSheet
          protocol={getProtocol(timer.protocolId)!}
          sets={timer.sets}
          {...(timer.override ? { override: timer.override } : {})}
          exerciseName={timer.name}
          onClose={() => setTimer(null)}
          onComplete={() => {
            if (!doneExercises.includes(timer.name)) markExerciseDone(timer.name);
          }}
        />
      )}

      {session.completed && (
        <RewardCard session={session} onAcknowledge={() => patch({ rewarded: true })} />
      )}

      {session.completed ? (
        <Button
          variant="outline"
          className="w-full"
          // Reopening clears the acknowledgement: if the session changes, the
          // climber should see the new total rather than the old one.
          onClick={() => patch({ completed: false, rewarded: false })}
        >
          <X size={16} /> Reopen session
        </Button>
      ) : (
        <Button size="lg" className="w-full" onClick={() => patch({ completed: true })}>
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
function ProjectBurnsCard({
  session,
  onChange,
}: {
  session: Session;
  onChange: (s: Session) => void;
}) {
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
      <div className="grid gap-3">
        {shown.map((project) => {
          const mine = attempts.filter((a) => a.projectId === project.id);
          return (
            <div key={project.id}>
              <div className="flex items-baseline gap-2 mb-2">
                <Link href={`/projects/${project.id}`} className="font-semibold text-sm truncate">
                  {project.name}
                </Link>
                <span className="text-xs font-bold text-accent shrink-0">{project.grade}</span>
                {project.status === 'sent' && (
                  <span className="text-xs font-bold text-positive shrink-0">sent</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => bump(project.id, o.value, 1)}
                    className={`rounded-lg px-2.5 py-1.5 border text-xs font-semibold ${
                      o.value === 'send'
                        ? 'border-positive/50 text-positive'
                        : 'border-line bg-sunken text-ink-soft'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {mine.length > 0 && (
                <ul className="grid gap-1.5 mt-2">
                  {mine.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-accent/10 border border-accent/40 pl-2.5 pr-1 py-1 text-xs font-semibold">
                        {OUTCOMES.find((o) => o.value === a.outcome)?.label} ×{a.count}
                        <button
                          onClick={() => bump(project.id, a.outcome, -1)}
                          className="w-5 h-5 rounded flex items-center justify-center text-ink-soft"
                          aria-label={`Remove one ${a.outcome} burn`}
                        >
                          −
                        </button>
                      </span>
                      <input
                        value={a.note ?? ''}
                        onChange={(e) => note(a, e.target.value)}
                        placeholder="What happened?"
                        aria-label={`Note about the ${a.outcome} burns`}
                        className="flex-1 min-w-32 bg-sunken border border-line rounded-lg px-2.5 py-1.5 text-xs"
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
function RewardCard({ session, onAcknowledge }: { session: Session; onAcknowledge: () => void }) {
  const xp = useXp();
  const detail = xp.bySession[session.id];
  if (!detail) return null;

  const levelled = detail.levelAfter > detail.levelBefore;

  if (session.rewarded) {
    return (
      <p className="text-sm text-ink-soft text-center">
        Earned <span className="font-bold text-ink tabular-nums">+{detail.xp.toLocaleString()}</span> XP
      </p>
    );
  }

  return (
    <Card>
      <div className="text-center mb-3">
        <div className="text-3xl font-black tabular-nums leading-none">
          +{detail.xp.toLocaleString()}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-ink-soft mt-1.5">
          XP earned
        </div>
      </div>

      {levelled && (
        <p className="flex items-center justify-center gap-1.5 text-sm font-semibold text-accent mb-3">
          <TrendingUp size={15} /> Level {detail.levelAfter} — {xp.rank.title}
        </p>
      )}

      <ul className="grid gap-1 mb-3">
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

      <Button className="w-full" onClick={onAcknowledge}>
        <Sparkles size={16} /> Nice
      </Button>
    </Card>
  );
}
