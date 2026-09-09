/**
 * Project maths: derive, reconcile, suggest.
 *
 * The split matters. Almost everything about a project — burns, sessions,
 * high point, timeline — is *derivable* from the sessions that recorded the
 * attempts, so it is recomputed, never stored, and can never drift.
 *
 * Exactly one thing is not derivable: the moment a send is accepted. That
 * flips status, stamps a send date, and (in M4) pays out. It must happen
 * once and stay happened even if the climber later shelves the project. So
 * that, and only that, uses the `appliedAt` idempotency marker the
 * prototype got right (AUDIT.md §6.14): the fold is recorded against the
 * session id that caused it, replays no-op, and a retraction is possible
 * when the attempt is actually deleted.
 *
 * Pure: records in, records out. No storage, no React.
 */

import type { Project, AttemptOutcome } from '@/db/projects';
import type { ProjectAttempt, Session } from '@/db/sessions';
import { canonicalGrade, gradeOrdinal, type GradeScale } from './grades';
import { daysBetween, today as todayKey } from './dates';

/**
 * The high point each outcome implies, as a percentage of the climb.
 *
 * Coarse on purpose: mid-session, chips are faster and more honest than a
 * slider nobody calibrates. A climber who wants precision can still pass an
 * explicit `highPoint` on the attempt and it wins.
 */
export const OUTCOME_HIGH_POINT: Record<AttemptOutcome, number | null> = {
  worked: null,
  'fell-low': 25,
  'fell-mid': 50,
  'fell-high': 75,
  'fell-crux': 90,
  send: 100,
};

export const OUTCOME_LABEL: Record<AttemptOutcome, string> = {
  worked: 'Worked moves',
  'fell-low': 'Fell low',
  'fell-mid': 'Fell mid',
  'fell-high': 'Fell high',
  'fell-crux': 'Fell at the crux',
  send: 'Sent it',
};

/** Ordering used for "was that a better burn?" — never for storage. */
const OUTCOME_RANK: AttemptOutcome[] = ['worked', 'fell-low', 'fell-mid', 'fell-high', 'fell-crux', 'send'];

export function highPointOf(attempt: ProjectAttempt): number | null {
  return attempt.highPoint ?? OUTCOME_HIGH_POINT[attempt.outcome];
}

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

function ordered(sessions: Session[]): Session[] {
  return [...sessions].sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1));
}

export interface DayHighPoint {
  date: string;
  value: number;
}

export interface ProjectSummary {
  attempts: AttemptRecord[];
  /** Total burns, counting repeats. */
  burns: number;
  /** Distinct days the project was touched. */
  days: number;
  firstDate: string | null;
  lastDate: string | null;
  /** Days since the last burn — the staleness pill. Null with no attempts. */
  daysSinceLast: number | null;
  /** Best percentage reached, ignoring `worked`. */
  highPoint: number | null;
  bestOutcome: AttemptOutcome | null;
  sendDate: string | null;
  /** Best high point per day, for the progression line. */
  highPointByDay: DayHighPoint[];
}

export function summariseProject(
  projectId: string,
  sessions: Session[],
  today: string = todayKey(),
): ProjectSummary {
  const attempts = attemptsFor(projectId, sessions);
  const byDay = new Map<string, number>();
  let highPoint: number | null = null;
  let bestOutcome: AttemptOutcome | null = null;
  let burns = 0;

  for (const attempt of attempts) {
    burns += Math.max(1, attempt.count);
    const hp = highPointOf(attempt);
    if (hp !== null) {
      if (highPoint === null || hp > highPoint) highPoint = hp;
      const day = byDay.get(attempt.date);
      if (day === undefined || hp > day) byDay.set(attempt.date, hp);
    }
    if (bestOutcome === null || OUTCOME_RANK.indexOf(attempt.outcome) > OUTCOME_RANK.indexOf(bestOutcome)) {
      bestOutcome = attempt.outcome;
    }
  }

  const dates = [...new Set(attempts.map((a) => a.date))];
  const firstDate = dates[0] ?? null;
  const lastDate = dates.at(-1) ?? null;
  const send = attempts.find((a) => a.outcome === 'send');

  return {
    attempts,
    burns,
    days: dates.length,
    firstDate,
    lastDate,
    daysSinceLast: lastDate === null ? null : Math.max(0, daysBetween(lastDate, today)),
    highPoint,
    bestOutcome,
    sendDate: send?.date ?? null,
    highPointByDay: [...byDay.entries()].map(([date, value]) => ({ date, value })),
  };
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
export function reconcileProjects(
  projects: Project[],
  sessions: Session[],
  now: string = new Date().toISOString(),
): ProjectPatch[] {
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
            appliedAt: undefined,
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
        appliedAt: now,
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

export interface ProjectSuggestion {
  /** Case-folded name — the stable key for dismissal. */
  key: string;
  name: string;
  grade: string;
  scale: GradeScale;
  /** Sessions in which this climb was logged as an attempt. */
  sessions: number;
  lastDate: string;
}

/**
 * Named climbs you keep failing on, offered as projects.
 *
 * This replaces the prototype's separate auto-detected project list: it
 * does not create anything, it only offers. Two sessions of attempts is the
 * threshold — one bad day is not a project.
 */
export function suggestProjects(
  sessions: Session[],
  projects: Project[],
  dismissed: readonly string[] = [],
  minSessions = 2,
): ProjectSuggestion[] {
  const tracked = new Set(projects.map((p) => p.name.trim().toLowerCase()));
  const skip = new Set(dismissed);
  const seen = new Map<string, { name: string; scale: GradeScale; grade: string; dates: Set<string>; last: string }>();

  for (const session of ordered(sessions)) {
    for (const climb of session.climbs) {
      const name = climb.name?.trim();
      if (!name || climb.result !== 'attempt') continue;
      const key = name.toLowerCase();
      if (tracked.has(key) || skip.has(key)) continue;

      const grade = canonicalGrade(climb.scale, climb.grade);
      if (grade === null) continue;

      const entry = seen.get(key);
      if (!entry) {
        seen.set(key, { name, scale: climb.scale, grade, dates: new Set([session.date]), last: session.date });
        continue;
      }
      entry.name = name;
      entry.dates.add(session.date);
      entry.last = session.date;
      // Keep the hardest grade seen under this name — a climb logged twice
      // at different grades is more likely to be under-graded once.
      if (entry.scale === climb.scale && gradeOrdinal(climb.scale, grade) > gradeOrdinal(entry.scale, entry.grade)) {
        entry.grade = grade;
      }
    }
  }

  return [...seen.entries()]
    .filter(([, e]) => e.dates.size >= minSessions)
    .map(([key, e]) => ({ key, name: e.name, grade: e.grade, scale: e.scale, sessions: e.dates.size, lastDate: e.last }))
    .sort((a, b) => (b.sessions - a.sessions) || (a.lastDate < b.lastDate ? 1 : -1));
}

export function activeProjects(projects: Project[]): Project[] {
  return projects.filter((p) => p.status === 'active');
}
