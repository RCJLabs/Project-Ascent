import { useMemo } from 'react';
import { Link } from 'wouter';
import { ChevronRight, MapPin } from 'lucide-react';
import { venueKey, venues } from '@/engine/venues';
import { shortLabel } from '@/engine/dates';
import { useSessions, allSessions } from '@/store/sessions';
import { useProjects } from '@/store/projects';
import { useObjectives } from '@/store/objectives';
import { useGradeLabel } from '@/ui/useGrade';
import { BackLink } from '@/ui/BackLink';
import { Card } from '@/ui/Card';
import { PageGrid } from '@/ui/PageGrid';
import { PageHeader } from '@/ui/PageHeader';
import { RecordNotFound } from '@/ui/RecordNotFound';

/**
 * A place, opened (PLAN.md M192).
 *
 * ## What was already there, and what was not
 *
 * M88b built the reading: three free-text location fields —
 * `session.fields.location`, `Project.location`, `Objective.location` —
 * grouped into one `Venue` by a deliberately timid key. That half of the
 * catalogue works. What did not exist is anywhere to *look* at a place:
 * Career shows the top eight as rows of name, days and best grade, and the
 * app has a detail page for a project, an objective, a benchmark, a drill, a
 * guide and a program. A venue was the odd one out.
 *
 * ## And two fields nobody read
 *
 * `Venue.projects` and `Venue.objectives` were counted, asserted in
 * `venues.test.ts`, and rendered by nothing — M155 and M156's shape, in an
 * engine interface the M169 sweep does not cover. The counts are gone; this
 * page lists the projects and objectives themselves, which is what makes a
 * venue a place rather than a row, and a list needs no count beside it.
 *
 * ## Derived, like the rest of it
 *
 * No store, no migration, nothing to curate. The page is a filter over the
 * log a climber already has, which is also why it can be honest about
 * spellings: what it cannot prove is one place, it does not merge.
 */
export function VenuePage({ params }: { params: { key: string } }) {
  const byDate = useSessions((s) => s.byDate);
  const projects = useProjects((s) => s.projects);
  const objectives = useObjectives((s) => s.objectives);
  const gradeLabel = useGradeLabel();

  // The route carries the key already normalised by `venueKey`, but it has
  // been through a URL — so it is normalised again rather than trusted.
  const key = venueKey(decodeURIComponent(params.key));

  const { place, sessions, here, aims } = useMemo(() => {
    const all = allSessions(byDate);
    const found = venues({ sessions: all, projects, objectives }).find((v) => v.key === key);
    return {
      place: found,
      sessions: all
        .filter((s) => s.completed && venueKey(String(s.fields?.location ?? '')) === key)
        .map((s) => s.date)
        .sort(),
      here: projects.filter((p) => venueKey(p.location ?? '') === key),
      aims: objectives.filter((o) => venueKey(o.location ?? '') === key),
    };
  }, [byDate, projects, objectives, key]);

  if (!place) {
    return (
      <RecordNotFound what="That place" backTo="/career" backLabel="Back to your career" />
    );
  }

  const first = sessions[0];
  const last = sessions.at(-1);
  const best = ([['V', place.best.V], ['YDS', place.best.YDS]] as const).filter(
    (pair): pair is readonly ['V' | 'YDS', string] => pair[1] !== null,
  );

  return (
    <>
      <BackLink href="/career" title="Your career" />
      <PageHeader title={place.name} />
      <PageGrid>
        <Card title="What you have done here">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label="Days" value={String(place.days)} />
            <Stat label="Sessions" value={String(place.sessions)} />
            {place.outdoorDays > 0 && (
              <Stat label="Outside" value={`${place.outdoorDays} of ${place.days} days`} />
            )}
            {best.length > 0 && (
              <Stat
                label="Hardest sent"
                value={best.map(([scale, grade]) => gradeLabel(scale, grade)).join(' · ')}
              />
            )}
            {first !== undefined && last !== undefined && (
              <Stat
                label={first === last ? 'Visited' : 'First and last'}
                value={
                  first === last ? shortLabel(first) : `${shortLabel(first)} – ${shortLabel(last)}`
                }
              />
            )}
          </dl>
          {/* Grades vary by crag, which is the whole reason the best is kept
              per place rather than per mode (PLAN.md M112f). */}
          {best.length > 0 && place.outdoorDays > 0 && (
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Grades vary by crag, so this number is only comparable with itself.
            </p>
          )}
        </Card>

        {here.length > 0 && (
          <Card title="Projects here">
            <div className="grid grid-cols-1 gap-1.5">
              {here.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="focus-ring flex items-center gap-2 text-sm rounded-xl px-2 py-1.5 -mx-2"
                >
                  <span className="flex-1 min-w-0 truncate font-semibold">{project.name}</span>
                  <span className="shrink-0 text-xs text-ink-soft">
                    {gradeLabel(project.scale, project.grade)}
                  </span>
                  <ChevronRight size={15} className="text-ink-soft shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        )}

        {aims.length > 0 && (
          <Card title="What you are here for">
            <div className="grid grid-cols-1 gap-1.5">
              {aims.map((objective) => (
                <Link
                  key={objective.id}
                  href={`/objectives/${objective.id}`}
                  className="focus-ring flex items-center gap-2 text-sm rounded-xl px-2 py-1.5 -mx-2"
                >
                  <MapPin size={14} className="text-ink-soft shrink-0" />
                  <span className="flex-1 min-w-0 truncate font-semibold">{objective.name}</span>
                  <ChevronRight size={15} className="text-ink-soft shrink-0" />
                </Link>
              ))}
            </div>
          </Card>
        )}

        {place.spellings.length > 1 && (
          <Card title="Written as">
            <p className="text-sm text-ink-soft leading-relaxed">
              {place.spellings.map((s) => `“${s}”`).join(', ')} — counted as one place because
              capitals and spacing are ignored. Anything the app cannot prove is the same place it
              leaves alone.
            </p>
          </Card>
        )}
      </PageGrid>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
