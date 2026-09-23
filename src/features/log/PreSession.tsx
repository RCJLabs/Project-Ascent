import { Suspense, useMemo } from 'react';
import { Link } from 'wouter';
import { AlertTriangle, ChevronRight, Clock, Flag, Plus, Ruler, Zap } from 'lucide-react';
import { INTENSITY_LABEL, type Drill, type Program, type SessionType } from '@/content/types';
import { TEST_REASON_LABEL } from '@/engine/assessments';
import { dayLoad, describeDayLoad } from '@/engine/bodyLoad';
import { shortLabel, today } from '@/engine/dates';
import { concerning, injuryPolicy } from '@/engine/injury';
import { type PlannedDay } from '@/engine/plan';
import { restDayDrill } from '@/engine/restDrill';
import { restStart, trainingStart } from '@/engine/sessionStart';
import { intensityOf } from '@/engine/scheduler';
import { describeWork, sessionMinutes } from '@/engine/sessionLength';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { openAt } from '@/lib/openedView';
import { type LogView } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { lazyRoute } from '@/ui/lazyRoute';
import { usePlannedDay } from './usePlannedDay';

const TestsToday = lazyRoute(
  () => import('./TestsToday'),
  (m) => m.TestsToday,
);

/**
 * The card you read before a session exists, and the button that makes one
 * (PLAN.md M124).
 *
 * Its own module, and not `LogPage.tsx`, for the reason `usePlannedDay` and
 * `DayHeading` have one: **Home shows this card and nothing else of the
 * logger.** From M117 to M123 Home *was* the logger — it imported `DayBody`
 * statically, so two thousand lines of editor sat in the entry chunk to
 * render one card with one button on it. Home is a front door again, this
 * card is what it shows of today, and the editor is behind the tap.
 *
 * Nothing about what the button *does* changed in the move. That logic is
 * M117's, tested from the outside since, and it is quoted below rather than
 * rewritten.
 */

export interface DayPlan {
  program: Program | undefined;
  day: PlannedDay | undefined;
  /** The session the day asks for, if the day asks for one. */
  primary: SessionType | undefined;
  /** What the one big button says. */
  label: string;
  /** Every other type the program offers, for the chips under it. */
  others: SessionType[];
  /** The warning about what today loads, or null when there is none. */
  loadNote: string | null;
  /**
   * One off-wall drill for a rest day, or null (PLAN.md M164). Null on a
   * training day, and null on a rest day where every one of them loads
   * something the climber said is hurt.
   */
  restDrill: Drill | null;
  /** The track this climber picked, where the program declares tracks. */
  trackId: string | undefined;
  start: (sessionTypeId?: string) => Promise<void>;
  /** Start today as a rest day, program or no program (PLAN.md M191). */
  startRest: () => Promise<void>;
  /** Whether the rest chip is worth offering — false when the big button is one. */
  offersRest: boolean;
}

/**
 * What kind of day this is, and roughly how long it takes (PLAN.md M131).
 *
 * Two facts the app had no way to state. **How hard** is the session's own
 * property now rather than something a reader infers from the exercise
 * names, and it is the same word the planner's back-to-back rule reads, so
 * the card and the calendar cannot disagree with the scheduler. **How
 * long** is derived from the prescription rather than authored, which is
 * why it is here at all: on a deload week it is a shorter number, and
 * nothing had to be written twice for that to happen.
 *
 * Silent about the length when the prescription cannot carry one — a
 * climbing day is burns with rests that end when you want to pull on
 * again — and that is most of the point. The question this answers is
 * "have I got time for this tonight", and the honest answer for a
 * projecting session is that the app does not know.
 */
function DayShape({
  day,
  program,
  trackId,
}: {
  day: PlannedDay;
  program: Program | undefined;
  trackId: string | undefined;
}) {
  const spent = useMemo(() => {
    if (!day.sessionType) return null;
    return describeWork(
      sessionMinutes({ type: day.sessionType, program, week: day.week, trackId, deload: day.isDeload }),
    );
  }, [day, program, trackId]);

  return (
    <p className="text-sm mb-3">
      <span className="font-semibold">{INTENSITY_LABEL[intensityOf(day.sessionType)]}</span>
      {spent && <span className="text-ink-soft"> · {spent}</span>}
    </p>
  );
}

