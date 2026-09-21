import { useMemo } from 'react';
import { Link } from 'wouter';
import {
  ChevronRight,
  ClipboardCheck,
  Coins,
  Gamepad2,
  Mountain,
  Network,
  Sparkles,
  Target,
} from 'lucide-react';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveClimberState } from '@/engine/derive';
import { LEVELS_PER_DEGREE, RANKS, nextRank, rankLabel, type Rank } from '@/engine/economy';
import { shortLabel } from '@/engine/dates';
import { describeShop, shopProgress } from '@/engine/kits';
import { describeNext } from '@/engine/nextUnlock';
import { formatHeight, heightValue } from '@/engine/units';
import type { XpEvent } from '@/engine/xp';
import { BoardCard } from '@/features/challenges/BoardPage';
import { AchievementsCard } from '@/features/climber/AchievementsCard';
import { ShareButton } from '@/features/share/ShareSheet';
import { useCurrency, useOwned, useOwnedWalls, useXp } from '@/store/game';
import { ALL_BOUGHT, unbought } from '@/engine/shop';
import { useProfile } from '@/store/profile';
import { useSessions, allSessions } from '@/store/sessions';
import { useDeloadDates } from '@/store/deload';
import { useSettings } from '@/store/settings';
import { useNextUnlock, useSkills } from '@/store/skills';
import { Avatar } from '@/ui/Avatar';
import { Card } from '@/ui/Card';
import { LevelBar } from '@/ui/LevelBar';
import { Meter } from '@/ui/Meter';
import { MountainMeter } from '@/ui/MountainMeter';
import { PageGrid, Wide } from '@/ui/PageGrid';
import { rankCard } from '@/ui/shareCard';
import { useClimberAvatar } from '@/ui/useClimberAvatar';
import { AppearanceCard } from './AppearanceCard';

/**
 * The game's front page (PLAN.md M117, the character since M118).
 *
 * Everything training earns, in one place: the climber and their level,
 * the altimeter, the board, the arcade, the skill trees, the achievements,
 * the kit, the coins, the ranks and where the XP came from. Four of these
 * cards lived on Home until M117; the rest were the game half of the
 * climber page, beside the vitality and the stats that the coach reads.
 * M118 split that page — the training half is `/body`, under Progress —
 * and this is the other half, which is to say the character sheet.
 *
 * Nothing here gates anything. The coach never reads the game store, and
 * the one number that crosses over — vitality, drawn on the avatar — is
 * read *from* training, never written by the game.
 */
export function GamePage() {
  const xp = useXp();
  const avatar = useClimberAvatar();
  const palette = useProfile((s) => s.avatarPalette);

  return (
    <>
      <header className="flex items-center gap-4 mb-4">
        <div className="w-24 shrink-0">
          <Avatar config={avatar} className="w-full h-auto block" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">{rankLabel(xp.rank)}</h1>
          <p className="text-sm text-ink-soft mt-0.5">
            Level {xp.progress.level} · {xp.total.toLocaleString()} XP earned
          </p>
          <p className="text-xs text-ink-soft mt-1">
            {avatar.stage.unlock}
            {avatar.next && ` · ${avatar.next.unlock.toLowerCase()} at ${avatar.next.level}`}
          </p>
          <ShareButton
            className="mt-2"
            content={rankCard(xp, avatar)}
            filename={`ascent-${rankLabel(xp.rank).toLowerCase().replace(/\s+/g, '-')}.png`}
          />
        </div>
      </header>

      <PageGrid>
        <Wide>
          <Card>
            <LevelBar progress={xp.progress} rank={xp.rank} next={xp.next} />
          </Card>
        </Wide>

        <AltimeterCard />
        <Link href="/board" className="block bg-surface border border-line rounded-2xl p-4">
          <BoardCard />
        </Link>
        <AscentCard />
        <SkillsCard />
        <AchievementsCard />
        <AppearanceCard palette={palette} />
        <CurrencyCard />
        <SplitCard xp={xp} />
        <RanksCard level={xp.progress.level} current={xp.rank.title} />
        <RecentXpCard events={xp.events} />
      </PageGrid>
    </>
  );
}

/** The mountain filling toward the next milestone — the plan's silhouette,
 *  and the only meter here that no game action can move. */
