/**
 * The pictures a retrospective can show (PLAN.md M92).
 *
 * Photos attach to sessions and projects, they have captions, and beta can
 * be drawn on them — and `MediaCard` was mounted in exactly two places, the
 * logger and the project page. Neither the journal nor the year in review
 * carried a media reference: the one surface in the app meant to be
 * *looked at* rather than read was the one with no images in it.
 *
 * **Nothing here reads a blob.** It works from the owner index — who has
 * photos, not what they are — and names the handful a page should then
 * load. That ordering is the whole point: a year with four hundred photos
 * must cost four hundred index keys and twelve reads, not four hundred
 * blobs.
 *
 * **A project's photos are dated by its send.** A session is a day and
 * needs no argument; a project spans months and the app has no date for
 * the picture itself. One that has been sent belongs to the year it was
 * sent in; one still in progress is not a record of a year, so its beta
 * stays out of the grid rather than being filed under a date invented for
 * it.
 */

import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { projectOwner, sessionOwner } from '@/db/media';

export interface PhotoRef {
  /** Media id, for the caller to read the blob by. */
  id: string;
  ownerId: string;
  /** The day it is filed against. */
  date: string;
  /** What it is filed on. */
  title: string;
  /** Where to go to see it whole. */
  href: string;
}

export interface PickInput {
  /** Owner key → media ids, from `mediaOwners`. */
  owners: ReadonlyMap<string, readonly string[]>;
  sessions: readonly Session[];
  projects: readonly Project[];
  from: string;
  to: string;
  limit: number;
}

/** Everything filed against a dated thing inside the range. */
function candidates(input: PickInput): PhotoRef[] {
  const out: PhotoRef[] = [];
  const take = (ownerId: string, date: string, title: string, href: string): void => {
    for (const id of input.owners.get(ownerId) ?? []) out.push({ id, ownerId, date, title, href });
  };

  for (const session of input.sessions) {
    if (session.date < input.from || session.date > input.to) continue;
    take(sessionOwner(session.id), session.date, 'A session', `/log/${session.date}`);
  }
  for (const project of input.projects) {
    const date = project.sentDate;
    if (date === undefined || date < input.from || date > input.to) continue;
    take(projectOwner(project.id), date, project.name, `/projects/${project.id}`);
  }
  return out;
}

/**
 * A year in pictures, spread across the months that have any.
 *
 * Taking the first `limit` in date order would hand back a grid of one busy
 * fortnight and call it a year. So the months take turns: one from each
 * month that has photos, then a second from each, until the grid is full or
 * the pictures run out.
 */
export function pickPhotos(input: PickInput): PhotoRef[] {
  const byMonth = new Map<string, PhotoRef[]>();
  for (const ref of candidates(input)) {
    const month = ref.date.slice(0, 7);
    const bucket = byMonth.get(month);
    if (bucket) bucket.push(ref);
    else byMonth.set(month, [ref]);
  }

  const months = [...byMonth.keys()].sort();
  for (const month of months) {
    byMonth.get(month)!.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  }

  const out: PhotoRef[] = [];
  for (let round = 0; out.length < input.limit; round++) {
    let placed = false;
    for (const month of months) {
      const ref = byMonth.get(month)![round];
      if (!ref) continue;
      out.push(ref);
      placed = true;
      if (out.length === input.limit) break;
    }
    if (!placed) break;
  }
  return out;
}

/** How many photos are filed on a thing, without reading any of them. */
export function photoCount(owners: ReadonlyMap<string, readonly string[]>, ownerId: string): number {
  return owners.get(ownerId)?.length ?? 0;
}
