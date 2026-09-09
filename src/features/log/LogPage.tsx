import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { ArrowLeft, Check, Clock, Plus, Timer, Trash2, X } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getProtocol } from '@/content/protocols';
import { addDays, fromKey, today } from '@/engine/dates';
import { plannedDay, prescriptionFor } from '@/engine/plan';
import { V_GRADES, YDS_GRADES, type GradeScale } from '@/engine/grades';
import type { Climb, Session } from '@/db/sessions';
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
  const [result, setResult] = useState<'send' | 'attempt'>('send');
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
    const existing = session.climbs.find(
      (c) => c.grade === grade && c.scale === scale && c.result === result,
    );
    const climbs = existing
      ? session.climbs.map((c) => (c === existing ? { ...c, count: c.count + 1 } : c))
      : [...session.climbs, { id: rid(), grade, scale, count: 1, result } as Climb];
    patch({ climbs });
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
                value={result}
                onChange={(e) => setResult(e.target.value as 'send' | 'attempt')}
                className="bg-sunken border border-line rounded-xl px-2.5 py-2 text-sm"
              >
                <option value="send">Sent</option>
                <option value="attempt">Tried</option>
              </select>
              <Button size="sm" onClick={addClimb} aria-label="Add climb">
                <Plus size={16} />
              </Button>
            </div>

            {session.climbs.length === 0 ? (
              <p className="text-sm text-ink-soft">Nothing logged yet.</p>
            ) : (
              <ul className="grid gap-2">
                {session.climbs.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2">
                    <span className="font-bold text-sm w-14">{c.grade}</span>
                    <span className="text-xs text-ink-soft flex-1">
                      {c.result === 'send' ? 'sent' : 'tried'}
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

      {session.completed ? (
        <Button variant="outline" className="w-full" onClick={() => patch({ completed: false })}>
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