/**
 * What the day asks for, and how to begin it.
 *
 * Shared by this card and by the logger's "Add another session today", so
 * a session started from Home and one started inside the log are the same
 * record — the same program id, track, drill and deload flag.
 */
export function useStartSession(date: string): DayPlan {
  const { program, day, trackId, activeProgramId } = usePlannedDay(date);
  const injuries = useProfile((s) => s.injuries);
  const create = useSessions((s) => s.create);

  // Counted before the session starts, because this is the card you read
  // before you leave the house (PLAN.md M89). The per-exercise flags in the
  // session are still there; they arrive too late to change a decision
  // about the day. Once a session exists the card is gone, and with it the
  // warning: after the session it is a verdict on something already
  // climbed.
  const hurt = useMemo(() => concerning(injuryPolicy(injuries)), [injuries]);
  const loadNote = useMemo(() => (day ? describeDayLoad(dayLoad(day, hurt)) : null), [day, hurt]);

  /**
   * The rest day's drill (PLAN.md M164).
   *
   * Only when the plan actually calls this day a rest day — `day.over` sets
   * `isRest` too, and a block that ran out three weeks ago is not a rest day,
   * it is no plan at all. `hurt` is the same reading the load note uses, so a
   * drill and a warning about the same body part cannot appear together.
   *
   * No twin guard for `day.startsOn` (PLAN.md M259). The first draft had
   * one and the battery removed it to no effect: the card's own branch for
   * the gap carries no drill link, so the only thing left reading this is
   * `startRest`, and a drill attached to a rest day the climber *chose* is
   * a suggestion rather than a prescription. One rule, not two.
   */
  const restDrill = useMemo(
    () => (day !== undefined && day.isRest && day.over !== true ? restDayDrill(date, hurt) : null),
    [day, date, hurt],
  );

  /**
   * What the one big button does (PLAN.md M117, merged from Home's card).
   *
   * A training day starts the planned session. A rest day logs the rest —
   * the program's rest type, which is what gives the editor its recovery
   * checklist — whether the plan placed that type on the day or simply left
   * the day empty: the card above the button calls both "Rest day", and a
   * button that then said "Log a session" beside a "Rest / Recovery" chip
   * was the browser's first finding. A program with no rest type, or no
   * program at all, gets the plain session. A block that has run its course
   * prescribes nothing, so whatever gets climbed is a session like any
   * other — and `over` sets `isRest`, which is why it is checked first;
   * before M85 that combination had Home offering to log a rest day from a
   * block that ended three weeks ago.
   */
  const primary =
    day === undefined || day.over || day.startsOn !== undefined
      ? undefined
      : (day.sessionType ?? program?.sessionTypes.find((t) => t.isRest === true));
  const label =
    primary === undefined
      ? 'Log a session'
      : primary.isRest === true
        ? 'Log rest day'
        : 'Start session';
  const others = program?.sessionTypes.filter((t) => t.id !== primary?.id) ?? [];
  /**
   * Only when there is no rest day on offer already (PLAN.md M191).
   *
   * A program with a rest type puts it on the chip row itself, or on the big
   * button when today is one — and a second generic chip beside the
   * program's own *Rest / Recovery* is two ways to do one thing. Caught by
   * `restDayDrill.test.tsx`, which asserts a training day offers nothing of
   * the kind; the first draft checked only the big button.
   *
   * Which also means `startRest` never has a rest type to stamp: it is only
   * reachable when the catalogue has not given it one.
   */
  const offersRest = primary?.isRest !== true && !others.some((t) => t.isRest === true);

  /**
   * A rest day with no program behind it (PLAN.md M191).
   *
   * `primary` is a *program* session type, so with no program — or a
   * program with no rest type — there was no rest day to start, and the
   * logger's editor keyed on `type?.isRest` so there was nowhere to tick a
   * checklist either. Meanwhile the coach's `domain:rest` card told the same
   * climber they had never logged one and sent them to `/today`, which
   * offered *Search* and *Log a session* and never used the word. Measured
   * in a browser before this existed.
   *
   * An empty checklist is what makes it one: `restChecklist` present and no
   * climbs is the app's definition of a rest day, and the editor reads the
   * same field to know which half to render.
   */
  // The stamping itself is `engine/sessionStart.ts` (PLAN.md M324), which the
  // sample climber is now written through as well. What stays here is the one
  // thing only this hook knows: whether the date is today, and so whether a
  // clock is running at all.
  const clock = () => (date === today() ? new Date().toISOString() : undefined);

  async function startRest() {
    await create(date, restStart({ startedAt: clock(), programId: activeProgramId, trackId, restDrill }));
  }

  async function start(sessionTypeId?: string) {
    await create(
      date,
      trainingStart({ startedAt: clock(), programId: activeProgramId, sessionTypeId, trackId, day, restDrill }),
    );
  }

  return { program, day, primary, label, others, loadNote, restDrill, trackId, start, startRest, offersRest };
}

