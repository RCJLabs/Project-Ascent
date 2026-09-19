import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Flame,
  Plus,
  RotateCw,
  Snowflake,
  Sparkles,
  Timer,
  Trash2,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { getProgram } from '@/content/programs';
import { getDrill } from '@/content/drills';
import { drillText } from '@/content/drillText';
import { getProtocol } from '@/content/protocols';
import { SCALE_MAX, getField, type FieldSpec } from '@/content/fields';
import type { Drill, FieldId, SessionType } from '@/content/types';
import { fromKey, isDateKey, shortLabel, today } from '@/engine/dates';
import { clearTimerState, loadTimerState, saveTimerState } from '@/lib/timerState';
import { ClimbEntry, RepeatLast, type Outcome } from './ClimbEntry';
import { sessionOwner } from '@/db/media';
import { MediaCard } from '@/features/media/MediaCard';
import { offerUndo } from '@/store/undo';
import { rankFor, rankLabel } from '@/engine/economy';
import { openAt, openedViewFor } from '@/lib/openedView';
import { useSettings, type LogView } from '@/store/settings';
import type { SessionXp } from '@/engine/xp';
import {
  announcementFor,
  headlineMilestone,
  recordsInReward,
  sessionMilestones,
  type Milestone,
  type MilestoneKind,
} from '@/engine/milestones';
import { achievementCard, recordCard } from '@/ui/shareCard';
import { useClimberAvatar } from '@/ui/useClimberAvatar';
import {
  ACHIEVEMENT_COUNT,
  deriveAchievements,
  earnedCount,
  earnedSince,
  type Achievement,
} from '@/engine/achievements';
import { ShareButton } from '@/features/share/ShareSheet';
import {
  describeSpan,
  durationFromSpan,
  elapsedMs,
  formatClock,
  isLive,
  isStale,
} from '@/engine/live';
import { DELOAD_STEP, easedDose, easesAnything, prescriptionFor, type PlannedDay } from '@/engine/plan';
import { prescriptionLine } from '@/engine/prescription';
import { DEFAULT_TARGET_SECONDS, focusFor, generateWarmup, type WarmupPlan } from '@/engine/warmup';
import type { CooldownPlan } from '@/engine/cooldown';
import { V_GRADES, YDS_GRADES, displayGrade, type GradeScale } from '@/engine/grades';
import type { Climb, LoggedExercise, ProjectAttempt, RopeStyle, Session, WallAngle } from '@/db/sessions';
import type { AttemptOutcome } from '@/db/projects';
import { OUTCOME_HIGH_POINT, OUTCOME_LABEL } from '@/engine/projects';
import { useGame, useXp } from '@/store/game';
import { useProjects } from '@/store/projects';
import { useSkillEffects } from '@/store/skills';
import { useProfile, type Injury } from '@/store/profile';
import type { BodyPart } from '@/content/bodyParts';
import { useSessions, allSessions } from '@/store/sessions';
import {
  NAME_LIMIT,
  cleanName,
  knownPartners,
  withPartner,
  withoutPartner,
} from '@/engine/partners';
import { againstPrescription, lastLogged } from '@/engine/exerciseLog';
import { circuitPlan } from '@/engine/circuit';
import { circuitSubject, protocolSubject, type TimerSubject } from '@/engine/timer';
import { protocolsIn, SafetyNote } from './SafetyNote';
import { ExerciseNumbers } from './ExerciseNumbers';
import { RestTimer } from './RestTimer';
import { TallyRow } from './TallyRow';
import { keepAwake, releaseAwake } from '@/lib/wakeLock';
import { useTemplates } from '@/store/templates';
import { parseCount } from '@/content/types';
import { BackLink } from '@/ui/BackLink';
import { DisclosureButton } from '@/ui/Disclosure';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Checkbox, Input, Select, TextArea } from '@/ui/Field';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { announce } from '@/ui/Announce';
import { Term } from '@/ui/Term';
import { TimerSheet } from '@/ui/TimerSheet';
import {useGradeLabel} from '@/ui/useGrade';
import { derivedField, gradeDisagreements } from '@/engine/sessionFields';
import { alreadySaved, applyTemplate, rankTemplates, suggestName } from '@/engine/templates';
import { canMerge, describeSession } from '@/engine/sessionEdit';
import { concerning, injuryPolicy } from '@/engine/injury';
import { climbOutcome, gymSummary } from '@/engine/gym';
import {
  ASKED_BY_FINGERS,
  FINGER_ANSWERS,
  FINGER_CHIP,
  SLEEP_ANSWERS,
  SLEEP_CHIP,
  TISSUE_ANSWERS,
  TISSUE_CHIP,
  readCheckIn,
  readinessFor,
  type CheckIn,
  type ReadinessCall,
  type TissueFeel,
} from '@/engine/readiness';
import { describeParts, drillConflict, exerciseConflict, exerciseLoads, unspokenFor } from '@/engine/bodyLoad';
import { REST_ITEMS } from '@/engine/restHabits';
import { startedAsRest } from '@/engine/rest';
import { VENUE_LIST_ID, VenueOptions, useVenues } from '@/features/venues/useVenues';
import { BadParameter } from '@/ui/RecordNotFound';
import { DayHeading } from './DayHeading';
import { usePlannedDay } from './usePlannedDay';
import { DayNudges, PreSessionCard, useStartSession } from './PreSession';

