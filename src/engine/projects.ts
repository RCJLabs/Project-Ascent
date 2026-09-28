/**
 * Project maths: derive, reconcile, suggest.
 *
 * The split matters. Almost everything about a project — burns, sessions,
 * high point, timeline — is *derivable* from the sessions that recorded the
 * attempts, so it is recomputed, never stored, and can never drift.
 *
 * Exactly one thing is not derivable: the moment a send is accepted. That
 * flips status and stamps a send date. It must happen once and stay
 * happened even if the climber later shelves the project. So that, and only
 * that, uses the idempotency marker the prototype got right (AUDIT.md
 * §6.14): `sendAppliedFrom` records the fold against the session id that
 * caused it, replays no-op, and a retraction is possible when the attempt
 * is actually deleted.
 *
 * There was an `appliedAt` timestamp beside it, whose own comment said *"the
 * M4 reward pipeline reads this"* (PLAN.md M155). Nothing read it — the
 * idempotency check is `sendAppliedFrom === send.sessionId` and always has
 * been — so it was a stored field, a clock parameter and a false sentence
 * describing a reader that does not exist.
 *
 * This file is the fold, which the projects store runs at boot and so sits
 * in the first load. The derived half — summaries, burns, high points and
 * suggestions — is `projectSummary.ts` (PLAN.md M344), read only by lazy
 * pages and the coach.
 *
 * Pure: records in, records out. No storage, no React.
 */

import type { Project } from '@/db/projects';
import type { ProjectAttempt, Session } from '@/db/sessions';

export interface AttemptRecord extends ProjectAttempt {
  sessionId: string;
  date: string;
}

/** Every attempt on a project, oldest first. */
export function attemptsFor(projectId: string, sessions: Session[]): AttemptRecord[] {
  const out: AttemptRecord[] = [];
  for (const session of ordered(sessions)) {
    for (const attempt of session.projectAttempts ?? []) {
      if (attempt.projectId === projectId) out.push({ ...attempt, sessionId: session.id, date: session.date });
    }
  }
  return out;
}

/** Sessions oldest first, a day's second session after its first. */
export function ordered(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
}

export interface ProjectPatch {
  id: string;
  changes: Partial<Project>;
  reason: 'sent' | 'retracted' | 'moved';
}

/**
 * Fold sends from sessions into projects, exactly once each.
 *
 * Running this twice over unchanged data returns an empty list the second
 * time — that is the whole point, and the test says so. Three transitions
 * exist:
 *
 * - `sent`: a send exists and nothing has been folded yet.
 * - `moved`: the send now comes from a different session (the attempt was
 *   re-logged on another day), so the marker re-points.
 * - `retracted`: the send attempt was deleted, so the fold is undone. A
 *   project the climber shelved keeps that status; only `sent` reverts.
 */
export function reconcileProjects(projects: Project[], sessions: Session[]): ProjectPatch[] {
  const patches: ProjectPatch[] = [];

  for (const project of projects) {
    const send = attemptsFor(project.id, sessions).find((a) => a.outcome === 'send');

    if (!send) {
      if (project.sendAppliedFrom !== undefined) {
        patches.push({
          id: project.id,
          reason: 'retracted',
          changes: {
            sendAppliedFrom: undefined,
            sentDate: undefined,
            ...(project.status === 'sent' ? { status: 'active' as const } : {}),
          },
        });
      }
      continue;
    }

    if (project.sendAppliedFrom === send.sessionId) continue;

    patches.push({
      id: project.id,
      reason: project.sendAppliedFrom === undefined ? 'sent' : 'moved',
      changes: {
        status: 'sent',
        sentDate: send.date,
        sendAppliedFrom: send.sessionId,
      },
    });
  }

  return patches;
}

/** Apply a patch to a project. Separate from `reconcileProjects` so the
 *  decision is testable without a store. */
export function applyPatch(project: Project, patch: ProjectPatch): Project {
  return { ...project, ...patch.changes };
}
