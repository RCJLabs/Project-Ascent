import { useMemo } from 'react';
import { Link } from 'wouter';
import { ChevronRight, Gamepad2, Medal, Network } from 'lucide-react';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveClimberState } from '@/engine/derive';
import { formatHeight, heightValue } from '@/engine/units';
import { BoardCard } from '@/features/challenges/BoardPage';
import { useXp } from '@/store/game';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { useNextUnlock } from '@/store/skills';
import { Avatar } from '@/ui/Avatar';
import { LevelBar } from '@/ui/LevelBar';
import { MountainMeter } from '@/ui/MountainMeter';
import { PageGrid, Wide } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';
import { useClimberAvatar } from '@/ui/useClimberAvatar';

/**
 * The game's front door (PLAN.md M117).
 *
 * Everything training earns, in one place: the level and the next unlock,
 * the altimeter, the board, the arcade, and the way through to the skill
 * trees and the achievements. Four of these cards lived on Home, where they
 * sat between a climber and the session they opened the app to log; the
 * fifth tab is where they were always going to end up once Home became the
 * session.
 *
 * This is the hub in its first shape. The climber page still carries the
 * game's half of the character — kit, currency, ranks — beside the training
 * half that the coach and the injury engine read; M118 splits that page and
 * the game half lands here.
 */
export function GamePage() {
  return (
    <>
      <PageHeader title="Game" subtitle="What the training has earned" />
      <PageGrid>
        <Wide>
          <ClimberStrip />
        </Wide>
        <AltimeterCard />
        <Link href="/board" className="block bg-surface border border-line rounded-2xl p-4">
          <BoardCard />
        </Link>
        <AscentCard />
        <Link href="/skills" className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-4">
          <Network size={18} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Skill trees</p>
            <p className="text-xs text-ink-soft mt-0.5">Every node unlocks from real training.</p>
          </div>
          <ChevronRight size={16} className="text-ink-soft shrink-0" />
        </Link>
        <Link href="/achievements" className="flex items-center gap-3 bg-surface border border-line rounded-2xl p-4">
          <Medal size={18} className="text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Achievements</p>
            <p className="text-xs text-ink-soft mt-0.5">Earned, and the ones still out there.</p>
          </div>
          <ChevronRight size={16} className="text-ink-soft shrink-0" />
        </Link>
      </PageGrid>
    </>
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

/** The mountain filling toward the next milestone — the plan's silhouette,
 *  and the only meter here that no game action can move. */
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