function rid(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * The date has to be a date before anything else happens (PLAN.md M42).
 *
 * A wrapper rather than an early return inside the page: the page runs
 * twenty-odd hooks off this value, and hooks cannot be skipped. This way the
 * page is never mounted with a date that is not one.
 *
 * **Today is a page again** (PLAN.md M124). From M117 to M123 this address
 * bounced to Home, because Home *was* the log; Home shows what is on today
 * and hands the logger the tap now, so every day including today lives
 * here, under one address, with one back link.
 *
 * That back link is the one thing today does differently. Every other day
 * is reached from the calendar and `routes.ts` says so; today is reached
 * from Home, and a page that sent a climber to the calendar they did not
 * come from would be the M13 mistake — a back link pointing at one of three
 * ways in, and not the one most people take.
 */
export function LogPage({ params }: { params: { date: string } }) {
  if (!isDateKey(params.date)) {
    return (
      <BadParameter expected="a date, like 2026-09-10" got={params.date} goTo="/" goLabel="Go to today">
        Dates are written year, month, day, with both the month and the day padded to two digits.
      </BadParameter>
    );
  }
  return (
    <>
      {params.date === today() ? <BackLink href="/" title="Home" /> : <BackLink />}
      <DayHeading date={params.date} />
      <DayBody date={params.date} />
    </>
  );
}

/**
 * One day's log, under whatever heading the page put above it.
 *
 * Exported because Home renders it for today (PLAN.md M117). The heading
 * and the back link belong to the page — Home has no back and owns its
 * own heading — so this starts at the first card.
 */
export function DayBody({ date }: { date: string }) {
  const { program, day, trackId } = usePlannedDay(date);
  // The plan and the way to begin, shared with the card Home shows
  // (PLAN.md M124), so a session started from either is the same record.
  const { start } = useStartSession(date);

  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const update = useSessions((s) => s.update);
  const remove = useSessions((s) => s.remove);
  const restore = useSessions((s) => s.restore);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const sessions = byDate[date] ?? [];
  // A day can hold several sessions — the schema always allowed it, nextIndex
  // hands out the slots, and templates create them. Showing only the first
  // made the rest invisible, which reads as data loss.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === selectedId) ?? sessions[0];

  return (
    <>
      <div className="grid grid-cols-1 gap-3">
        {/* Shared with Home, which shows them above the day's card
            (PLAN.md M124). */}
        <DayNudges date={date} />

        {!session && (
          <>
            <PreSessionCard date={date} />

            <TemplatePicker date={date} onApplied={() => undefined} />

            {day?.drill && (
              <Card title="Drill this week">
                <div className="font-semibold text-sm mb-1">{day.drill.name}</div>
                <p className="text-sm text-ink-soft leading-relaxed">{drillText(day.drill.id)}</p>
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
            onClick={() => void start(day?.sessionType?.id)}
          >
            <Plus size={15} /> Add another session today
          </Button>
        )}
      </div>
    </>
  );
}

/**
 * The five minutes the app's own guide already asked for (PLAN.md M112).
 *
 * Below Effort rather than above it, because what it is weighted toward is
 * read out of the session — climbs, notes, exercises — and a card that
 * offered itself before any of that was entered would be offering a generic
 * one. It is not shown on a rest day at all: the branch it sits in is the
 * one for days that had a session.
 */
function CooldownCard({ session }: { session: Session }) {
  const injuries = useProfile((s) => s.injuries);
  const [built, setBuilt] = useState<{ plan: CooldownPlan; because: string | null } | null>(null);

  /**
   * Loaded on the tap, not on the page.
   *
   * `LogPage` is one of the four routes that cannot be deferred, so anything
   * it imports is in the entry chunk of every cold start. The twelve
   * stretches and their prose cost **2.23KB gzipped** measured there, for a
   * card most visits never open — and `sessionParts` drags the whole
   * keyword scanner in behind it. The sentence is computed here too, so
   * nothing from either module is needed at render.
   */
  async function build(seed?: number) {
    const [{ describeCooldown, generateCooldown }, { sessionParts }] = await Promise.all([
      import('@/engine/cooldown'),
      import('@/engine/tissueLoad'),
    ]);
    const plan = generateCooldown({
      loaded: sessionParts(session),
      // The same policy the warmup uses: what load should stay off.
      injuries: injuryPolicy(injuries).excluded,
      ...(seed !== undefined ? { seed } : {}),
    });
    setBuilt({ plan, because: describeCooldown(plan) });
  }

  return (
    <Card title="Cooldown">
      {!built ? (
        <>
          <p className="text-sm text-ink-soft mb-3">
            Light stretches, three to five minutes, weighted toward what this session actually worked.
          </p>
          <Button variant="outline" className="w-full" onClick={() => void build()}>
            <Snowflake size={16} /> Build me a cooldown
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-ink-soft">
              {Math.round(built.plan.totalSeconds / 60)} min · {built.plan.exercises.length} stretches
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void build(Math.floor(Math.random() * 1_000_000))}
              className="text-accent"
            >
              <RotateCw size={14} /> Swap
            </Button>
          </div>

          {/* Null when there is nothing true to say, rather than a caption. */}
          {built.because && <p className="text-sm text-ink-soft mb-3">{built.because}</p>}

          {built.plan.injuryFilterRelaxed && (
            <p className="text-sm flex gap-2 items-start mb-3">
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
              Everything here works something you have injured. Go gently, or skip it.
            </p>
          )}

          <ol className="grid grid-cols-1 gap-2 mb-3">
            {built.plan.exercises.map((e, i) => (
              <li key={e.id} className="bg-sunken rounded-xl p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-ink-soft">{i + 1}</span>
                  <span className="font-semibold text-sm flex-1">{e.name}</span>
                  <span className="text-xs text-ink-soft">{e.seconds}s</span>
                </div>
                <p className="text-sm text-ink-soft mt-1 leading-relaxed">{e.description}</p>
              </li>
            ))}
          </ol>

          {built.plan.excluded.length > 0 && (
            <p className="text-xs text-ink-soft">
              Left out because of your injuries:{' '}
              {[...new Set(built.plan.excluded.map((x) => x.exercise.name))].join(', ')}.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

/**
 * The drill this session is carrying (PLAN.md M164).
 *
 * Its own component because it is rendered twice — on a training day and on a
 * rest day — and it used to be written once, inline, inside the training half
 * of an `isRest` ternary. A rest session with a `drillId` on it therefore
 * showed nothing, which is the state the whole of M164 exists to fix.
 */
function DrillCard({
  drill,
  session,
  hurtParts,
  patch,
  setTimer,
}: {
  drill: Drill;
  session: Session;
  hurtParts: BodyPart[];
  patch: (fields: Partial<Session>) => void;
  setTimer: (timer: { subject: TimerSubject; completes?: string }) => void;
}) {
  // The drill's own protocol, if it names one: eleven of the 144 do, and the
  // rules on them are the ones this screen was never showing (PLAN.md M153).
  const protocol = drill.protocolId ? getProtocol(drill.protocolId) : undefined;
  // Only about the injuries the drill's protocol has not already addressed
  // in the author's own words — see `unspokenFor` (PLAN.md M267).
  const clash = drillConflict(drill, unspokenFor(protocol, hurtParts));
  return (
    <Card title="Drill">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm">{drill.name}</div>
          <p className="text-xs text-ink-soft mt-0.5">
            {drill.duration} · {drill.focus}
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
      <p className="text-sm text-ink-soft leading-relaxed">{drillText(drill.id)}</p>
      <SafetyNote protocol={protocol} injured={hurtParts} />
      {clash ? (
        <p className="text-warn text-xs mt-2 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          <span>
            Loads {describeParts(clash.parts)} — {clash.because}.
          </span>
        </p>
      ) : null}
      {protocol?.timer ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            setTimer({
              subject: protocolSubject(
                protocol,
                drill.name,
                drill.timerOverride?.sets ?? 2,
                drill.timerOverride,
              )!,
              completes: drill.name,
            })
          }
          className="mt-3 text-accent"
        >
          <Timer size={15} /> Open the {protocol.name} timer
        </Button>
      ) : null}
    </Card>
  );
}

function WarmupCard({
  session,
  day,
  onWarmedUp,
}: {
  session: Session;
  day: PlannedDay | undefined;
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
  day: PlannedDay | undefined;
  trackId: string | undefined;
  /** The day's other sessions, which this one can be merged into. */
  others: Session[];
  onChange: (s: Session) => void;
  onDelete: () => void;
  onMoved: (s: Session) => void;
}) {
  const type = program?.sessionTypes.find((t) => t.id === session.sessionTypeId);
  const gradeLabel = useGradeLabel();
  /**
   * The plan **or** the record (PLAN.md M191).
   *
   * `type?.isRest` alone meant the rest editor existed only inside a
   * program, so a climber with no program had nowhere to tick a recovery
   * checklist — while the coach's `domain:rest` card told them they had
   * never logged a rest day and sent them to `/today`, which offered
   * *Search* and *Log a session* and never used the word.
   */
  const isRest = type?.isRest === true || startedAsRest(session);
  const patch = (p: Partial<Session>) => onChange({ ...session, ...p });

  /**
   * Quick or full (PLAN.md M120).
   *
   * The logger is a long page — check-in, climbs, session questions,
   * project burns, the prescription, the drill, the warmup, effort,
   * cooldown, notes, photos, templates — and the three things a session
   * needs are the climbs, the effort and the button. Quick is those, plus
   * the prescription when the program wrote one, because on a fingerboard
   * day the prescription *is* the session. Everything else unfolds behind
   * "More", and the fold is remembered on the device beside the theme:
   * a climber who fills in the check-in every time should not have to open
   * it every time.
   */
  const logView = useSettings((st) => st.logView);
  const setLogView = useSettings((st) => st.setLogView);
  /**
   * The view this session was opened in beats the stored one (PLAN.md M297).
   *
   * **State, not a derived read.** The first version computed
   * `openedViewFor(date) ?? logView` on every render and let the settings
   * store do the re-rendering — which works until the preference already
   * holds the value the toggle is about to write. Opened quick with *full*
   * stored, *More* wrote `full` over `full`, zustand saw no change, nothing
   * re-rendered, and the button did nothing at all. A test caught it.
   *
   * Decided once at mount, which is M286's lesson about a fact that
   * belongs to arriving rather than to the record.
   */
  const [view, setView] = useState<LogView>(() => openedViewFor(session.date) ?? logView);
  const full = view === 'full';

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
  const units = useSettings((st) => st.units);
  // Last time's numbers for every exercise on the card, worked out once
  // rather than per row (PLAN.md M98).
  const allSessions = useMemo(() => Object.values(allByDate).flat(), [allByDate]);
  const lastFor = (name: string) => {
    const point = lastLogged(allSessions, name, session.date);
    return point === null ? null : { date: point.date, entry: point.entry };
  };
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

  // The screen stays on while the session is live (PLAN.md M74, here since
  // M120): a phone that sleeps between burns is a phone you unlock forty
  // times a session. Not while stale — a session left open overnight is
  // not one anybody is standing under.
  useEffect(() => {
    if (!live || stale) return;
    void keepAwake();
    return () => void releaseAwake();
  }, [live, stale]);

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
  // Sticky for the session, like the grade: a climber on a spray wall is on
  // it for an hour, and nothing is selected until they say so (PLAN.md M108).
  const [angle, setAngle] = useState<WallAngle | null>(null);
  const [ropeStyle, setRopeStyle] = useState<RopeStyle | null>(null);
  const [climbName, setClimbName] = useState('');
  // `completes` is the exercise to tick when the clock runs out. A circuit
  // has none: the exercises it runs are the ones already ticked, which is how
  // it knew which of a nine-item menu to count (PLAN.md M99).
  const [timer, setTimer] = useState<{ subject: TimerSubject; completes?: string } | null>(null);

  // A timer left running when the page went away comes back where it was —
  // the M19 finding: this was component state and nothing else, so a refresh
  // or a phone reclaiming the tab restarted a hangboard protocol from set one.
  const [resume, setResume] = useState<{ baseElapsed: number; startedAt: number | null }>();
  useEffect(() => {
    const saved = loadTimerState(session.id);
    if (!saved) return;
    setResume({ baseElapsed: saved.baseElapsed, startedAt: saved.startedAt });
    setTimer({
      subject: saved.subject,
      ...(saved.subject.steps === undefined ? { completes: saved.subject.subtitle ?? saved.subject.title } : {}),
    });
  }, [session.id]);

  // Presence is the tick (PLAN.md M98): an entry here is an exercise that
  // was done, and its numbers are optional.
  const loggedExercises = session.exercises ?? [];
  const entryFor = (name: string) => loggedExercises.find((e) => e.name === name);
  const markExerciseDone = (name: string) =>
    patch({
      exercises: entryFor(name)
        ? loggedExercises.filter((e) => e.name !== name)
        : [...loggedExercises, { name }],
    });
  const patchExercise = (next: LoggedExercise) =>
    patch({ exercises: loggedExercises.map((e) => (e.name === next.name ? next : e)) });

  function addClimb() {
    const name = climbName.trim();
    const result: Climb['result'] = outcome === 'attempt' ? 'attempt' : 'send';
    const style = outcome === 'onsight' || outcome === 'flash' ? outcome : undefined;
    // Only a rope has a lead (PLAN.md M108).
    const rope = scale === 'YDS' && ropeStyle ? ropeStyle : undefined;
    // A named climb never merges into an unnamed tally — the name is what
    // makes project auto-suggest possible — and nor do two different styles.
    // Angle and rope style join the key for the same reason: two V5s on
    // different walls are two rows, or the angle they were logged with is
    // whichever one happened to be tapped first.
    const existing = session.climbs.find(
      (c) =>
        c.grade === grade &&
        c.scale === scale &&
        c.result === result &&
        c.style === style &&
        c.angle === (angle ?? undefined) &&
        c.ropeStyle === rope &&
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
            ...(angle ? { angle } : {}),
            ...(rope ? { ropeStyle: rope } : {}),
            ...(name ? { name } : {}),
          } as Climb,
        ];
    patch({ climbs });
    setClimbName('');
  }

  function bump(climb: Climb, by: number) {
    const next = climb.count + by;
    if (next <= 0) {
      // The row goes, and a mis-tap on the minus should not cost a re-entry
      // through the grade picker (PLAN.md M79).
      const before = session.climbs;
      patch({ climbs: before.filter((c) => c.id !== climb.id) });
      offerUndo(`${gradeLabel(climb.scale, climb.grade)} ${climbOutcome(climb)}`, async () =>
        patch({ climbs: before }),
      );
      return;
    }
    patch({ climbs: session.climbs.map((c) => (c.id === climb.id ? { ...c, count: next } : c)) });
  }

  const summary = gymSummary(session.climbs);
  const summaryLine =
    `${summary.total} climb${summary.total === 1 ? '' : 's'} · ${summary.sends} sent · ${summary.attempts} tried` +
    (summary.hardest ? ` · hardest ${gradeLabel(summary.hardest.scale, summary.hardest.grade)}` : '');

  // The week too (PLAN.md M127): a phase's prescription is four weeks of
  // one dose unless the block said how it moves, and the day knows which
  // week it is.
  const blocks =
    type && day?.phase ? prescriptionFor(type, day.phase, trackId, day.week, day.isDeload) : [];
  /**
   * The drill this session is actually carrying (PLAN.md M132).
   *
   * The session's own `drillId` first, the plan's for the week second. They
   * agree for every planned session — starting one stamps the plan's drill
   * onto it — and they differ exactly when a climber chose one from the
   * library, which is the case this card did not render at all. Found in a
   * browser: the id was written, the card kept showing the plan's drill or
   * nothing, and a drill that cannot be seen cannot be ticked done, so
   * `drillsCompleted` stayed at zero and the coach kept asking.
   */
  const drill = (session.drillId ? getDrill(session.drillId) : undefined) ?? day?.drill;
  // What today actually loads, so the check-in does not tell a climber on a
  // legs-and-core day to leave the fingerboard alone.
  const loads = type
    ? [...new Set(blocks.flatMap((b) => b.entry.exercises).flatMap(exerciseLoads))]
    : undefined;
  // Through `readCheckIn`, so a stored answer this version cannot read is
  // treated as no answer rather than as a bad one (PLAN.md M244). Spread
  // straight into `readinessFor` it made the cost `NaN`, which reads as
  // *adjusted*: the card printed "Nothing flagged. — the check-in suggested
  // 7 or below." and eased a set off every block. A ceiling contradicted by
  // its own reason is the one thing M129 built this card not to do.
  const checkIn = readCheckIn(session.checkIn);
  const readiness = checkIn
    ? readinessFor(checkIn, { ...(loads ? { loads } : {}), test: day?.test !== undefined })
    : null;
  // Only where the answers ask for less and some block has a notch to give.
  // The rule is in the engine, where it can be tested against a session that
  // has nothing left to take.
  const suggesting = readiness !== null && easesAnything(blocks, readiness.lighten);

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
        {/* Where this session came from, when it was not typed here
            (PLAN.md M155). The field has been written by the importer since
            M105 and its own comment names two readers — *"the climber
            reading their own calendar"*, and an undo — and neither existed:
            `store/undo.ts` carries a closure and never reads it. The
            calendar cell is 40px and already carries the day's effort and
            its marks; this is the screen a climber actually reads a session
            on. */}
        {session.imported === 'csv' && (
          <p className="text-xs text-ink-soft mb-1.5">
            Imported from a spreadsheet — the numbers here were not typed in the app.
          </p>
        )}
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
        <>
          {/* The drill the rest day is carrying (PLAN.md M164).
              `isRest` and the editor's other half were a ternary, and the
              drill card was inside the *other* branch — so a rest session
              with a `drillId` on it rendered nothing about the drill at
              all. Not hypothetical: `DrillPage`'s "add to today" writes
              `drillId` and navigates here, and on a rest day it handed the
              climber a screen with no sign of the drill they just picked.
              That is the same bug its own comment records being found in a
              browser for the quick/full case and fixed only there.

              Not gated on `full`, unlike the training-day one: the rest
              branch has no quick view to be the short half of, so gating
              would hide it from whichever view the climber happens to be
              in. */}
          {drill && (
            <DrillCard
              drill={drill}
              session={session}
              hurtParts={hurtParts}
              patch={patch}
              setTimer={setTimer}
            />
          )}
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
        </>
      ) : (
        <>
          {full && (
            <CheckInCard
              // Also the read one (PLAN.md M244). Given the record verbatim,
              // the card's draft starts holding the word it cannot read, so
              // answering the *other* question wrote it straight back — the
              // climber could never clear it without noticing they had to
              // re-answer both. Unreadable is unanswered, here as everywhere.
              checkIn={checkIn ?? undefined}
              readiness={readiness}
              injured={askablePartsOf(editorInjuries)}
              onAnswer={(checkIn) => patch({ checkIn })}
            />
          )}

          <Card title="Climbs">
            {/* Above the button it applies to (PLAN.md M130). It shipped
                below, so the natural gesture — pick the grade, pick the
                outcome, tap Add — filed every climb unnamed and left the
                field reading as leftover. Named climbs are what feed
                project suggestion and what the tally row already knows how
                to show, so the ordering was quietly costing a feature. */}
            <Input
              value={climbName}
              onChange={(e) => setClimbName(e.target.value)}
              placeholder="Name it (optional) — named climbs can become projects"
              aria-label="Climb name"
              className="mb-3"
            />

            <ClimbEntry
              scale={scale}
              grade={grade}
              outcome={outcome}
              angle={angle}
              ropeStyle={ropeStyle}
              onScale={setScale}
              onGrade={setGrade}
              onOutcome={setOutcome}
              onAngle={setAngle}
              onRopeStyle={setRopeStyle}
              onAdd={addClimb}
            />

            {session.climbs.length === 0 ? (
              <RepeatLast
                previous={previousClimbs}
                onRepeat={(climbs) => patch({ climbs: climbs as Climb[] })}
              />
            ) : (
              <>
                <ul className="grid grid-cols-1 gap-2">
                  {session.climbs.map((c) => (
                    <TallyRow
                      key={c.id}
                      climb={c}
                      label={gradeLabel(c.scale, c.grade)}
                      onBump={(by) => bump(c, by)}
                    />
                  ))}
                </ul>
                <p className="text-sm text-ink-soft mt-3">{summaryLine}</p>
              </>
            )}
          </Card>

          {/* Rest between burns, while the session is live (PLAN.md M74,
              here since M120). Under the climbs because that is where the
              thumb is between them. */}
          {live && !stale && <RestTimer sessionId={session.id} now={now} />}

          {/* In both views since M295, with the quick one carrying the
              three facts about the day and the fold keeping the program's
              own questions. `mode`, `location` and `conditions` were each
              built because the field had no writer, and all three sat
              behind a fold that defaults to closed. */}
          <FieldsCard session={session} type={type} onChange={onChange} compact={!full} />

          {full && <ProjectBurnsCard session={session} onChange={onChange} />}

          {blocks.length > 0 && (
            <Card title="Today's prescription">
              {/* Said once for the session, not once per block (PLAN.md
                  M128). The derived note is the same sentence for every
                  block the rule touched, and on Iron Grip's deload week the
                  browser showed it four times down one card. A block whose
                  program wrote its own deload keeps that below, because
                  that one is about the block. */}
              {blocks.some((b) => b.step === DELOAD_STEP) && (
                <p className="text-xs text-ink-soft leading-relaxed mb-3 flex items-start gap-1.5">
                  <TrendingUp size={13} className="text-warn shrink-0 mt-0.5" />
                  <span>{DELOAD_STEP}</span>
                </p>
              )}
              {/* What this morning's check-in suggests taking off (PLAN.md
                  M129). The readiness engine has computed an RPE ceiling
                  and a set of body-part flags since M72, and both already
                  reached the screen — the ceiling beside the effort field,
                  the flags on the lines that load them. What never reached
                  it was the dose: a climber who said they had barely slept
                  was shown the same five sets as anyone.

                  It is a suggestion and stays one. The program's numbers
                  are where they were; this sits beside them, with the
                  answers that produced it, and the climber decides. Two
                  questions and a rule is not standing to overrule a
                  program. */}
              {suggesting && (
                <p className="text-xs text-ink-soft leading-relaxed mb-3 flex items-start gap-1.5">
                  <TrendingDown size={13} className="text-accent shrink-0 mt-0.5" />
                  <span>
                    Your check-in suggests less of it today — {readiness!.because}. What each dose
                    would be is beside it; taking it is your call.
                  </span>
                </p>
              )}
              {blocks.map((b) => (
                <div key={b.blockId} className="mb-3 last:mb-0">
                  <h4 className="text-xs font-bold uppercase tracking-widest text-accent mb-1.5">{b.name}</h4>
                  {/* What this week asks that last week did not (PLAN.md
                      M127). Above the dose rather than beside it, because
                      it is the reason the numbers below changed — and it
                      is the whole content of a step that moves nothing a
                      field can hold. */}
                  {b.step && b.step !== DELOAD_STEP && (
                    <p className="text-xs text-ink-soft leading-relaxed mb-2 flex items-start gap-1.5">
                      <TrendingUp size={13} className="text-accent shrink-0 mt-0.5" />
                      <span>{b.step}</span>
                    </p>
                  )}
                  {/* The circuit, on the clock (PLAN.md M99). It runs over the
                      exercises that are ticked, because twelve of the
                      seventeen authored circuits are menus and which of the
                      nine you are doing is the climber's choice, not the
                      program's — so the tick is the pick. */}
                  {b.entry.circuit &&
                    (() => {
                      const picked = b.entry.exercises
                        .map((e) => e.name)
                        .filter((name) => entryFor(name) !== undefined);
                      const plan = circuitPlan(b.entry.circuit!, picked.length);
                      if (!plan.ok) {
                        return (
                          <p className="text-xs text-ink-soft mb-2 leading-relaxed">{plan.because}</p>
                        );
                      }
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setTimer({
                              subject: circuitSubject(b.entry.circuit!, b.name, picked)!,
                            })
                          }
                          className="mb-2 text-xs font-bold uppercase tracking-wide text-accent border-accent/40"
                        >
                          <Timer size={13} />
                          Run the circuit
                        </Button>
                      );
                    })()}
                  {/* How the block is meant to be run (PLAN.md M90). The
                      logger had the whole prescription in hand and rendered
                      only the exercise list, so twenty-nine prescriptions
                      showed a menu as a checklist — Cruiser's technique
                      block put six cues on screen when the program asks for
                      one, and a climber doing all six is doing six times the
                      session. The count is of the rows actually shown, which
                      is what a track filter leaves behind. */}
                  {(() => {
                    const line = prescriptionLine(b.entry.selection, b.entry.circuit, b.entry.exercises.length);
                    if (!line && !b.entry.selection?.note) return null;
                    return (
                      <div className="mb-2">
                        {line && (
                          <p className="text-2xs font-bold uppercase tracking-wide text-ink-soft">{line}</p>
                        )}
                        {b.entry.selection?.note && (
                          <p className="text-xs text-ink-soft mt-0.5">{b.entry.selection.note}</p>
                        )}
                      </div>
                    );
                  })()}
                  {/* What the protocol's author wrote about not getting
                      hurt (PLAN.md M153). Once per method rather than once
                      per line: three campus exercises share three campus
                      rules, and repeating them nine times is how a warning
                      stops being read. */}
                  {protocolsIn(b.entry.exercises, getProtocol).map((protocol) => (
                    <SafetyNote key={protocol.id} protocol={protocol} injured={hurtParts} />
                  ))}
                  <ul className="grid grid-cols-1 gap-2">
                    {b.entry.exercises.map((ex, i) => {
                      const protocol = ex.protocolId ? getProtocol(ex.protocolId) : undefined;
                      const logged = entryFor(ex.name);
                      const isDone = logged !== undefined;
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
                              {(() => {
                                const eased = suggesting ? easedDose(ex, readiness!.lighten) : null;
                                return eased === null ? null : (
                                  <span className="text-accent font-semibold">
                                    {' '}
                                    · today {eased.sets} sets
                                  </span>
                                );
                              })()}
                            </div>
                            {ex.notes && <div className="text-ink-soft/80 text-xs italic mt-0.5">{ex.notes}</div>}
                            {(() => {
                              // An authored rule about the same injury has
                              // already been said, in the words of the person
                              // who wrote the program, so the scan's guess
                              // under it is noise (PLAN.md M153) — about
                              // that part. It is asked about the rest,
                              // which the rule never mentioned (M267).
                              // Advisory, never a refusal to show the program.
                              const clash = exerciseConflict(ex, unspokenFor(protocol, hurtParts));
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
                            {logged && (
                              <ExerciseNumbers
                                exercise={ex}
                                entry={logged}
                                units={units}
                                last={lastFor(ex.name)}
                                onChange={patchExercise}
                              />
                            )}
                            {/* What you logged against what the day asked
                                (PLAN.md M130). Derived — the entry stores no
                                block or phase, and does not need to: the day
                                knows its own prescription, and since M127 to
                                M129 that is the week's, after any deload.

                                Only when the two differ. "You did what was
                                asked" on every line of every session is the
                                kind of line that teaches people to stop
                                reading, and falling short is a fact the
                                climber typed rather than a fault. */}
                            {(() => {
                              if (!logged) return null;
                              const verdict = againstPrescription(logged, ex.sets);
                              if (verdict === null || verdict.verdict === 'met') return null;
                              return (
                                <div className="text-ink-soft text-xs mt-1 flex items-start gap-1.5">
                                  <TrendingDown size={12} className="shrink-0 mt-0.5" />
                                  <span>
                                    {verdict.did} {verdict.did === 1 ? 'set' : 'sets'}, against the{' '}
                                    {verdict.asked} asked.
                                  </span>
                                </div>
                              );
                            })()}
                          </div>
                          {protocol?.timer && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setTimer({
                                  subject: protocolSubject(protocol, ex.name, parseCount(ex.sets) ?? 1)!,
                                  completes: ex.name,
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

          {full && drill && (
            <DrillCard
              drill={drill}
              session={session}
              hurtParts={hurtParts}
              patch={patch}
              setTimer={setTimer}
            />
          )}

          {full && <WarmupCard session={session} day={day} onWarmedUp={() => patch({ warmup: true })} />}

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

          {full && <CooldownCard session={session} />}
        </>
      )}

      {full && <PartnersCard session={session} patch={patch} />}

      {/**
        * In both views since M296, because the app asks for one every day.
        *
        * `challenges.ts` sets a daily task reading *"Leave a note on
        * today's session — anything you noticed"*, and the box to write it
        * in was behind a fold that defaults to closed. One of those two was
        * wrong and it was not the task: the journal is built out of these,
        * and a note is what happened rather than what to make of it, which
        * is the line M295 drew.
        *
        * Photos stay behind the fold. They are the other half of what the
        * notes are for (M30) and they are not a daily thing.
        */}
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
      {full && (
        <MediaCard
          owner={sessionOwner(session.id)}
          blurb="The board you set, the wall on a trip, the sequence you want to remember. Photos are resized on the way in and live on this device — they go into a backup with everything else."
          fullNote="That is the limit for one session. Delete one to add another — storage here is finite and nothing is backed up anywhere but your own export."
        />
      )}

      {timer && (
        <TimerSheet
          subject={timer.subject}
          resume={resume}
          onPersist={(state) =>
            saveTimerState({ subject: timer.subject, sessionId: session.id, ...state })
          }
          onClose={() => {
            clearTimerState();
            setResume(undefined);
            setTimer(null);
          }}
          onComplete={() => {
            clearTimerState();
            const name = timer.completes;
            if (name !== undefined && entryFor(name) === undefined) markExerciseDone(name);
          }}
        />
      )}

      {session.completed && (
        <RewardCard session={session} onAcknowledge={() => patch({ rewarded: true })} />
      )}

      {full && session.completed && <SaveTemplateCard session={session} typeName={type?.name} />}

      {full && <CorrectionCard session={session} others={others} typeName={type?.name} onMoved={onMoved} />}

      {/* The fold itself. Above the button so the button stays last
          whichever way the page is showing.

          **It stopped listing what is behind it at M295.** The list read
          *"check-in, projects, warmup, notes, photos"* and there were ten
          cards back there — the drill, the cooldown, partners, the
          templates, the correction and, until this milestone, the three
          fields the app asks of everyone. A list that names half its
          contents is worse than no list, because it is read as the whole
          of it.

          The alternative was to name all ten, which wraps to three lines
          on a 360px phone and goes stale the next time a card moves. What
          is lost is a little discoverability, and what pays for it is the
          three questions that used to be the reason to open this now being
          in front of it. */}
      <Button
        variant="outline"
        className="w-full"
        aria-expanded={full}
        onClick={() => {
          const next = full ? 'quick' : 'full';
          // All three: what this render shows, what this date shows if the
          // climber comes back to it, and what they prefer from now on.
          // The fold's own buttons are the only thing that writes the last.
          setView(next);
          openAt(session.date, next);
          setLogView(next);
        }}
      >
        {full ? (
          <>
            <ChevronUp size={16} /> Less
          </>
        ) : (
          <>
            <ChevronDown size={16} />
            {isRest ? 'More about this day' : 'More about this session'}
          </>
        )}
      </Button>

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

/**
 * The open injuries worth asking about today (PLAN.md M103).
 *
 * Fingers and pulleys are left out: the check-in already asks how the
 * fingers feel, of everyone, and a second chip row for the same tissue is
 * the same question twice. A `returning` injury still counts — that is the
 * state where the answer changes most.
 */
function askablePartsOf(injuries: readonly Injury[]): BodyPart[] {
  return [...new Set(injuries.filter((i) => !ASKED_BY_FINGERS.includes(i.part)).map((i) => i.part))];
}

function CheckInCard({
  checkIn,
  readiness,
  injured,
  onAnswer,
}: {
  checkIn?: CheckIn;
  readiness: ReturnType<typeof readinessFor> | null;
  /** Open injuries the fingers question does not already cover (M103). */
  injured: BodyPart[];
  onAnswer: (checkIn: CheckIn) => void;
}) {
  const [draft, setDraft] = useState<Partial<CheckIn>>(checkIn ?? {});

  function pick(patch: Partial<CheckIn>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    if (next.fingers && next.sleep) onAnswer(next as CheckIn);
  }

  /** Answering a part is answering the check-in, so it saves like the rest. */
  function pickPart(part: BodyPart, feel: TissueFeel) {
    pick({ parts: { ...draft.parts, [part]: feel } });
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

      {/* One row per open injury (PLAN.md M103). An `Injury` says where a
          part stands now and nothing about how it got there, so the question
          every physio asks — how has it been? — had no data in an app holding
          both the injury and the sessions. */}
      {injured.map((part) => (
        <fieldset key={part} className="mt-3">
          <legend className="text-sm text-ink-soft mb-1.5">
            How is {describeParts([part])} today?
          </legend>
          <div className="grid grid-cols-3 gap-2">
            {TISSUE_ANSWERS.map((answer) => (
              <Chip
                key={answer}
                active={draft.parts?.[part] === answer}
                onClick={() => pickPart(part, answer)}
                className="justify-center text-center px-1"
              >
                {TISSUE_CHIP[answer]}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}

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
  compact = false,
}: {
  session: Session;
  type?: SessionType;
  onChange: (session: Session) => void;
  /**
   * The quick view's half of this card (PLAN.md M295).
   *
   * Where it happened, which kind of place it was and how the rock was:
   * three facts about **the day**, which is the line the fold is drawn on
   * now. The questions a *program* asks — pitches, high point, day of the
   * trip — stay behind it, because they are the plan's questions rather
   * than the day's, and a climber who has not opened More has not asked to
   * be asked them.
   *
   * The registry already knows which is which: `alwaysAsked` marks the
   * fields the logger puts to everyone rather than the ones a session type
   * declares. Read from there rather than listed here, so a fourth one
   * arrives in the right half by saying so in `fields.ts`.
   */
  compact?: boolean;
}) {
  const display = useSettings((s) => s.display);
  const gradeLabel = useGradeLabel();
  // Every place already named, so the same crag is typed the same way
  // (PLAN.md M88b). A grouping over free text is only as good as the text.
  const places = useVenues();
  /**
   * Where you climbed, asked of everyone (PLAN.md M133).
   *
   * `location` is a `FieldSpec` like any other, and the logger only renders
   * what the running session type declares — seven types across three
   * programs, five of them Outdoor Climbing's. So a climber on Iron Grip
   * was never once asked where they trained, `venues()` saw only the places
   * typed into projects and objectives, and Career's *Where you climb* card
   * starved for most of the catalogue.
   *
   * It is not a program's question. Which crag, which gym, which board is a
   * fact about the day, and every other reader of it — the venue grouping,
   * trips, the spreadsheet's `Place` column — wants it from every session,
   * not from the five that happen to be outdoor types.
   *
   * A rest day is not asked, and there is no check for it here: the logger
   * renders a recovery checklist instead of this whole branch when the
   * session type is a rest one. A guard was written anyway and a mutation
   * showed it by surviving — a line no test could reach, because nothing
   * reaches it.
   */
  const declared = type?.fields ?? [];
  const everyone: FieldId[] = declared.includes('location') ? declared : ['location', ...declared];
  /**
   * And how the rock was, on a day outdoors (PLAN.md M289).
   *
   * The same argument as `location` above, narrowed by the one thing that
   * makes it worth asking: indoors the answer is the same every time, and a
   * question whose answer never varies is a question that trains a climber
   * to stop reading the form. `mode` is the writer of that — set from the
   * session type when the day starts and corrected by the chips above — so
   * turning the day to *On rock* puts the question there.
   */
  const asked: FieldId[] =
    session.mode === 'outdoor' && !everyone.includes('conditions')
      ? [...everyone, 'conditions']
      : everyone;
  const all = asked.map(getField).filter((f): f is FieldSpec => f !== undefined);
  // The quick half keeps only what the logger asks of everyone. `mode` is
  // not a `FieldSpec` and is always here: it is the chip row that decides
  // whether `conditions` is asked at all.
  const specs = compact ? all.filter((f) => f.alwaysAsked !== undefined) : all;

  const set = (id: FieldId, value: string | number | undefined) => {
    const { [id]: _dropped, ...rest } = session.fields ?? {};
    const fields = value === undefined || value === '' ? rest : { ...rest, [id]: value };
    onChange({
      ...session,
      ...(Object.keys(fields).length > 0 ? { fields } : { fields: undefined }),
    });
  };

  // Where a typed grade and the session's own climbs disagree (PLAN.md
  // M88). Reported here rather than on a progress page because this is the
  // one screen where either side can still be corrected.
  const clashes = compact ? [] : gradeDisagreements(session);

  return (
    <Card title="This session">
      {clashes.length > 0 && (
        <ul className="grid grid-cols-1 gap-2 mb-3">
          {clashes.map((clash) => (
            <li
              key={clash.spec.id}
              className="flex items-start gap-2 text-xs leading-relaxed bg-sunken rounded-xl p-3"
            >
              <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" aria-hidden />
              <span>
                You put <strong>{gradeLabel(clash.scale, clash.said)}</strong> for
                {' '}{clash.spec.label.toLowerCase()}, and the hardest in the climbs below is{' '}
                <strong>{gradeLabel(clash.scale, clash.logged)}</strong>. Both can be true — the
                hardest thing you touched is not always one you counted — but only the climbs
                reach your grades and records.
              </span>
            </li>
          ))}
        </ul>
      )}
      {/* Indoors or out (PLAN.md M170).
          Above the place, because it is the same question at its coarsest:
          the place names the crag or the gym, this says which kind it was.
          Asked of every session, like `location` since M133, because a
          climber on Iron Grip who went to the crag on Saturday is the case
          the session type cannot know about — the type sets the default
          when the day is started, and this is how the day gets corrected.

          Everything downstream of `mode` — the outdoor grade ladder, the
          "days since you were on rock" tip, the altimeter's multiplier,
          Career's outdoor counter, the "Get outside" challenge — had no
          writer at all before this, so every one of them read a climber who
          had never been outside. */}
      <div className="mb-3">
        {/* Not "Where": the `location` field below already carries that
            label, and it asks for the name of the place. This asks which
            kind of place it was. */}
        <span className="text-sm text-ink-soft block mb-1.5">Indoors or out</span>
        <div className="flex flex-wrap gap-2">
          {([
            ['indoor', 'Indoors'],
            ['outdoor', 'On rock'],
          ] as const).map(([value, label]) => (
            <Chip
              key={value}
              active={session.mode === value}
              onClick={() => onChange({ ...session, mode: value })}
            >
              {label}
            </Chip>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {specs.map((spec) => {
          const value = session.fields?.[spec.id];

          // Answered by the climbs (PLAN.md M120): the row shows the
          // answer, and a typed one that disagrees can be cleared in a tap.
          // Nothing is overwritten silently — see `gradeDisagreements`.
          const derived = derivedField(session, spec);
          if (derived !== null) {
            const shown =
              spec.kind === 'grade'
                ? gradeLabel(spec.scale === 'route' ? 'YDS' : 'V', String(derived))
                : String(derived);
            const typedOver = value !== undefined && String(value) !== String(derived);
            return (
              <div key={spec.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink-soft">{spec.label}</span>
                  <span className="font-bold tabular-nums">{shown}</span>
                </div>
                <p className="text-xs text-ink-soft mt-0.5">
                  From the climbs
                  {typedOver
                    ? `, not the ${spec.kind === 'grade' ? gradeLabel(spec.scale === 'route' ? 'YDS' : 'V', String(value)) : String(value)} you typed.`
                    : '.'}
                </p>
                {typedOver && (
                  <Button size="sm" variant="ghost" className="mt-1" onClick={() => set(spec.id, undefined)}>
                    Use the climbs
                  </Button>
                )}
              </div>
            );
          }

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

          if (spec.kind === 'choice') {
            return (
              <div key={spec.id}>
                <span className="text-sm text-ink-soft block mb-1.5">{spec.label}</span>
                <div className="flex flex-wrap gap-2">
                  {(spec.options ?? []).map((option) => (
                    <Chip
                      key={option}
                      active={value === option}
                      onClick={() => set(spec.id, value === option ? undefined : option)}
                    >
                      {option}
                    </Chip>
                  ))}
                </div>
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
                {...(spec.id === 'location' ? { list: VENUE_LIST_ID } : {})}
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
      <VenueOptions venues={places} />
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
    if (count <= 0) {
      // A burn row taken to zero can come back, high point and note with it
      // (PLAN.md M79). The whole list goes back, so order survives too.
      const before = attempts;
      onChange({ ...session, projectAttempts: before.filter((a) => a !== existing) });
      const name = projects.find((p) => p.id === projectId)?.name ?? 'Project';
      offerUndo(`${name} · ${OUTCOME_LABEL[outcome]}`, async () =>
        onChange({ ...session, projectAttempts: before }),
      );
      return;
    }
    onChange({
      ...session,
      projectAttempts: attempts.map((a) => (a === existing ? { ...a, count } : a)),
    });
  }

  // Burn notes are the fourth thing the journal reads, so they have to be
  // writable somewhere — here, beside the burn they describe.
  /**
   * Where the burn started (PLAN.md M102).
   *
   * Blank is the ground, which is what every burn logged before this meant
   * and what nearly every burn is — so the common case still costs nothing.
   */
  function startAt(attempt: ProjectAttempt, raw: string) {
    const typed = raw.trim() === '' ? undefined : Number(raw);
    if (typed !== undefined && !Number.isFinite(typed)) return;
    onChange({
      ...session,
      projectAttempts: attempts.map((a) =>
        a === attempt
          ? { ...a, from: typed === undefined ? undefined : Math.max(0, Math.min(100, typed)) }
          : a,
      ),
    });
  }

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
                      {/* Only where there is a link to describe: a rehearsal
                          starts nowhere in particular, and a send from the
                          ground is the whole climb by definition. */}
                      {/* A sized wrapper, not a width on the control: `Input`
                          sets `w-full` itself, and a `w-24` beside it is a
                          coin flip on Tailwind's emit order rather than a
                          width. The browser showed it as a full-width box on
                          its own line; M100 hit the same trap twice. */}
                      {a.outcome !== 'worked' && a.outcome !== 'send' && (
                        <span className="w-24 shrink-0">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            value={a.from ?? ''}
                            onChange={(e) => startAt(a, e.target.value)}
                            placeholder="From %"
                            aria-label={`Where the ${a.outcome} burns started, as a percentage`}
                            size="compact"
                          />
                        </span>
                      )}
                      <Input
                        value={a.note ?? ''}
                        onChange={(e) => note(a, e.target.value)}
                        placeholder="What happened?"
                        aria-label={`Note about the ${a.outcome} burns`}
                        className="flex-1 min-w-24" size="compact"
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
    const all = allSessions(byDate);
    const earlier = all.filter(
      (s) => s.completed && (s.date < session.date || (s.date === session.date && s.id < session.id)),
    );
    return sessionMilestones({
      session,
      records: recordsInReward(detail.reward.awards, session.date, session.mode),
      earlierSessions: earlier.length,
      earlierOutdoor: earlier.filter((s) => s.mode === 'outdoor').length,
      levelBefore: detail.levelBefore,
      levelAfter: detail.levelAfter,
      rankBefore: rankLabel(rankFor(detail.levelBefore)),
      rankAfter: rankLabel(rankFor(detail.levelAfter)),
      projectsSent: projects
        .filter((p) => p.status === 'sent' && p.sentDate === session.date)
        .map((p) => ({ name: p.name, grade: p.grade, scale: p.scale })),
      display,
    });
  }, [byDate, projects, display, session, detail]);
}

/**
 * What this session earned that the log did not have before it (M229).
 *
 * Twenty-six achievements existed from M32 and the engine had two readers,
 * both of them a list: you could earn every one of them and never once be
 * told. This is the same moment M26 built for the six milestones, using the
 * same split of the log the hook above uses — sessions before this one
 * against sessions including it — because "dated today" is not the same
 * question (see `earnedSince`).
 *
 * The derivation runs twice over the whole log, which sounds worse than it
 * is: twenty-six predicates over a year of sessions, memoised, against a
 * card that is already assembling a climber's records. It is not
 * `deriveClimberState`, which is the cost `milestones.ts` went out of its
 * way to avoid paying here.
 */
function useNewAchievements(session: Session): { earned: Achievement[]; total: number } {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const ascent = useGame((s) => s.ascent.days);

  return useMemo(() => {
    const all = allSessions(byDate);
    const before = all.filter(
      (s) => s.date < session.date || (s.date === session.date && s.id < session.id),
    );
    const input = { projects, ascent, programWeeks: (id: string) => getProgram(id)?.weeks };
    const after = deriveAchievements({ ...input, sessions: all });
    return {
      earned: earnedSince(deriveAchievements({ ...input, sessions: before }), after),
      total: earnedCount(after),
    };
  }, [byDate, projects, ascent, session.date, session.id]);
}

function RewardCard({ session, onAcknowledge }: { session: Session; onAcknowledge: () => void }) {
  const xp = useXp();
  const detail = xp.bySession[session.id];
  const levelled = detail !== undefined && detail.levelAfter > detail.levelBefore;
  const milestones = useSessionMilestones(session, detail);
  const lead = headlineMilestone(milestones);
  const { earned: unlocked, total: totalEarned } = useNewAchievements(session);
  /** An achievement carries the card when no milestone does — it is a shape
   *  in the log, which is more than "Session logged." */
  const achievementLead = lead === null ? (unlocked[0] ?? null) : null;
  const display = useSettings((s) => s.display);
  const [counting, setCounting] = useState(false);
  // Only derived when there is actually a card to put it on — see the hook.
  const avatar = useClimberAvatar(Boolean(lead?.shareable && lead.record));

  // The card appearing is the whole feedback for logging a session, and it
  // arrives without a navigation — so on screen it is unmissable and to a
  // screen reader it was, until this, completely silent. The record leads,
  // because "412 XP earned" says nothing about having just climbed the
  // hardest thing you ever have.
  useEffect(() => {
    if (detail === undefined || session.rewarded) return;
    announce(announcementFor(milestones, detail.xp, unlocked.map((a) => a.name)));
  }, [detail?.xp, session.rewarded, detail, session.id, milestones, unlocked]);

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
      {/* M26: when something happened, it is the card. The XP drops to a
          line underneath — a climber who has just done the hardest thing
          they ever have should not have to read an arithmetic breakdown to
          find that out. M118 made the no-milestone case the same line: a
          session is a session, and the number it paid is the game's
          business, one tap away on its own tab. */}
      {lead || achievementLead ? (
        <div className="text-center mb-3">
          <div className="text-2xs font-bold uppercase tracking-widest text-accent">
            {lead ? MILESTONE_EYEBROW[lead.kind] : 'Achievement'}
          </div>
          <div className="text-3xl font-black tracking-tight leading-tight mt-1">
            {lead ? lead.headline : achievementLead!.name}
          </div>
          <p className="text-sm text-ink-soft mt-1.5 leading-relaxed">
            {lead ? lead.detail : achievementLead!.detail}
          </p>
        </div>
      ) : (
        <p className="text-center font-bold mb-3">Session logged.</p>
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

      {/* Achievements this session earned, under whatever led (PLAN.md
          M229). The one that led the card is not repeated here. */}
      {unlocked.length > (achievementLead ? 1 : 0) && (
        <ul className="grid grid-cols-1 gap-1 mb-3">
          {unlocked.slice(achievementLead ? 1 : 0).map((a) => (
            <li key={a.id} className="flex items-baseline gap-2 text-sm">
              <Award size={13} className="text-accent shrink-0 translate-y-0.5" aria-hidden />
              <span className="min-w-0">
                <span className="font-semibold">{a.name}</span>
                <span className="block text-xs text-ink-soft leading-relaxed">{a.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The one quiet line (PLAN.md M118). */}
      <p className="text-sm text-ink-soft text-center mb-3 tabular-nums">
        +{detail.xp.toLocaleString()} XP
        {levelled && !lead && (
          <span className="text-accent font-semibold"> · level {detail.levelAfter}, {rankLabel(xp.rank)}</span>
        )}
      </p>

      {detail.reward.effortBraked && (
        <p className="text-sm flex gap-2 items-start mb-3">
          <AlertTriangle size={14} className="text-warn shrink-0 mt-0.5" />
          High load week — the effort bonus was withheld. Recover.
        </p>
      )}

      {/* The arithmetic, folded. It was the body of the card from M13 to
          M117 — every session ended in a ledger. It is still here for the
          climber who wants to know why one day paid more than another; it
          is no longer what logging a session looks like. */}
      <DisclosureButton
        open={counting}
        onToggle={() => setCounting(!counting)}
        className="mb-3"
        label="How it was counted"
      >
        <span className="flex items-center justify-between gap-2 text-xs text-ink-soft">
          <span>How it was counted</span>
          <ChevronDown
            size={14}
            className={`shrink-0 transition-transform ${counting ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </span>
      </DisclosureButton>
      {counting && (
        <div className="mb-3 bg-sunken rounded-xl p-3">
          <ul className="grid grid-cols-1 gap-1">
            {detail.lines.map((line, i) => (
              <li key={`${line.label}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-ink-soft truncate">{line.label}</span>
                <span className="font-semibold tabular-nums shrink-0">+{line.xp.toLocaleString()}</span>
              </li>
            ))}
          </ul>
          {detail.reward.multiplier !== 1 && (
            <p className="text-xs text-ink-soft mt-2">
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
        </div>
      )}

      <div className="grid grid-cols-1 gap-2">
        {/* The card for exactly this was written in M13 and reachable from
            nowhere until now. */}
        {lead?.shareable && lead.record ? (
          <ShareButton
            content={recordCard(lead.record.grade, lead.record.date, avatar, lead.record.scale, display)}
            filename={`personal-record-${lead.record.grade}`}
            label="Share this"
            className="w-full justify-center"
          />
        ) : (
          // One button, not two: a grade record is a thing you did and it
          // wins. An achievement takes the slot when there is no record in
          // it, rather than queueing behind one (PLAN.md M229).
          unlocked[0] && (
            <ShareButton
              content={achievementCard({
                name: unlocked[0].name,
                detail: unlocked[0].detail,
                date: unlocked[0].date!,
                earned: totalEarned,
                total: ACHIEVEMENT_COUNT,
              })}
              filename={`ascent-${unlocked[0].id}.png`}
              label="Share this"
              className="w-full justify-center"
            />
          )
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

/**
 * Who you climbed with (PLAN.md M237).
 *
 * Chips of everyone already in the log, most recent first, plus a box. So
 * recording a partner is one tap after the first time and a stranger is two
 * seconds — which is the difference between a field that gets used and a
 * field that sits empty for a year.
 *
 * Behind the *More* fold with the notes and the photos, because it is the
 * same kind of thing: the part of a session worth writing down and never the
 * part that has to be. Nothing in the app asks for it, nothing counts a
 * session as incomplete without it, and an empty field means nobody wrote one
 * down rather than that anyone climbed alone.
 */
function PartnersCard({
  session,
  patch,
}: {
  session: Session;
  patch: (fields: Partial<Session>) => void;
}) {
  const byDate = useSessions((s) => s.byDate);
  const [typed, setTyped] = useState('');
  const on = session.partners ?? [];

  // Everyone in the log minus everyone already on this session: a chip that
  // toggles off is the row below, and offering it twice is two controls for
  // one fact.
  const suggestions = useMemo(
    () =>
      knownPartners(allSessions(byDate)).filter(
        (name: string) => !on.some((p) => p.toLowerCase() === name.toLowerCase()),
      ),
    [byDate, on],
  );

  const add = (raw: string) => {
    const next = withPartner(on, raw);
    if (next.length !== on.length) patch({ partners: next });
    setTyped('');
  };

  return (
    <Card title="Who you climbed with">
      {on.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {on.map((name) => (
            <Chip
              key={name}
              active
              // Inline-flex, or the X wraps under a two-word name and the
              // chip doubles in height. Caught in the browser, not in jsdom,
              // which has no layout to wrap.
              className="inline-flex items-center gap-1.5"
              onClick={() => patch({ partners: withoutPartner(on, name) })}
            >
              {name}
              <X size={13} className="-mr-0.5 shrink-0" />
            </Chip>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(typed);
            }
          }}
          maxLength={NAME_LIMIT}
          placeholder="A name"
          aria-label="Who you climbed with"
          className="flex-1"
        />
        <Button variant="outline" onClick={() => add(typed)} disabled={cleanName(typed) === null}>
          <Plus size={15} /> Add
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {suggestions.slice(0, 8).map((name: string) => (
            <Chip key={name} active={false} onClick={() => add(name)}>
              {name}
            </Chip>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-soft mt-2 leading-relaxed">
        Stays on your phone. It rides your backup and your CSV, and never a
        share card.
      </p>
    </Card>
  );
}
