/**
 * What a climber's projects actually cost them (PLAN.md M69).
 *
 * Every attempt on every project is stored, and nothing ever read them in
 * aggregate: a climber could see one project's history and never "how do I
 * send". That is a question their own log can answer and no generic advice
 * can — how many burns a grade takes them, how many sessions, how long a
 * project sits before it goes.
 *
 * **Descriptive, and only descriptive.** These are counts of what happened.
 * The moment a module like this starts saying *why* a send happened it is
 * inventing coaching out of a handful of data points, so it does not: it
 * reports the numbers, says how many sends they came from, and stays quiet
 * where there are too few to mean anything.
 */

import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { daysBetween } from './dates';
import { attemptsFor } from './projects';
import type { GradeScale } from './grades';

/** Below this many sends at a grade, a number is an anecdote. */
export const ENOUGH = 3;

export interface SentProject {
  id: string;
  name: string;
  grade: string;
  scale: GradeScale;
  setting: 'indoor' | 'outdoor';
  /** Burns up to and including the one that sent it. */
  burns: number;
  /** Distinct days it was touched, up to the send. */
  sessions: number;
  /** Calendar days from the first burn to the send. */
  span: number;
  sentDate: string;
}

export interface GradeCost {
  scale: GradeScale;
  grade: string;
  sends: number;
  /** Middle value rather than the mean: one epic does not move it. */
  burns: number;
  sessions: number;
  span: number;
  /** Enough sends at this grade for the numbers to be worth reading. */
  solid: boolean;
}

export interface ProjectHistory {
  sent: SentProject[];
  byGrade: GradeCost[];
  /** Projects still open, and how long since they were last touched. */
  openest: { id: string; name: string; grade: string; days: number }[];
  /** Shelved projects, which are a cost too. */
  shelved: number;
  /** The typical shape across everything sent, when there is enough of it. */
  overall: { sends: number; burns: number; sessions: number; span: number } | null;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** One sent project's cost, or null when the log cannot say. */
export function costOf(project: Project, sessions: Session[], today?: string): SentProject | null {
  if (project.status !== 'sent') return null;
  const attempts = attemptsFor(project.id, sessions);
  if (attempts.length === 0) return null;

  // Up to and including the send. A project climbed again afterwards should
  // not read as having taken forty burns.
  const sendAt = attempts.findIndex((a) => a.outcome === 'send');
  const upToSend = sendAt >= 0 ? attempts.slice(0, sendAt + 1) : attempts;
  const sentDate = project.sentDate ?? upToSend.at(-1)?.date ?? today ?? null;
  if (sentDate === null) return null;

  const first = upToSend[0]!.date;
  return {
    id: project.id,
    name: project.name,
    grade: project.grade,
    scale: project.scale,
    setting: project.setting,
    burns: upToSend.length,
    sessions: new Set(upToSend.map((a) => a.date)).size,
    span: Math.max(0, daysBetween(first, sentDate)),
    sentDate,
  };
}

export function projectHistory(
  projects: Project[],
  sessions: Session[],
  today?: string,
): ProjectHistory {
  const sent = projects
    .map((p) => costOf(p, sessions, today))
    .filter((s): s is SentProject => s !== null)
    .sort((a, b) => (a.sentDate < b.sentDate ? 1 : -1));

  const grades = new Map<string, SentProject[]>();
  for (const project of sent) {
    const key = `${project.scale}:${project.grade}`;
    grades.set(key, [...(grades.get(key) ?? []), project]);
  }

  const byGrade = [...grades.values()]
    .map((group) => ({
      scale: group[0]!.scale,
      grade: group[0]!.grade,
      sends: group.length,
      burns: median(group.map((p) => p.burns)),
      sessions: median(group.map((p) => p.sessions)),
      span: median(group.map((p) => p.span)),
      solid: group.length >= ENOUGH,
    }))
    .sort((a, b) => b.sends - a.sends || a.grade.localeCompare(b.grade));

  const open = projects.filter((p) => p.status === 'active');
  const openest = open
    .map((project) => {
      const attempts = attemptsFor(project.id, sessions);
      const last = attempts.at(-1)?.date ?? project.createdAt.slice(0, 10);
      return { id: project.id, name: project.name, grade: project.grade, days: Math.max(0, daysBetween(last, today ?? last)) };
    })
    .sort((a, b) => b.days - a.days);

  return {
    sent,
    byGrade,
    openest,
    shelved: projects.filter((p) => p.status === 'shelved').length,
    overall:
      sent.length >= ENOUGH
        ? {
            sends: sent.length,
            burns: median(sent.map((p) => p.burns)),
            sessions: median(sent.map((p) => p.sessions)),
            span: median(sent.map((p) => p.span)),
          }
        : null,
  };
}
