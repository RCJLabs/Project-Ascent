/**
 * Where a photo can go (PLAN.md M111b).
 *
 * ## The gap this fills
 *
 * Photos attach through `MediaCard`, which takes an owner and is rendered
 * on exactly two pages: a session's log and a project's detail. So adding a
 * picture means already being on the page it belongs to. A climber back
 * from a day out with five photos navigates five times, and a photo
 * *shared* into the app from the camera roll has nowhere at all to land —
 * which is why M111 refused the `share_target` manifest entry rather than
 * build a front door onto a room that does not exist.
 *
 * This is the room. It is worth having without the share target, which is
 * the reason it is built first.
 *
 * ## What it offers, and what it refuses to
 *
 * Sessions the climber has actually logged, most recent first, and projects
 * they are actually working. **Never a session that does not exist**: an
 * empty day created as a side effect of filing a photo is a day the review,
 * the streak and the consistency grid all have to explain. Today is offered
 * only when today has a session.
 *
 * An owner already holding `MAX_PER_OWNER` photos is listed and marked full
 * rather than hidden. A destination that silently disappears at eight is
 * one a climber hunts for.
 */

import { MAX_PER_OWNER, projectOwner, sessionOwner } from '@/db/media';
import type { Session } from '@/db/sessions';
import type { Project } from '@/db/projects';
import { activeProjects } from '@/engine/projects';

/** How many past days are worth scrolling. */
export const RECENT_DAYS = 14;

export interface Target {
  /** The `media` owner key. Namespaced, because the sweep reads the prefix. */
  owner: string;
  kind: 'session' | 'project';
  label: string;
  /** The date for a session, the grade for a project. Never both. */
  detail: string;
  /** Where tapping through goes once it has landed. */
  href: string;
  count: number;
  full: boolean;
}

export interface TargetInput {
  sessions: Session[];
  projects: Project[];
  /** `ownerId` → how many photos it already holds. */
  counts: Map<string, number>;
  today: string;
  /** Injected so the window is testable without moving the clock. */
  days?: number;
}

/**
 * A session's own words for what it was, falling back to the date.
 *
 * `location` is the field a climber fills in with the crag, so a list of
 * eight days reads as places rather than as eight identical rows.
 */
function sessionLabel(session: Session, today: string): string {
  const where = typeof session.fields?.['location'] === 'string' ? session.fields['location'].trim() : '';
  if (where.length > 0) return where;
  if (session.date === today) return 'Today';
  return session.mode === 'outdoor' ? 'Outdoors' : 'Session';
}

export function attachTargets({
  sessions,
  projects,
  counts,
  today,
  days = RECENT_DAYS,
}: TargetInput): Target[] {
  const cutoff = new Date(`${today}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - days);
  const from = cutoff.toISOString().slice(0, 10);

  const recent = sessions
    .filter((s) => s.date >= from && s.date <= today)
    // Most recent first, and the id breaks a tie so two sessions on one day
    // keep a stable order rather than whichever the sort happened to
    // produce. The id encodes the date and the index (`2026-09-01#0`), so
    // comparing it descending is comparing the index descending.
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .map((session): Target => {
      const owner = sessionOwner(session.id);
      const count = counts.get(owner) ?? 0;
      return {
        owner,
        kind: 'session',
        label: sessionLabel(session, today),
        detail: session.date,
        href: `/log/${session.date}`,
        count,
        full: count >= MAX_PER_OWNER,
      };
    });

  const open = activeProjects(projects).map((project): Target => {
    const owner = projectOwner(project.id);
    const count = counts.get(owner) ?? 0;
    return {
      owner,
      kind: 'project',
      label: project.name,
      detail: project.grade,
      href: `/projects/${project.id}`,
      count,
      full: count >= MAX_PER_OWNER,
    };
  });

  return [...recent, ...open];
}

/**
 * Why there is nothing to attach to, in the climber's terms.
 *
 * Three different empties that look identical on screen and are not the
 * same problem: a new install, a climber who has not logged in a fortnight,
 * and one whose every destination is at the cap. Saying "no targets" to all
 * three sends two of them looking for a bug.
 */
export function describeEmpty(targets: Target[], hasAnySession: boolean): string | null {
  if (targets.length > 0 && targets.some((t) => !t.full)) return null;
  if (targets.length > 0) {
    return `Every recent session and open project is already holding ${MAX_PER_OWNER} photos. Remove one from a day or a project to make room.`;
  }
  if (hasAnySession) {
    return `Photos attach to a session or a project, and there is nothing logged in the last ${RECENT_DAYS} days. Log the day first and it will appear here.`;
  }
  return 'Photos attach to a session or a project. Log a session — or start a project — and it will show up here.';
}
