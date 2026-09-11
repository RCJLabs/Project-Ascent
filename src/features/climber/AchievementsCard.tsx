import { useMemo } from 'react';
import { Link } from 'wouter';
import { Award, ChevronRight, Trophy } from 'lucide-react';
import {
  ACHIEVEMENT_COUNT,
  deriveAchievements,
  earnedCount,
  sortAchievements,
} from '@/engine/achievements';
import { deriveCareer } from '@/engine/career';
import { deriveClimberState } from '@/engine/derive';
import { getProgram } from '@/content/programs';
import { fromKey } from '@/engine/dates';
import { useProjects } from '@/store/projects';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { Card } from '@/ui/Card';
import { ShareButton } from '@/features/share/ShareSheet';
import { achievementCard } from '@/ui/shareCard';

/**
 * The achievements a climber has, read from the log.
 *
 * M63 moved them onto the climber page, off the career page that hangs
 * under seven charts on Progress. They stay one tap from the climber — but
 * the list is its own page now that it is twenty-five long, because a card
 * holding twenty-five rows is the reason a page about *who you are* becomes
 * a page about scrolling.
 *
 * Reads its own stores rather than taking props, which is how every other
 * card of this kind works, and is what lets it be moved without a page
 * having to know what it needs.
 */
export function useAchievements() {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
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
  return { achievements, earned: earnedCount(achievements) };
}

/** The link on the climber page, and the count it carries. */
export function AchievementsCard() {
  const { achievements, earned } = useAchievements();
  const newest = achievements.find((a) => a.date !== null);

  return (
    <Card title="Achievements">
      <Link href="/achievements" className="flex items-center gap-3">
        <Award size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {earned} of {ACHIEVEMENT_COUNT}
          </p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {newest
              ? `Latest: ${newest.name}, ${fromKey(newest.date!).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
              : 'Days with a shape to them, read from the log.'}
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}

/**
 * The whole list, on a page of its own.
 *
 * No title and no count: the page header above it carries both, and a card
 * repeating them says "Achievements — 7 of 25" twice on one screen.
 */
export function AchievementList() {
  const { achievements, earned } = useAchievements();
  const newest = achievements.find((a) => a.date !== null);

  return (
    <Card>
      <p className="text-sm text-ink-soft mb-3 leading-relaxed">
        Not counters — days with a shape to them, read from the log, so editing a session away
        takes one back.
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

/** The whole history, from the page that shows the named days of it. */
export function CareerLinkCard() {
  const byDate = useSessions((s) => s.byDate);
  const display = useSettings((s) => s.display);
  const career = useMemo(() => {
    const sessions = Object.values(byDate).flat();
    return deriveCareer({ sessions, records: deriveClimberState(sessions).personalRecords, display });
  }, [byDate, display]);
  const latest = career.achieved[0];

  return (
    <Card title="Career">
      <Link href="/career" className="flex items-center gap-3">
        <Trophy size={18} className="text-accent shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">
            {career.achieved.length > 0
              ? `${career.achieved.length} milestones`
              : 'No milestones yet'}
          </p>
          <p className="text-xs text-ink-soft mt-0.5 truncate">
            {latest
              ? `Latest: ${latest.label}, ${fromKey(latest.date).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
              : 'Worked out from the log, not handed out.'}
          </p>
        </div>
        <ChevronRight size={18} className="text-ink-soft shrink-0" />
      </Link>
    </Card>
  );
}
