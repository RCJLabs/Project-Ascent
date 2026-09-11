import { useEffect } from 'react';
import { useSessions } from '@/store/sessions';
import { useProjects } from '@/store/projects';
import { BackLink } from '@/ui/BackLink';
import { PageGrid } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';
import { ACHIEVEMENT_COUNT } from '@/engine/achievements';
import { AchievementList, useAchievements } from './AchievementsCard';

/**
 * The achievements, on a page of their own.
 *
 * They were a card on the climber page, which was right at fourteen and is
 * not at twenty-five: a list that long turns the page about who you are
 * into a page you scroll past. The climber keeps the count and the latest
 * one, and this holds the rest.
 */
export function AchievementsPage() {
  const hydrated = useSessions((s) => s.hydrated);
  const load = useSessions((s) => s.load);
  const projectsReady = useProjects((s) => s.hydrated);
  const loadProjects = useProjects((s) => s.load);
  const { earned } = useAchievements();

  useEffect(() => {
    if (!hydrated) void load();
    if (!projectsReady) void loadProjects();
  }, [hydrated, load, projectsReady, loadProjects]);

  // Waits for both, or the count reads "0 of 25" for a frame and then
  // changes under the reader (PLAN.md M22).
  if (!hydrated || !projectsReady) return <PageSkeleton title="Achievements" />;

  return (
    <>
      <BackLink />
      <PageHeader
        title="Achievements"
        subtitle={`${earned} of ${ACHIEVEMENT_COUNT}, worked out from the log`}
      />
      <PageGrid>
        <AchievementList />
      </PageGrid>
    </>
  );
}
