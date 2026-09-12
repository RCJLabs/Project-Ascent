import { useMemo, useState } from 'react';
import { BatteryCharging, BatteryLow, BatteryWarning, ChevronDown, HeartPulse } from 'lucide-react';
import { fromKey, today } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { compareStats } from '@/engine/statHistory';
import { deriveStats, type Stat, type StatId } from '@/engine/stats';
import { deriveVitality, type Vitality, type VitalityState } from '@/engine/vitality';
import { InjuriesCard } from '@/features/injury/InjuriesCard';
import { useMetrics } from '@/store/metrics';
import { useProfile } from '@/store/profile';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSkills } from '@/store/skills';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { StatRadar } from '@/ui/charts/StatRadar';
import { DisclosureButton } from '@/ui/Disclosure';
import { Meter } from '@/ui/Meter';
import { PageGrid } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';

/**
 * The training half of what used to be the climber page (PLAN.md M118).
 *
 * That page held two things that only looked like one: the *game's*
 * character — level, rank, kit, coins, XP — and the *coach's* reading of
 * the climber — vitality, what hurts, and the five stats the log builds.
 * The coupling check before M117 settled which was which: the coach and
 * the injury engine read vitality; nothing in `engine/` reads the game
 * store. So the game half is the Game tab's front page now, and this is
 * the rest, under Progress, where a reading of the body belongs.
 *
 * "Your body" rather than "Your climber": the character went with the
 * game, and what is left is fresh or cooked, what hurts, and what the
 * training has built.
 */
export function BodyPage() {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const metrics = useMetrics((s) => s.entries);
  const injuries = useProfile((s) => s.injuries);
  const skills = useSkills();

  const state = useMemo(() => deriveClimberState(Object.values(byDate).flat()), [byDate]);
  const stats = useMemo(() => deriveStats({ state, metrics, projects }), [state, metrics, projects]);
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

  return (
    <>
      <BackLink />
      <PageHeader title="Your body" subtitle="Fresh or cooked, what hurts, and what the log has built" />

      <PageGrid>
        <VitalityCard vitality={vitality} />
        {/* What hurts, next to what it costs (PLAN.md M76). */}
        <InjuriesCard />

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
      </PageGrid>
    </>
  );
}

/** "March 2026" — the month is the useful precision for a six-month-old shape. */
function sixMonthsLabel(asOf: string): string {
  return fromKey(asOf).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
