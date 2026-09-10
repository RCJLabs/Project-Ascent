import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import {
  BatteryCharging,
  BatteryLow,
  BatteryWarning,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Coins,
  Gamepad2,
  HeartPulse,
  Mountain,
  Sparkles,
  Target,
} from 'lucide-react';
import { deriveAltimeter } from '@/engine/altimeter';
import { OUTFITS, SKIN_TONES, deriveAvatar, type AvatarPalette } from '@/engine/avatar';
import { RANKS } from '@/engine/economy';
import { fromKey, shortLabel, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { deriveStats, type Stat, type StatId } from '@/engine/stats';
import { compareStats } from '@/engine/statHistory';

/** "March 2026" — the month is the useful precision for a six-month-old shape. */
function sixMonthsLabel(asOf: string): string {
  return fromKey(asOf).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
import { StatRadar } from '@/ui/charts/StatRadar';
import { deriveVitality, type Vitality, type VitalityState } from '@/engine/vitality';
import type { XpEvent } from '@/engine/xp';
import { useCurrency, useXp } from '@/store/game';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { describeNext } from '@/engine/nextUnlock';
import { useNextUnlock, useSkills } from '@/store/skills';
import { useSessions } from '@/store/sessions';
import { ShareButton } from '@/features/share/ShareSheet';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { SelectableCard, Swatch } from '@/ui/Chip';
import { Meter } from '@/ui/Meter';
import { DisclosureButton } from '@/ui/Disclosure';
import { Avatar } from '@/ui/Avatar';
import { LevelBar } from '@/ui/LevelBar';
import { rankCard } from '@/ui/shareCard';

const KIND_ICON: Record<XpEvent['kind'], typeof Mountain> = {
  session: Mountain,
  project: Target,
  game: Gamepad2,
  challenge: ClipboardCheck,
};

export function ClimberPage() {
  const xp = useXp();
  const currency = useCurrency();
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const metrics = useMetrics((s) => s.entries);
  const injuries = useProfile((s) => s.injuries);

  const state = useMemo(
    () => deriveClimberState(Object.values(byDate).flat()),
    [byDate],
  );
  const stats = useMemo(
    () => deriveStats({ state, metrics, projects }),
    [state, metrics, projects],
  );
  const statValues = useMemo(
    () => ({
      STR: stats.STR.value,
      END: stats.END.value,
      TEC: stats.TEC.value,
      MEN: stats.MEN.value,
      AGI: stats.AGI.value,
    }),
    [stats],
  );
  const comparison = useMemo(
    () =>
      compareStats({
        sessions: Object.values(byDate).flat(),
        metrics,
        projects,
        today: today(),
      }),
    [byDate, metrics, projects],
  );

  const skills = useSkills();
  const next = useNextUnlock();
  const vitality = useMemo(
    () =>
      deriveVitality({
        state,
        endurance: stats.END,
        injuries,
        restBonus: skills.effects.restRecovery,
      }),
    [state, stats, injuries, skills.effects.restRecovery],
  );
  const palette = useProfile((s) => s.avatarPalette);
  const feet = useMemo(
    () => deriveAltimeter(Object.values(byDate).flat()).feet,
    [byDate],
  );
  const avatar = useMemo(
    () => deriveAvatar({ level: xp.progress.level, vitality: vitality.state, feet, palette }),
    [xp.progress.level, vitality.state, feet, palette],
  );

  const reached = RANKS.filter((r) => r.level <= xp.progress.level);
  const upcoming = RANKS.filter((r) => r.level > xp.progress.level).slice(0, 3);

  return (
    <>
      <BackLink />

      <header className="flex items-center gap-4 mb-4">
        <div className="w-24 shrink-0">
          <Avatar config={avatar} className="w-full h-auto block" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-black tracking-tight">{xp.rank.title}</h1>
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
            filename={`ascent-${xp.rank.title.toLowerCase().replace(/\s+/g, '-')}.png`}
          />
        </div>
      </header>

      <PageGrid>
        <Card>
          <LevelBar progress={xp.progress} rank={xp.rank} next={xp.next} />
        </Card>

        <VitalityCard vitality={vitality} />

        <AppearanceCard palette={palette} />

        <Card title="Skills">
          <Link href="/skills" className="flex items-center gap-3">
            <Sparkles size={18} className="text-accent shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {skills.unlocked} of {skills.total} unlocked
              </p>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                {describeNext(next)}
              </p>
            </div>
            <ChevronRight size={18} className="text-ink-soft shrink-0" />
          </Link>
        </Card>

        <Card title="Stats">
          {/* The shape first, the numbers under it. Five bars are five
              numbers stacked up; the shape is what makes a lopsided climber
              look lopsided (PLAN.md M24). */}
          <StatRadar
            values={statValues}
            {...(comparison.then ? { then: comparison.then } : {})}
            {...(comparison.asOf ? { thenLabel: sixMonthsLabel(comparison.asOf) } : {})}
          />
          {comparison.then === null && (
            <p className="text-xs text-ink-soft mt-2 text-center">
              Six months of logs and this gets a second shape behind it, so you can see what
              moved.
            </p>
          )}
          <ul className="grid grid-cols-1 gap-2.5 mt-4">
            {(Object.keys(stats) as StatId[]).map((id) => (
              <StatRow key={id} stat={stats[id]} />
            ))}
          </ul>
          <p className="text-xs text-ink-soft mt-3">
            Every point comes from something you logged. Tap a stat to see exactly what built it.
          </p>
        </Card>

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
          <ol className="grid grid-cols-1 gap-1.5">
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
            <ul className="grid grid-cols-1 gap-2">
              {xp.events.slice(0, 12).map((event) => (
                <EventRow key={event.key} event={event} />
              ))}
            </ul>
          )}
        </Card>
      </PageGrid>
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
      <Meter value={pct / 100} label={label} valueText={`${value.toLocaleString()} of ${total.toLocaleString()}`} />
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

const VITALITY_LOOK: Record<VitalityState, { color: string; Icon: typeof HeartPulse }> = {
  fresh: { color: 'var(--viz-good)', Icon: HeartPulse },
  worked: { color: 'var(--viz-warning)', Icon: BatteryCharging },
  tired: { color: 'var(--viz-serious)', Icon: BatteryLow },
  cooked: { color: 'var(--viz-critical)', Icon: BatteryWarning },
};

/** Vitality gates nothing — it only makes the cost of grinding visible. */
function VitalityCard({ vitality }: { vitality: Vitality }) {
  const { color, Icon } = VITALITY_LOOK[vitality.state];
  const pct = Math.round(vitality.fraction * 100);
  return (
    <Card title="Vitality">
      <div className="flex items-baseline gap-2 mb-1.5">
        <Icon size={16} style={{ color }} className="shrink-0 translate-y-0.5" />
        <span className="font-bold">{vitality.headline}</span>
        <span className="text-xs text-ink-soft ml-auto tabular-nums">
          {vitality.current} / {vitality.max}
        </span>
      </div>
      <Meter
        value={pct / 100}
        size="lg"
        color={color}
        label={`Vitality: ${vitality.headline}`}
        valueText={`${vitality.current} of ${vitality.max}`}
      />

      {vitality.penalties.length === 0 ? (
        <p className="text-sm text-ink-soft mt-2.5 leading-relaxed">
          Nothing is draining you. Vitality gates nothing in training — it is here so the cost of
          grinding is visible before you feel it.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-1.5 mt-2.5">
          {vitality.penalties.map((p) => (
            <li key={p.label} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span>{p.label}</span>
                <span className="font-semibold tabular-nums shrink-0">−{p.points}</span>
              </div>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{p.note}</p>
            </li>
          ))}
        </ul>
      )}

      {vitality.buff && (
        <p className="text-sm text-positive mt-2.5">
          {vitality.buff.label} — {vitality.buff.note}
        </p>
      )}
    </Card>
  );
}

function StatRow({ stat }: { stat: Stat }) {
  const [open, setOpen] = useState(false);
  const pct = stat.value;
  return (
    <li>
      <DisclosureButton open={open} onToggle={() => setOpen(!open)}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-2xs font-bold uppercase tracking-widest text-ink-soft w-8">
            {stat.id}
          </span>
          <span className="text-sm font-semibold">{stat.name}</span>
          <span className="font-black tabular-nums ml-auto">{stat.value}</span>
          <ChevronDown
            size={14}
            className={`text-ink-soft shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
        <Meter value={pct / 100} label={`${stat.name} progress`} valueText={`${stat.value} of 100`} />
      </DisclosureButton>

      {open && (
        <div className="mt-2 bg-sunken rounded-xl p-3">
          <p className="text-xs text-ink-soft mb-2.5 leading-relaxed">{stat.blurb}</p>
          <dl className="grid grid-cols-1 gap-1 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-soft">Base</dt>
              <dd className="font-semibold tabular-nums">10</dd>
            </div>
            {stat.contributions.map((c) => (
              <div key={c.label} className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-soft truncate">
                  {c.label}
                  {c.detail && <span className="text-ink-soft/70"> · {c.detail}</span>}
                </dt>
                <dd
                  className={`font-semibold tabular-nums shrink-0 ${c.detail === null ? 'text-ink-soft/50' : ''}`}
                >
                  {c.detail === null ? 'not measured' : `+${Math.round(c.points)}`}
                  {c.detail !== null && c.points >= c.cap && (
                    <span className="text-2xs font-bold uppercase tracking-wide text-accent ml-1">max</span>
                  )}
                </dd>
              </div>
            ))}
            {stat.debuff && (
              <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-line">
                <dt className="text-danger">{stat.debuff.label}</dt>
                <dd className="font-semibold tabular-nums text-danger">−{stat.debuff.points}</dd>
              </div>
            )}
          </dl>
          {stat.debuff && <p className="text-xs text-ink-soft mt-2 leading-relaxed">{stat.debuff.note}</p>}
        </div>
      )}
    </li>
  );
}

/**
 * The only stored part of the avatar. Everything else — gear, ground,
 * posture — is derived, so this card is short by design.
 */
function AppearanceCard({ palette }: { palette: AvatarPalette }) {
  const setPalette = useProfile((s) => s.setAvatarPalette);
  const activeOutfit = OUTFITS.find(
    (o) => o.top === palette.top && o.shorts === palette.shorts && o.shoes === palette.shoes,
  );

  return (
    <Card title="Appearance">
      <p className="text-xs text-ink-soft mb-3 leading-relaxed">
        Gear, ground and posture come from your training. These are yours to pick.
      </p>

      <div className="mb-3">
        <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">Skin</div>
        <div className="flex flex-wrap gap-2">
          {SKIN_TONES.map((tone) => (
            <Swatch
              key={tone}
              active={palette.skin === tone}
              onClick={() => setPalette({ skin: tone })}
              label={`Skin tone ${tone}`}
              color={tone}
            />
          ))}
        </div>
      </div>

      <div>
        <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">Kit</div>
        <div className="grid grid-cols-3 gap-2">
          {OUTFITS.map((outfit) => {
            const on = activeOutfit?.name === outfit.name;
            return (
              <SelectableCard
                key={outfit.name}
                selected={on}
                onClick={() =>
                  setPalette({
                    top: outfit.top,
                    shorts: outfit.shorts,
                    shoes: outfit.shoes,
                    gear: outfit.gear,
                  })
                }
                label={`Kit: ${outfit.name}`}
                className="bg-sunken px-2 py-2"
              >
                <div className="flex gap-1 mb-1.5">
                  {[outfit.top, outfit.shorts, outfit.shoes].map((color) => (
                    <span
                      key={color}
                      className="w-4 h-4 rounded border border-line"
                      style={{ background: color }}
                    />
                  ))}
                </div>
                <span className="text-xs font-semibold">{outfit.name}</span>
              </SelectableCard>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