/**
 * What is on today, and the way into it.
 *
 * `onOpen` is what tells the card where it is. Given one — Home — the
 * buttons start the session *and* hand the climber to the logger, in the
 * view the button names: the big one opens the whole log, *Quick log*
 * opens it stripped to climbs and effort (the M120 fold, chosen before
 * arriving rather than after). Without one the card is already inside the
 * logger, so starting a session is all there is to do.
 */
export function PreSessionCard({ date, onOpen }: { date: string; onOpen?: () => void }) {
  const { program, day, primary, label, others, loadNote, restDrill, trackId, start, startRest, offersRest } =
    useStartSession(date);
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);

  async function goRest() {
    if (onOpen) openAt(date, 'full');
    await startRest();
    onOpen?.();
  }

  async function go(view: LogView, sessionTypeId?: string) {
    // Only when the card is the one on Home, and only for this session
    // (PLAN.md M297). The comment this replaces had the right instinct and
    // the wrong line: it said "a start button that silently reset it would
    // undo the setting every session" and then let Home's own buttons do
    // exactly that, to every session opened afterwards.
    if (onOpen) openAt(date, view);
    await start(sessionTypeId);
    onOpen?.();
  }

  return (
    <Card>
      {day?.sessionType && !day.isRest ? (
        <>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-xl leading-none">{day.sessionType.icon}</span>
            <h2 className="font-bold text-lg">{day.sessionType.name}</h2>
          </div>
          <p className="text-sm text-ink-soft mb-1">
            Week {day.week} of {program!.weeks}
            {day.phase ? ` · ${day.phase.name}` : ''}
            {day.isDeload ? ' · Deload week' : ''}
            {day.test !== undefined ? ' · Test week' : ''}
          </p>
          <DayShape day={day} program={program} trackId={trackId} />
        </>
      ) : day?.over ? (
        /* Before the rest-day branch, which an over day would
           otherwise land in — `over` sets `isRest`, so it would read
           as a rest day. And before M85 it read "Week 12 of 12 ·
           Test week" instead, every day, forever. */
        <p className="text-sm text-ink-soft mb-3">
          {program!.name} has run its course. Nothing is planned until you pick what is next.
        </p>
      ) : day?.startsOn !== undefined ? (
        /* The other end of the block, and above the rest-day branch for
           the same reason `over` is: `startsOn` sets `isRest`, so these
           days read as *“Rest day. Recovery is training — log it to bank
           it”* — rest the program never prescribed, on days it does not
           cover (PLAN.md M259). Reachable since starts snap forward: press
           Start on a Thursday and this is Thursday, Friday and Saturday.

           It says what to do rather than only what is happening. Three
           days of nothing after pressing Start is the cost of a whole
           first week, and a climber who wants to train today still can —
           the button beside this reads *Log a session*. */
        <>
          <p className="text-sm text-ink-soft mb-1">
            {program!.name} starts {shortLabel(day.startsOn)}, so its first week is a whole one.
          </p>
          <p className="text-sm text-ink-soft mb-3">
            Nothing is planned until then. Anything you climb before it counts — it is logged
            outside the block.
          </p>
        </>
      ) : day ? (
        <>
          <p className="text-sm text-ink-soft mb-2">
            Rest day{day.week ? ` · week ${day.week}` : ''}
            {day.test !== undefined ? ' · Test week' : ''}. Recovery is training — log it to bank it.
          </p>
          {/* And what to do with it (PLAN.md M164). Twelve drills were
              written for this exact day and the app had never offered one
              of them: `offWallDrills()` had no caller outside its own
              test. */}
          {restDrill && (
            <Link
              href={`/drills/${restDrill.id}`}
              className="flex items-center gap-2 text-sm rounded-xl px-3 py-2.5 border border-line bg-sunken mb-3"
            >
              <div className="min-w-0 flex-1">
                <span className="font-semibold">{restDrill.name}</span>
                <span className="text-ink-soft flex items-center gap-1 text-xs mt-0.5">
                  <Clock size={11} /> {restDrill.duration} · {restDrill.focus} · no wall needed
                </span>
              </div>
              <ChevronRight size={15} className="text-ink-soft shrink-0" />
            </Link>
          )}
        </>
      ) : hydrated && Object.keys(byDate).length === 0 ? (
        /* A new install's first screen (PLAN.md M123): this card,
           these buttons. Only once the store has loaded — before
           that an empty `byDate` is a log that has not arrived,
           not a climber who has never logged. */
        <p className="text-sm text-ink-soft mb-3">
          Your first session. Log whatever you climb — a few boulders is plenty — and everything
          else in the app grows out of it. Nothing is planned until you pick a program, and nothing
          needs to be.
        </p>
      ) : (
        <p className="text-sm text-ink-soft mb-3">
          Nothing planned — no program is running. Log whatever you climb and it still counts toward
          everything.
        </p>
      )}

      {loadNote !== null && (
        <p className="text-warn text-xs mb-3 flex items-start gap-1.5">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <span>{loadNote}. Each one is marked in the session.</span>
        </p>
      )}

      <div className="flex gap-2">
        <Button className="flex-1" onClick={() => void go('full', primary?.id)}>
          {primary === undefined && <Plus size={15} />}
          {label}
        </Button>
        {onOpen && (
          <Button variant="outline" className="flex-1" onClick={() => void go('quick', primary?.id)}>
            <Zap size={15} /> Quick log
          </Button>
        )}
      </div>
      {(others.length > 0 || offersRest) && (
        <div className="mt-3">
          <p className="text-xs text-ink-soft mb-1.5">Or a different session</p>
          <div className="flex flex-wrap gap-2">
            {others.map((t) => (
              <Button key={t.id} size="sm" variant="outline" onClick={() => void go('full', t.id)}>
                {t.icon} {t.name}
              </Button>
            ))}
            {/* Last, and only when the main button is not already one
                (PLAN.md M191). A rest day is not "a different session type"
                when there is no program to have types — it is the other
                thing a day can be, and it belongs on this row because that
                is where the other things a day can be already are. */}
            {offersRest && (
              <Button size="sm" variant="outline" onClick={() => void goRest()}>
                😴 Rest day
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Two nudges about the week rather than the session (PLAN.md M67).
 *
 * They stay whether or not a session has started — a logged rest day in a
 * test week is still the best day to be told the numbers are due — so they
 * sit outside the pre-session card rather than inside it, and Home shows
 * them above the day's card for the same reason it shows the card at all
 * (PLAN.md M124): they are facts about where the block has got to, and a
 * climber should not have to open the log to find out the block ended.
 */
export function DayNudges({ date }: { date: string }) {
  const { program, day } = usePlannedDay(date);
  if (!day?.over && day?.test === undefined) return null;
  return (
    <>
      {day?.over && (
        <Link
          href="/finish"
          className="focus-ring flex items-center gap-2 bg-surface border border-line rounded-2xl p-3"
        >
          <Flag size={16} className="text-accent shrink-0" />
          <span className="flex-1 min-w-0 text-xs leading-relaxed">
            See what the block moved, and what {program!.name} says comes after it.
          </span>
          <ChevronRight size={16} className="text-ink-soft shrink-0" />
        </Link>
      )}
      {day?.test !== undefined && (
        // Top-aligned, because the day's list can run to several lines and
        // an icon centred beside it reads as belonging to the middle one.
        <Link
          href="/assessments"
          className="focus-ring flex items-start gap-2 bg-surface border border-line rounded-2xl p-3"
        >
          <Ruler size={16} className="text-accent shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0 text-xs leading-relaxed">
            <span className="block">{TEST_REASON_LABEL[day.test]}</span>
            {/* Fetched, because only a test week needs it (PLAN.md M325);
                and silent if the fetch fails, since the link still goes to
                the list it summarises. */}
            <ErrorBoundary fallback={() => null}>
              <Suspense fallback={null}>
                <TestsToday date={date} />
              </Suspense>
            </ErrorBoundary>
          </span>
          <ChevronRight size={16} className="text-ink-soft shrink-0 mt-0.5" />
        </Link>
      )}
    </>
  );
}
