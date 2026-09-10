import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { ArrowRight, Mountain } from 'lucide-react';
import {
  ACHIEVEMENT_COUNT,
  deriveAchievements,
  earnedCount,
  sortAchievements,
  type Achievement,
} from '@/engine/achievements';
import { CATEGORY_LABEL, byYear, deriveCareer, type CareerCategory } from '@/engine/career';
import { getProgram } from '@/content/programs';
import { fromKey } from '@/engine/dates';
import { deriveClimberState } from '@/engine/derive';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { PageGrid } from '@/ui/PageGrid';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { Chip } from '@/ui/Chip';
import { Meter } from '@/ui/Meter';
import { PageHeader } from '@/ui/PageHeader';
import { ShareButton } from '@/features/share/ShareSheet';
import { achievementCard } from '@/ui/shareCard';

const DOT: Record<CareerCategory, string> = {
  grade: 'bg-accent',
  height: 'bg-positive',
  years: 'bg-warn',
  outdoor: 'bg-positive',
  sends: 'bg-ink-soft',
  sessions: 'bg-ink-soft',
  hours: 'bg-ink-soft',
};

/**
 * The career timeline: every milestone the log has crossed, with the date it
 * happened on.
 *
 * Deliberately a list rather than a bar. A bar gets less interesting as it
 * fills; a list of dated days gets longer.
 */
export function CareerPage() {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const display = useSettings((s) => s.display);
  const [filter, setFilter] = useState<CareerCategory | 'all'>('all');

  const achievements = useMemo(
    () =>
      sortAchievements(
        deriveAchievements({
          sessions: Object.values(byDate).flat(),
          projects,
          programWeeks: (id) => getProgram(id)?.weeks,
        }),
      ),
    [byDate, projects],
  );

  const career = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    const state = deriveClimberState(sessions);
    return deriveCareer({ sessions, records: state.personalRecords, display });
  }, [byDate, display]);

  const years = useMemo(() => {
    const filtered =
      filter === 'all'
        ? career
        : { ...career, achieved: career.achieved.filter((m) => m.category === filter) };
    return byYear(filtered);
  }, [career, filter]);

  const present = useMemo(
    () => new Set(career.achieved.map((m) => m.category)),
    [career],
  );

  return (
    <>
      <BackLink />
      <PageHeader
        title="Career"
        subtitle={
          career.first === null
            ? 'Every milestone, with the day it happened.'
            : `${career.achieved.length} milestones since ${fromKey(career.first).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}`
        }
      />

      <PageGrid>
        {career.next.length > 0 && (
          <Card title="Coming up">
            <ul className="grid grid-cols-1 gap-2.5">
              {career.next.slice(0, 4).map((next) => (
                <li key={`${next.category}-${next.target}`}>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-sm font-semibold flex-1 min-w-0 truncate">{next.label}</span>
                    <span className="text-xs text-ink-soft tabular-nums shrink-0">
                      {next.category === 'years'
                        ? `${next.toGo} ${next.toGo === 1 ? 'day' : 'days'}`
                        : `${next.toGo.toLocaleString()} to go`}
                    </span>
                  </div>
                  <Meter
                    value={next.fraction}
                    size="sm"
                    label={next.label}
                    valueText={
                      next.category === 'years'
                        ? `${next.toGo} days to go`
                        : `${next.current.toLocaleString()} of ${next.target.toLocaleString()}`
                    }
                  />
                </li>
              ))}
            </ul>
          </Card>
        )}

        <AchievementsCard achievements={achievements} />

        {career.achieved.length === 0 ? (
          <Card>
            <p className="text-sm leading-relaxed">
              Nothing here yet. Milestones are worked out from the log rather than handed out — the
              first few arrive on their own once there are sessions behind you.
            </p>
          </Card>
        ) : (
          <>
            {present.size > 1 && (
              <div className="flex flex-wrap gap-1.5">
                <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} label="All" />
                {(Object.keys(CATEGORY_LABEL) as CareerCategory[])
                  .filter((c) => present.has(c))
                  .map((category) => (
                    <FilterChip
                      key={category}
                      active={filter === category}
                      onClick={() => setFilter(category)}
                      label={CATEGORY_LABEL[category]}
                    />
                  ))}
              </div>
            )}

            {years.map((group) => (
              <section key={group.year}>
                <div className="flex items-baseline gap-2 mb-2">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-ink-soft">
                    {group.year}
                  </h2>
                  <Link href={`/year/${group.year}`} className="text-xs font-semibold text-accent">
                    The year in review
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-2">
                  {group.milestones.map((milestone) => (
                    <li
                      key={milestone.id}
                      className="bg-surface border border-line rounded-2xl p-3.5 flex items-start gap-3"
                    >
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${DOT[milestone.category]}`}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-bold">{milestone.label}</span>
                          <span className="text-xs text-ink-soft">
                            {fromKey(milestone.date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-ink-soft leading-relaxed">{milestone.detail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}

        <Link
          href="/altimeter"
          className="bg-surface border border-line rounded-2xl p-4 flex items-center gap-3"
        >
          <Mountain size={18} className="shrink-0 text-accent" />
          <div className="flex-1 min-w-0">
            <div className="font-bold">The altimeter</div>
            <p className="text-sm text-ink-soft">Every send, as height on one lifetime climb.</p>
          </div>
          <ArrowRight size={16} className="text-ink-soft shrink-0" />
        </Link>
      </PageGrid>
    </>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Chip active={active} onClick={onClick}>
      {label}
    </Chip>
  );
}

/**
 * The other axis (PLAN.md M32).
 *
 * The timeline above counts — 250 sends, then 500 — which is right for a
 * history and wrong for a thing to aim at. This is fourteen named days, and
 * it stays fourteen: what is left is a list you could finish, not a number
 * that keeps going.
 *
 * The locked rows carry their sentence too. A row that only says its name
 * once you have earned it is a row nobody could have aimed at.
 */
function AchievementsCard({ achievements }: { achievements: Achievement[] }) {
  const earned = earnedCount(achievements);
  const newest = achievements.find((a) => a.date !== null);

  return (
    <Card title="Achievements">
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        {earned} of {ACHIEVEMENT_COUNT}. Not counters — days with a shape to them, read from the
        log, so editing a session away takes one back.
      </p>
      <ul className="grid grid-cols-1 gap-2">
        {achievements.map((achievement) => (
          <li
            key={achievement.id}
            className={`flex items-baseline gap-2 ${achievement.date === null ? 'opacity-55' : ''}`}
          >
            <span className="text-xs shrink-0 translate-y-px" aria-hidden>
              {achievement.date === null ? '·' : '✓'}
            </span>
            <span className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{achievement.name}</span>
              <span className="block text-xs text-ink-soft leading-relaxed">
                {achievement.detail}
              </span>
            </span>
            {achievement.date !== null && (
              <span className="text-xs text-ink-soft tabular-nums shrink-0">
                {fromKey(achievement.date).toLocaleDateString(undefined, {
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
      {newest?.date != null && (
        <ShareButton
          className="mt-3"
          content={achievementCard({
            name: newest.name,
            detail: newest.detail,
            date: newest.date,
            earned,
            total: ACHIEVEMENT_COUNT,
          })}
          filename={`ascent-${newest.id}.png`}
        />
      )}
    </Card>
  );
}
