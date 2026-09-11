import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Check, Minus, Plus, X } from 'lucide-react';
import type { Climb, Session } from '@/db/sessions';
import { today } from '@/engine/dates';
import { REST_PRESETS, bump, climbOutcome, gymSummary, restLabel, restRemaining } from '@/engine/gym';
import { elapsedMs, formatClock, runningSession } from '@/engine/live';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { getProgram } from '@/content/programs';
import { plannedDay } from '@/engine/plan';
import { cueCountdown, cueDone, unlock } from '@/lib/cues';
import { keepAwake, releaseAwake } from '@/lib/wakeLock';
import { clearRest, loadRest, saveRest } from '@/lib/timerState';

import { announce } from '@/ui/Announce';
import { offerUndo } from '@/store/undo';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { CHIP_LINK, Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { PageSkeleton } from '@/ui/Skeleton';
import { useGradeLabel } from '@/ui/useGrade';
import { ClimbEntry, type Outcome } from '@/features/log/ClimbEntry';

/**
 * The session while you are still in it (PLAN.md M74).
 *
 * A route rather than an overlay on the logger, for one reason: this is a
 * screen you are in for two hours with the phone face-down on a mat, and a
 * dialog does not survive the tab being reclaimed. `#/gym` does.
 *
 * It writes to the same session record as the logger — see engine/gym.ts on
 * why there is no buffer — so there is nothing to fold in afterwards and
 * nothing to lose if the climber walks away and never comes back to it.
 */
export function GymPage() {
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const create = useSessions((s) => s.create);
  const update = useSessions((s) => s.update);

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  // The screen is the whole point of the mode: a phone that sleeps between
  // burns is a phone you unlock forty times a session.
  useEffect(() => {
    void keepAwake();
    return () => void releaseAwake();
  }, []);

  const sessions = useMemo(() => Object.values(byDate).flat(), [byDate]);
  const session = runningSession(sessions);

  if (!hydrated) return <PageSkeleton title="Gym mode" />;
  if (!session) {
    return <StartHere onStart={(patch) => void create(today(), patch)} />;
  }
  return (
    <GymSession
      session={session}
      onChange={(s) => void update(s)}
      program={activeProgramId ? getProgram(activeProgramId) : undefined}
      startDate={activeProgramId ? startDates[activeProgramId] : undefined}
      plan={activeProgramId ? plans[activeProgramId] : undefined}
      overrides={activeProgramId ? weekOverrides[activeProgramId] : undefined}
    />
  );
}

/**
 * Nothing running.
 *
 * Gym mode starts a session rather than sending the climber to the logger to
 * do it: arriving at the wall and being told to go somewhere else first is
 * the thing this screen exists to avoid.
 */
function StartHere({ onStart }: { onStart: (patch: Partial<Session>) => void }) {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const tracks = useProfile((s) => s.tracks);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const day =
    program && startDate && plan
      ? plannedDay(program, startDate, plan, today(), activeProgramId ? weekOverrides[activeProgramId] : undefined)
      : undefined;
  const trackId = activeProgramId ? tracks[activeProgramId] : undefined;

  return (
    <>
      <h1 className="text-2xl font-black tracking-tight mb-1">Gym mode</h1>
      <p className="text-sm text-ink-soft mb-4 leading-relaxed">
        The tally, a rest timer, and a screen that stays on. Everything else is in the
        session.
      </p>
      <Card>
        <p className="text-sm text-ink-soft mb-3">
          {day?.sessionType && !day.isRest
            ? `${day.sessionType.icon} ${day.sessionType.name} is planned for today.`
            : 'Nothing running.'}
        </p>
        <Button
          size="lg"
          className="w-full"
          onClick={() =>
            onStart({
              startedAt: new Date().toISOString(),
              ...(activeProgramId ? { programId: activeProgramId } : {}),
              ...(day?.sessionType && !day.isRest ? { sessionTypeId: day.sessionType.id } : {}),
              ...(trackId ? { trackId } : {}),
              ...(day?.isDeload ? { deload: true } : {}),
              planned: Boolean(day?.sessionType),
            })
          }
        >
          Start climbing
        </Button>
      </Card>
    </>
  );
}

function GymSession({
  session,
  onChange,
  program,
  startDate,
  plan,
  overrides,
}: {
  session: Session;
  onChange: (session: Session) => void;
  program?: ReturnType<typeof getProgram>;
  startDate?: string;
  plan?: Parameters<typeof plannedDay>[2];
  overrides?: Parameters<typeof plannedDay>[4];
}) {
  const gradeLabel = useGradeLabel();
  const [adding, setAdding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const day =
    program && startDate && plan ? plannedDay(program, startDate, plan, session.date, overrides) : undefined;
  const type = program?.sessionTypes.find((t) => t.id === session.sessionTypeId) ?? day?.sessionType;
  const summary = gymSummary(session.climbs);
  const patch = (p: Partial<Session>) => onChange({ ...session, ...p });

  return (
    <>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-black tracking-tight truncate">
            {type ? `${type.icon} ${type.name}` : 'Session'}
          </h1>
          <p className="text-sm text-ink-soft tabular-nums">{formatClock(elapsedMs(session, now))}</p>
        </div>
        {/* A link, not a button: finishing means going to the logger for the
            effort and the notes, and a control that navigates should be an
            anchor. CHIP_LINK is the shape the app already uses for that. */}
        <Link href={`/log/${session.date}`} className={`${CHIP_LINK} shrink-0 gap-1.5`}>
          <Check size={15} /> Finish
        </Link>
      </div>

      <RestTimer sessionId={session.id} now={now} />

      <Card title="Tally">
        {session.climbs.length === 0 ? (
          <p className="text-sm text-ink-soft mb-3">Nothing yet. Add the first one below.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 mb-3">
            {session.climbs.map((climb) => (
              <TallyRow
                key={climb.id}
                climb={climb}
                label={gradeLabel(climb.scale, climb.grade)}
                onBump={(by) => {
                  const before = session.climbs;
                  const after = bump(before, climb.id, by);
                  patch({ climbs: after });
                  // Only a row that went, not every minus: the offer bar
                  // replaces itself, and a count going 4→3 is not a loss.
                  if (after.length < before.length) {
                    offerUndo(`${gradeLabel(climb.scale, climb.grade)} ${climbOutcome(climb)}`, async () =>
                      patch({ climbs: before }),
                    );
                  }
                }}
              />
            ))}
          </ul>
        )}

        {adding ? (
          <AddClimb
            session={session}
            onAdd={(climbs) => {
              patch({ climbs });
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <Button size="lg" variant="outline" className="w-full" onClick={() => setAdding(true)}>
            <Plus size={18} /> Another grade
          </Button>
        )}
      </Card>

      <p className="text-sm text-ink-soft mt-3">
        {summary.total} climb{summary.total === 1 ? '' : 's'} · {summary.sends} sent ·{' '}
        {summary.attempts} tried
        {summary.hardest ? ` · hardest ${gradeLabel(summary.hardest.scale, summary.hardest.grade)}` : ''}
      </p>
      {/* The full logger is a tap away and holds everything this screen left
          out — effort, notes, the prescription, the photos. */}
      <p className="text-xs text-ink-soft mt-1">
        Effort, notes and the rest of the session are in{' '}
        <Link href={`/log/${session.date}`} className="underline">
          the full log
        </Link>
        .
      </p>
    </>
  );
}

/**
 * One row of the tally, and the only control that matters mid-session.
 *
 * A 56px target for the plus, because the whole premise is a cold hand on
 * glass. Minus is smaller on purpose: it is the correction, not the action,
 * and making both the same size makes the wrong one as easy to hit.
 */
function TallyRow({
  climb,
  label,
  onBump,
}: {
  climb: Climb;
  label: string;
  onBump: (by: number) => void;
}) {
  return (
    <li className="flex items-center gap-2 bg-sunken rounded-xl pl-3 pr-2 py-2">
      <span className="font-black text-lg w-16 tabular-nums">{label}</span>
      <span className="text-xs text-ink-soft flex-1 truncate">
        {climb.name ? `${climb.name} · ` : ''}
        {climbOutcome(climb)}
      </span>
      <IconButton
        inline={false}
        label={`One fewer ${label} ${climbOutcome(climb)}`}
        onClick={() => onBump(-1)}
        className="w-9 h-9 bg-surface border border-line"
      >
        <Minus size={16} />
      </IconButton>
      <span className="font-black text-xl tabular-nums w-7 text-center">{climb.count}</span>
      <IconButton
        inline={false}
        size="lg"
        tone="onAccent"
        label={`One more ${label} ${climbOutcome(climb)}`}
        onClick={() => onBump(1)}
      >
        <Plus size={26} />
      </IconButton>
    </li>
  );
}

/** The full entry row, borrowed from the logger so there is one of it. */
function AddClimb({
  session,
  onAdd,
  onCancel,
}: {
  session: Session;
  onAdd: (climbs: Climb[]) => void;
  onCancel: () => void;
}) {
  const [scale, setScale] = useState<Climb['scale']>('V');
  const [grade, setGrade] = useState('V3');
  const [outcome, setOutcome] = useState<Outcome>('send');

  function add() {
    const result: Climb['result'] = outcome === 'attempt' ? 'attempt' : 'send';
    const style = outcome === 'onsight' || outcome === 'flash' ? outcome : undefined;
    const existing = session.climbs.find(
      (c) => c.grade === grade && c.scale === scale && c.result === result && c.style === style && !c.name,
    );
    onAdd(
      existing
        ? session.climbs.map((c) => (c === existing ? { ...c, count: c.count + 1 } : c))
        : [
            ...session.climbs,
            {
              id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
              grade,
              scale,
              count: 1,
              result,
              ...(style ? { style } : {}),
            } as Climb,
          ],
    );
  }

  return (
    <div>
      <ClimbEntry
        scale={scale}
        grade={grade}
        outcome={outcome}
        onScale={setScale}
        onGrade={setGrade}
        onOutcome={setOutcome}
        onAdd={add}
      />
      <Button size="sm" variant="ghost" className="w-full" onClick={onCancel}>
        <X size={15} /> Cancel
      </Button>
    </div>
  );
}

/**
 * Rest between burns.
 *
 * Not the protocol timer: that one is work/rest/reps/sets attached to a
 * prescribed exercise, and "give me three minutes" is none of those. It is
 * driven by an end time rather than a countdown so a phone going dark does
 * not pause the rest — see engine/gym.ts.
 */
function RestTimer({ sessionId, now }: { sessionId: string; now: number }) {
  const [rest, setRest] = useState(() => loadRest(sessionId));
  const fired = useRef(false);

  const left = rest ? restRemaining(rest.endsAt, now) : 0;

  useEffect(() => {
    if (!rest) return;
    if (left > 0) {
      // The last three seconds, once each.
      if (left <= 3000) cueCountdown();
      return;
    }
    if (fired.current) return;
    fired.current = true;
    cueDone();
    announce('Rest over.');
    // Nothing is cleared here. `loadRest` refuses an end time that has
    // already passed, so a finished rest cannot come back whether the key is
    // there or not — and a clearRest() on this path survived being deleted,
    // which is what a second guard on the same rule looks like.
  }, [rest, left]);

  function start(seconds: number) {
    // Audio on a phone only plays after a gesture; this is the gesture.
    unlock();
    fired.current = false;
    const next = { endsAt: Date.now() + seconds * 1000, seconds, sessionId };
    saveRest(next);
    setRest(next);
  }

  function stop() {
    clearRest();
    setRest(null);
  }

  if (!rest || left <= 0) {
    return (
      <Card title="Rest">
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((seconds) => (
            <Chip key={seconds} active={false} onClick={() => start(seconds)} className="min-h-12 px-4 text-base">
              {restLabel(seconds)}
            </Chip>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card title="Rest">
      <div className="flex items-center gap-3">
        <span className="text-5xl font-black tabular-nums" role="timer" aria-live="off">
          {formatClock(left)}
        </span>
        <Button size="sm" variant="outline" className="ml-auto" onClick={stop}>
          Stop
        </Button>
      </div>
    </Card>
  );
}
