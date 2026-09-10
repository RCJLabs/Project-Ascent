import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { CalendarDays, Check, Clock, Gamepad2, MessageSquare, Settings, Sparkles } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { deriveAltimeter } from '@/engine/altimeter';

import { deriveClimberState } from '@/engine/derive';

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
import { useTips } from '@/features/coach/CoachPage';

export function HomePage() {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const weekOverrides = useProfile((s) => s.weekOverrides);
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
            ) : day ? (
              <p className="text-sm text-ink-soft mb-3">
                Rest day{day.week ? ` · week ${day.week}` : ''}. Recovery is training.
              </p>
            ) : (
              <p className="text-sm text-ink-soft mb-3">
                Nothing planned — no program is running. Log whatever you climb and it still counts
                toward everything.
              </p>
            )}
            <Link
              href={`/log/${date}`}
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3"
            >
              {done ? 'View session' : !day ? 'Log a session' : day.isRest ? 'Log rest day' : 'Start session'}
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
  const byDate = useSessions((s) => s.byDate);
  const alt = useMemo(() => deriveAltimeter(Object.values(byDate).flat()), [byDate]);

  return (
    <Link href="/altimeter" className="block bg-surface border border-line rounded-2xl p-4">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-black text-lg tabular-nums leading-none">
          {alt.feet.toLocaleString()}
        </span>
        <span className="text-xs font-bold uppercase tracking-widest text-ink-soft">ft climbed</span>
        {alt.next && (
          <span className="text-xs text-ink-soft ml-auto truncate">
            {alt.next.name} · {alt.toNext.toLocaleString()} ft
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
