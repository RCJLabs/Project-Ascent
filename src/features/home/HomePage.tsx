import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Flag,
  Gamepad2,
  MessageSquare,
  Ruler,
  Settings,
  Sparkles,
} from 'lucide-react';
import { getProgram } from '@/content/programs';
import { deriveAltimeter } from '@/engine/altimeter';
import { TEST_REASON_LABEL } from '@/engine/assessments';

import { dayLoad, describeDayLoad } from '@/engine/bodyLoad';
import { deriveClimberState } from '@/engine/derive';
import { concerning, injuryPolicy } from '@/engine/injury';

import { BoardCard } from '@/features/challenges/BoardPage';
import { ReviewCard } from '@/features/review/ReviewPage';
import { today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { useXp } from '@/store/game';
import { useNextUnlock } from '@/store/skills';
import { useProfile } from '@/store/profile';

import { useSessions } from '@/store/sessions';
import { PageGrid, Wide } from '@/ui/PageGrid';
import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { LevelBar } from '@/ui/LevelBar';
import { MountainMeter } from '@/ui/MountainMeter';
import { PageHeader } from '@/ui/PageHeader';
import { useClimberAvatar } from '@/ui/useClimberAvatar';
import { useTips } from '@/features/coach/useTips';
import { formatHeight, heightValue } from '@/engine/units';
import { useSettings } from '@/store/settings';

export function HomePage() {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
  const injuries = useProfile((s) => s.injuries);
  const byDate = useSessions((s) => s.byDate);
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const date = today();
  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;
  const overrides = activeProgramId ? weekOverrides[activeProgramId] : undefined;
  const day = program && startDate && plan ? plannedDay(program, startDate, plan, date, overrides) : undefined;
  const logged = byDate[date] ?? [];
  const done = logged.some((s) => s.completed);

  // Counted here rather than in the logger, because this is the screen you
  // read before you leave the house (PLAN.md M89). The per-exercise flags
  // in the session are still there; they arrive too late to change a
  // decision about the day.
  const hurt = useMemo(() => concerning(injuryPolicy(injuries)), [injuries]);
  const loadNote = useMemo(() => (day ? describeDayLoad(dayLoad(day, hurt)) : null), [day, hurt]);

  return (
    <>
      <PageHeader
        title="Project Ascent"
        subtitle="Train. Understand. Grow."
        action={
          <Link href="/settings" className="text-ink-soft p-2.5 -m-1.5" aria-label="Settings">
            <Settings size={20} />
          </Link>
        }
      />

      <PageGrid>
        <Wide>
          <ClimberStrip />
        </Wide>

        {/* First card under the climber, and always — program or not
            (PLAN.md M45). This card holds the only
            prominent route to the logger, and gating it on an active program
            meant a fresh install and a climber between blocks both arrived at
            the front door with no way to record the session they had just
            climbed — reachable, in the end, only from Coach's Corner or from
            search. What is planned is the part that needs a program. */}
        <Card title="Today">
            {done ? (
              <p className="text-sm text-positive flex items-center gap-2 mb-3">
                <Check size={16} /> Session logged. Well done.
              </p>
            ) : day?.sessionType && !day.isRest ? (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xl leading-none">{day.sessionType.icon}</span>
                  <span className="font-bold text-lg">{day.sessionType.name}</span>
                </div>
                <p className="text-sm text-ink-soft mb-3">
                  Week {day.week} of {program!.weeks}
                  {day.phase ? ` · ${day.phase.name}` : ''}
                  {day.isDeload ? ' · Deload week' : ''}
                  {day.test !== undefined ? ' · Test week' : ''}
                </p>
                {day.drill && (
                  <div className="bg-sunken rounded-xl p-3 mb-3">
                    <div className="font-semibold text-sm">{day.drill.name}</div>
                    <p className="text-xs text-ink-soft mt-1 flex items-center gap-1.5">
                      <Clock size={11} /> {day.drill.duration} · {day.drill.focus}
                    </p>
                  </div>
                )}
              </>
            ) : day?.over ? (
              /* Before the rest-day branch, which an over day would
                 otherwise land in — `over` sets `isRest`, so it would read
                 as "Rest day. Recovery is training." And before M85 it read
                 "Week 12 of 12 · Test week" instead, every day, forever. */
              <p className="text-sm text-ink-soft mb-3">
                {program!.name} has run its course. Nothing is planned until you pick what is next.
              </p>
            ) : day ? (
              <p className="text-sm text-ink-soft mb-3">
                Rest day{day.week ? ` · week ${day.week}` : ''}
                {day.test !== undefined ? ' · Test week' : ''}. Recovery is training.
              </p>
            ) : (
              <p className="text-sm text-ink-soft mb-3">
                Nothing planned — no program is running. Log whatever you climb and it still counts
                toward everything.
              </p>
            )}

            {/* Only while the day is still a decision: once the session
                is logged the warning is a verdict on something already
                climbed. A finished block needs no guard — it prescribes
                nothing, so there is nothing to count. */}
            {loadNote && !done && (
              <p className="text-warn text-xs mb-3 flex items-start gap-1.5">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>{loadNote}. Each one is marked in the session.</span>
              </p>
            )}

            {day?.over && (
              <Link
                href="/finish"
                className="focus-ring flex items-center gap-2 bg-sunken rounded-xl p-3 mb-3"
              >
                <Flag size={16} className="text-accent shrink-0" />
                <span className="flex-1 min-w-0 text-xs leading-relaxed">
                  See what the block moved, and what {program!.name} says comes after it.
                </span>
                <ChevronRight size={16} className="text-ink-soft shrink-0" />
              </Link>
            )}
            {/* Outside the training-day branch on purpose (PLAN.md M67): a
                test wants you fresh, so the rest day in a test week is the
                best day to be told, not the one day the app stays quiet. */}
            {day?.test !== undefined && (
              <Link
                href="/assessments"
                className="focus-ring flex items-center gap-2 bg-sunken rounded-xl p-3 mb-3"
              >
                <Ruler size={16} className="text-accent shrink-0" />
                <span className="flex-1 min-w-0 text-xs leading-relaxed">
                  {TEST_REASON_LABEL[day.test]}
                </span>
                <ChevronRight size={16} className="text-ink-soft shrink-0" />
              </Link>
            )}
            <Link
              href={`/log/${date}`}
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3"
            >
              {done
                ? 'View session'
                : !day || day.over
                  ? // An over day carries `isRest`, so without this the
                    // button offered to log a rest day from a block that
                    // ended three weeks ago. Nothing is planned; whatever
                    // gets climbed is a session like any other.
                    'Log a session'
                  : day.isRest
                    ? 'Log rest day'
                    : 'Start session'}
            </Link>
          </Card>

        <CoachCard />
        <AltimeterCard />
        <Link href="/board" className="block bg-surface border border-line rounded-2xl p-4">
          <BoardCard />
        </Link>
        <Link href="/review" className="block bg-surface border border-line rounded-2xl p-4">
          <ReviewCard />
        </Link>
        <AscentCard />

        {!program && (
          <Card>
            <p className="text-sm leading-relaxed mb-3">
              Nothing active yet. Answer seven questions and get a program picked for your grade,
              goals, schedule, and what you can train on.
            </p>
            <Link
              href="/find"
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3"
            >
              <Sparkles size={16} /> Find my program
            </Link>
          </Card>
        )}

        {program && (
          <Card title="Your program">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-bold">{program.name}</div>
                <p className="text-sm text-ink-soft">{program.subtitle}</p>
              </div>
              <Link href="/calendar" className="text-accent shrink-0" aria-label="Open calendar">
                <CalendarDays size={20} />
              </Link>
            </div>
          </Card>
        )}
      </PageGrid>
    </>
  );
}

/**
 * The loudest standing observation, or nothing. Home is not the board — it
 * carries one card so the board is worth opening, and stays silent when
 * there is genuinely nothing to say.
 */
function CoachCard() {
  const { visible } = useTips();
  const top = visible[0];
  if (!top) return null;
  const rest = visible.length - 1;
  const tone =
    top.tone === 'caution' ? 'text-warn' : top.tone === 'good' ? 'text-positive' : 'text-accent';
  return (
    <Link href="/coach" className="block bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={15} className={tone} />
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          Coach's Corner
        </span>
        {rest > 0 && <span className="text-xs text-ink-soft ml-auto">+{rest} more</span>}
      </div>
      <div className="font-bold leading-snug mb-1">{top.headline}</div>
      <p className="text-sm text-ink-soft leading-relaxed line-clamp-2">{top.body}</p>
    </Link>
  );
}

/**
 * You, your level, and the one thing closest to unlocking (PLAN.md M29).
 *
 * The 130 skill nodes lived behind two taps and nothing outside them said
 * how close any of them was — the character page named the closest node but
 * quoted its *requirement*, so a climber one send away read the same line as
 * one who had never started. One line, not a list: five things you are
 * nearly at is a chore, and the pull comes from there being one.
 */
function ClimberStrip() {
  const xp = useXp();
  const avatar = useClimberAvatar();
  const next = useNextUnlock();

  return (
    <Link href="/climber" className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-4">
      <div className="w-12 shrink-0">
        <Avatar config={avatar} className="w-full h-auto block" showGround={false} />
      </div>
      <div className="flex-1 min-w-0">
        <LevelBar progress={xp.progress} rank={xp.rank} compact />
        {next && (
          <p className="text-xs text-ink-soft mt-1.5 leading-relaxed">
            <span className="font-semibold text-ink">{cap(next.remaining)}</span> and{' '}
            {next.node.name} unlocks.
          </p>
        )}
      </div>
    </Link>
  );
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The mountain filling toward the next milestone — the plan's home-screen
 *  silhouette, and the only meter here that no game action can move. */
function AltimeterCard() {
  const units = useSettings((st) => st.units);
  const byDate = useSessions((s) => s.byDate);
  const alt = useMemo(() => deriveAltimeter(Object.values(byDate).flat()), [byDate]);

  return (
    <Link href="/altimeter" className="block bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-black text-lg tabular-nums leading-none">
          {heightValue(alt.feet, units).toLocaleString()}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">
          {units === 'metric' ? 'm' : 'ft'} climbed
        </span>
        {alt.next && (
          <span className="text-xs text-ink-soft ml-auto truncate">
            {alt.next.name} · {formatHeight(alt.toNext, units)}
          </span>
        )}
      </div>
      <MountainMeter
        height={72}
        fraction={alt.fraction}
        caption={alt.next ? `On the way to ${alt.next.name}` : 'The whole ladder is behind you'}
      />
      {alt.etaLabel && alt.next && (
        <p className="text-xs text-ink-soft mt-2">
          At this pace, {alt.next.name} in {alt.etaLabel.replace(/^about /, '')}.
        </p>
      )}
    </Link>
  );
}

/** The rest-day activity, framed as one. */
function AscentCard() {
  const byDate = useSessions((s) => s.byDate);
  const rested = useMemo(
    () => deriveClimberState(Object.values(byDate).flat()).restedWithin24h,
    [byDate],
  );

  return (
    <Link href="/ascent" className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-4">
      <Gamepad2 size={18} className="text-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold">The Ascent</p>
        <p className="text-xs text-ink-soft mt-0.5">
          {rested
            ? 'Recovery skies today — best run pays ×1.5.'
            : 'Endless wall. Play any time; the good paydays are on rest days.'}
        </p>
      </div>
    </Link>
  );
}