function AltimeterCard() {
  const units = useSettings((st) => st.units);
  const byDate = useSessions((s) => s.byDate);
  const alt = useMemo(() => deriveAltimeter(allSessions(byDate)), [byDate]);

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
  const deloadDates = useDeloadDates();
  const rested = useMemo(
    () => deriveClimberState(allSessions(byDate), { deloadDates }).restedWithin24h,
    [byDate, deloadDates],
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

/**
 * The count, and the one node closest to unlocking (PLAN.md M29).
 *
 * One line, not a list: five things you are nearly at is a chore, and the
 * pull comes from there being one.
 */
function SkillsCard() {
  const skills = useSkills();
  const next = useNextUnlock();
  return (
    <Card title="Skills">
      <Link href="/skills" className="flex items-center gap-3">
        <Network size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">
            {skills.unlocked} of {skills.total} unlocked
          </p>
          <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{describeNext(next)}</p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}

function CurrencyCard() {
  const currency = useCurrency();
  const owned = useOwned();
  // What the coins are *for*, which this card never said until M213 — at any
  // balance, not only at the end of the shop.
  //
  // Two sentences since M233, because there are two shops on this balance.
  // `describeShop` speaks for the kits and stops there; whether the app has
  // anything left to sell is a question only `unbought` can answer, and it is
  // the one that decides whether the big number is still a balance.
  const left = unbought(owned, useOwnedWalls());
  const shop = left === 0 ? ALL_BOUGHT : describeShop(shopProgress(owned, currency.balance));
  return (
    <Card title="Currency">
      <div className="flex items-center gap-3">
        <Coins size={18} className="text-accent shrink-0" />
        <div className="flex-1">
          {/* The number stops being a balance when a balance stops meaning
              anything: a spendable figure is an invitation to spend, and past
              the end of the shop there is nothing to accept it with. What is
              left is worth keeping, so it becomes what it actually is — the
              total the training paid (PLAN.md M233). */}
          <div className="text-2xl font-black tabular-nums leading-none">
            {(left === 0 ? currency.earned : currency.balance).toLocaleString()}
            {left === 0 && <span className="text-sm text-ink-soft font-bold ml-1.5">earned</span>}
          </div>
          <p className="text-xs text-ink mt-1">{shop}</p>
          <p className="text-xs text-ink-soft mt-1">
            {left === 0
              ? `${currency.spent.toLocaleString()} spent.`
              : `${currency.earned.toLocaleString()} earned · ${currency.spent.toLocaleString()} spent.`}{' '}
            Cosmetics only — nothing you can buy makes you climb harder.
          </p>
        </div>
      </div>
    </Card>
  );
}

function SplitCard({ xp }: { xp: ReturnType<typeof useXp> }) {
  return (
    <Card title="Where it came from">
      <div className="grid grid-cols-1 gap-2">
        <Split label="Climbing" value={xp.real} total={xp.total} />
        <Split label="The game lane" value={xp.game} total={xp.total} />
      </div>
      <p className="text-xs text-ink-soft mt-3">
        No game action can pay more than half of what showing up and training does. Grinding it
        will never beat climbing, and that is a rule rather than a tuning choice.
      </p>
    </Card>
  );
}

function Split({ label, value, total }: { label: string; value: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm mb-1">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {value.toLocaleString()} <span className="text-ink-soft font-normal">({pct}%)</span>
        </span>
      </div>
      <Meter value={pct / 100} label={label} valueText={`${value.toLocaleString()} of ${total.toLocaleString()}`} />
    </div>
  );
}

/**
 * The last three rungs and the next three (PLAN.md M176).
 *
 * The next three are walked with `nextRank` rather than filtered out of
 * `RANKS`, because past the authored ladder the filter returns nothing and
 * the card became a list of what was already behind you. `nextRank` answers
 * in both regimes, so this code stopped having two.
 */
function RanksCard({ level, current }: { level: number; current: string }) {
  const reached = RANKS.filter((r) => r.level <= level);
  const upcoming: Rank[] = [];
  for (let at = level, i = 0; i < 3; i += 1) {
    const rung = nextRank(at);
    upcoming.push(rung);
    at = rung.level;
  }
  return (
    <Card title="Ranks">
      <ol className="grid grid-cols-1 gap-1.5">
        {reached.slice(-3).map((rank) => (
          <li key={rank.title} className="flex items-baseline gap-2 text-sm">
            <span className="w-8 text-xs text-ink-soft tabular-nums">{rank.level}</span>
            <span className={rank.title === current ? 'font-bold' : 'text-ink-soft'}>{rank.title}</span>
            {rank.title === current && <Sparkles size={13} className="text-accent shrink-0" />}
          </li>
        ))}
        {upcoming.map((rank) => (
          <li key={`${rank.title}-${rank.degree}`} className="flex items-baseline gap-2 text-sm opacity-50">
            <span className="w-8 text-xs tabular-nums">{rank.level}</span>
            <span>{rankLabel(rank)}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-soft mt-3">
        {level < RANKS.at(-1)!.level
          ? `${RANKS.length} ranks to ${RANKS.at(-1)!.title} at level ${RANKS.at(-1)!.level}.`
          : `All ${RANKS.length} ranks behind you. ${RANKS.at(-1)!.title} takes a degree every ${LEVELS_PER_DEGREE} levels from here, and keeps taking them.`}
      </p>
    </Card>
  );
}

const KIND_ICON: Record<XpEvent['kind'], typeof Mountain> = {
  session: Mountain,
  project: Target,
  game: Gamepad2,
  challenge: ClipboardCheck,
};

function RecentXpCard({ events }: { events: XpEvent[] }) {
  return (
    <Card title="Recent XP">
      {events.length === 0 ? (
        <p className="text-sm text-ink-soft">Nothing earned yet. Log a session and it starts here.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {events.slice(0, 12).map((event) => (
            <EventRow key={event.key} event={event} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function EventRow({ event }: { event: XpEvent }) {
  const Icon = KIND_ICON[event.kind];
  return (
    <li className="flex items-center gap-2.5 bg-sunken rounded-xl px-3 py-2">
      <Icon size={14} className="text-ink-soft shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold truncate">{event.label}</div>
        <div className="text-xs text-ink-soft">
          {shortLabel(event.date)}
          {event.levelUp !== undefined && (
            <span className="text-accent font-semibold"> · reached level {event.levelUp}</span>
          )}
        </div>
      </div>
      <span className="text-sm font-bold tabular-nums shrink-0">+{event.xp.toLocaleString()}</span>
    </li>
  );
}
