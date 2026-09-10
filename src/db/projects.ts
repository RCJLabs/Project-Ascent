/**
 * Projects — the climbs you are working, and the burns you spend on them.
 *
 * One system, not two. The prototype ran a user-tracked project list *and*
 * a parallel log-derived outdoor-project detector, which disagreed with
 * each other (AUDIT.md §3). Here there is one `Project` record; detection
 * is demoted to a suggestion that offers to create one.
 *
 * Attempts are NOT stored here. They live on the session that produced
 * them, because a burn is something that happened on a day — see
 * `engine/projects.ts` for the derive-and-reconcile split.
 */

import type { GradeScale } from '@/engine/grades';
import { getDb } from './db';
import { recordReading, sound, type Shape } from './sound';

export type ProjectStatus = 'active' | 'sent' | 'shelved';

/** How far you got. `worked` is rehearsal rather than a redpoint burn, so
 *  it carries no high point and never counts toward the high-point line. */
export type AttemptOutcome = 'worked' | 'fell-low' | 'fell-mid' | 'fell-high' | 'fell-crux' | 'send';

export interface BetaNote {
  id: string;
  date: string;
  text: string;
}

export interface Project {
  id: string;
  name: string;
  grade: string;
  scale: GradeScale;
  setting: 'indoor' | 'outdoor';
  location?: string;
  status: ProjectStatus;
  beta: BetaNote[];
  /** Set by reconciliation, not by hand. */
  sentDate?: string;
  /**
   * Id of the session whose send has been folded into this project.
   *
   * The idempotency marker (AUDIT.md §6.14). Reconciliation applies a send
   * exactly once, ever: replays, reloads and re-imports all no-op, and a
   * project you shelve after sending is not silently flipped back.
   */
  sendAppliedFrom?: string;
  /** When that fold happened. The M4 reward pipeline reads this. */
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** Focus mechanic, not a storage limit (PLAN.md §5.8). Raisable later by a
 *  skill-tree capstone; nothing in the engine assumes it. */
export const ACTIVE_CAP = 5;

export function newProject(patch: Partial<Project> & Pick<Project, 'name' | 'grade' | 'scale'>): Project {
  const now = new Date().toISOString();
  return {
    id: `p-${now}-${Math.random().toString(36).slice(2, 8)}`,
    setting: 'indoor',
    status: 'active',
    beta: [],
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
}

/**
 * `beta` is the one that took two pages down (M44): the journal iterates it
 * and reads each note's `date` straight into an entry, which `byMonth` then
 * slices. A note without a date is worse than a missing note, because it
 * reaches further before it fails.
 */
const PROJECT_SHAPE: Shape = {
  needs: { id: 'string', name: 'string', grade: 'string', scale: 'string', createdAt: 'string' },
  lists: { beta: { id: 'string', date: 'string', text: 'string' } },
};

export async function listProjects(): Promise<Project[]> {
  const db = await getDb();
  const reading = sound<Project>(await db.getAll('projects'), PROJECT_SHAPE);
  recordReading('projects', reading);
  return reading.rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function putProject(project: Project): Promise<Project> {
  const db = await getDb();
  const next = { ...project, updatedAt: new Date().toISOString() };
  await db.put('projects', next as never);
  return next;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await db.delete('projects', id);
}
