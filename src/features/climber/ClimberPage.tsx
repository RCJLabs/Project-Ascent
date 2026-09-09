import { Link } from 'wouter';
import { ArrowLeft, Coins, Gamepad2, Mountain, Sparkles, Target } from 'lucide-react';
import { RANKS } from '@/engine/economy';
import { shortLabel } from '@/engine/dates';
import type { XpEvent } from '@/engine/xp';
import { useCurrency, useXp } from '@/store/game';
import { Card } from '@/ui/Card';
import { LevelBar } from '@/ui/LevelBar';

const KIND_ICON = {
  session: Mountain,
  project: Target,
  game: Gamepad2,
} as const;

export function ClimberPage() {
  const xp = useXp();
  const currency = useCurrency();
  const reached = RANKS.filter((r) => r.level <= xp.progress.level);
  const upcoming = RANKS.filter((r) => r.level > xp.progress.level).slice(0, 3);

  return (
    <>
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-ink-soft mb-3">
        <ArrowLeft size={15} /> Home
      </Link>

      <header className="mb-4">
        <h1 className="text-2xl font-black tracking-tight">{xp.rank.title}</h1>
        <p className="text-sm text-ink-soft mt-0.5">
          Level {xp.progress.level} · {xp.total.toLocaleString()} XP earned
        </p>
      </header>

      <div className="grid gap-3">
        <Card>
          <LevelBar progress={xp.progress} rank={xp.rank} next={xp.next} />
        </Card>

        <Card title="Where it came from">
          <div className="grid gap-2">
            <Split label="Climbing" value={xp.real} total={xp.total} />
            <Split label="The game lane" value={xp.game} total={xp.total} />
          </div>
          <p className="text-xs text-ink-soft mt-3">
            No game action can pay more than half of what showing up and training does. Grinding it
            will never beat climbing, and that is a rule rather than a tuning choice.
          </p>
        </Card>

        <Card title="Currency">
          <div className="flex items-center gap-3">
            <Coins size={18} className="text-accent shrink-0" />
            <div className="flex-1">
              <div className="text-2xl font-black tabular-nums leading-none">
                {currency.balance.toLocaleString()}
              </div>
              <p className="text-xs text-ink-soft mt-1">
                {currency.earned.toLocaleString()} earned · {currency.spent.toLocaleString()} spent.
                Cosmetics only — nothing you can buy makes you climb harder.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Ranks">
          <ol className="grid gap-1.5">
            {reached.slice(-3).map((rank) => (
              <li key={rank.title} className="flex items-baseline gap-2 text-sm">
                <span className="w-8 text-xs text-ink-soft tabular-nums">{rank.level}</span>
                <span className={rank.title === xp.rank.title ? 'font-bold' : 'text-ink-soft'}>
                  {rank.title}
                </span>
                {rank.title === xp.rank.title && (
                  <Sparkles size={13} className="text-accent shrink-0" />
                )}
              </li>
            ))}
            {upcoming.map((rank) => (
              <li key={rank.title} className="flex items-baseline gap-2 text-sm opacity-50">
                <span className="w-8 text-xs tabular-nums">{rank.level}</span>
                <span>{rank.title}</span>
              </li>
            ))}
          </ol>
          <p className="text-xs text-ink-soft mt-3">
            {RANKS.length} ranks to GOAT at level {RANKS.at(-1)!.level}.
          </p>
        </Card>

        <Card title="Recent XP">
          {xp.events.length === 0 ? (
            <p className="text-sm text-ink-soft">
              Nothing earned yet. Log a session and it starts here.
            </p>
          ) : (
            <ul className="grid gap-2">
              {xp.events.slice(0, 12).map((event) => (
                <EventRow key={event.key} event={event} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
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
      <div className="h-1.5 rounded-full bg-sunken overflow-hidden">
        <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
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
