import { useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { CalendarDays, Check, Clock, Gamepad2, Settings, Sparkles } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveAvatar } from '@/engine/avatar';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats } from '@/engine/stats';
import { deriveVitality } from '@/engine/vitality';
import { BoardCard } from '@/features/challenges/BoardPage';
import { ReviewCard } from '@/features/review/ReviewPage';
import { today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { useXp } from '@/store/game';
import { useProfile } from '@/store/profile';
import { useSkillEffects } from '@/store/skills';
import { useSessions } from '@/store/sessions';
import { Card } from '@/ui/Card';
import { Avatar } from '@/ui/Avatar';
import { LevelBar } from '@/ui/LevelBar';
import { MountainMeter } from '@/ui/MountainMeter';
import { PageHeader } from '@/ui/PageHeader';

export function HomePage() {
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
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
  const day = program && startDate && plan ? plannedDay(program, startDate, plan, date) : undefined;
  const logged = byDate[date] ?? [];
  const done = logged.some((s) => s.completed);

  return (
    <>
      <PageHeader
        title="Project Ascent"
        subtitle="Train. Understand. Grow."
        action={
          <Link href="/settings" className="text-ink-soft p-1 -m-1" aria-label="Settings">
            <Settings size={20} />
          </Link>
        }
      />

      <div className="grid gap-3">
        <ClimberStrip />
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

        {program && day && (
          <Card title="Today">
            {done ? (
              <p className="text-sm text-positive flex items-center gap-2 mb-3">
                <Check size={16} /> Session logged. Well done.
              </p>
            ) : day.sessionType && !day.isRest ? (
              <>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-xl leading-none">{day.sessionType.icon}</span>
                  <span className="font-bold text-lg">{day.sessionType.name}</span>
                </div>
                <p className="text-sm text-ink-soft mb-3">
                  Week {day.week} of {program.weeks}
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
            ) : (
              <p className="text-sm text-ink-soft mb-3">
                Rest day{day.week ? ` · week ${day.week}` : ''}. Recovery is training.
              </p>
            )}
            <Link
              href={`/log/${date}`}
              className="inline-flex items-center justify-center gap-2 w-full bg-accent text-accent-ink font-semibold rounded-xl py-3"
            >
              {done ? 'View session' : day.isRest ? 'Log rest day' : 'Start session'}
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
      </div>
    </>
  );
}

function ClimberStrip() {
  const xp = useXp();
  const byDate = useSessions((s) => s.byDate);
  const injuries = useProfile((s) => s.injuries);
  const palette = useProfile((s) => s.avatarPalette);
  const restBonus = useSkillEffects().restRecovery;

  const avatar = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    const vitality = deriveVitality({
      state,
      endurance: deriveStats({ state }).END,
      injuries,
      restBonus,
    });
    return deriveAvatar({
      level: xp.progress.level,
      vitality: vitality.state,
      feet: deriveAltimeter(sessions).feet,
      palette,
    });
  }, [byDate, injuries, palette, restBonus, xp.progress.level]);

  return (
    <Link href="/climber" className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-4">
      <div className="w-12 shrink-0">
        <Avatar config={avatar} className="w-full h-auto block" showGround={false} />
      </div>
      <div className="flex-1 min-w-0">
        <LevelBar progress={xp.progress} rank={xp.rank} compact />
      </div>
    </Link>
  );
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
