/**
 * What the rest is for (PLAN.md M217).
 *
 * The Ascent had never heard of a grade, a project or a venue — zero
 * mentions of any of them across `engine/ascent` and `features/ascent`. The
 * app knows the name of the climb you are working, what it is graded and
 * where it is, and the game's wall was anonymous rock with a number on it.
 *
 * ## Why the project and not the wall
 *
 * The brainstorm that proposed this offered two shapes, and **the first one
 * was wrong**: naming the day's wall after the venue you climb at would put
 * your gym's name on a wall the copy directly beneath it promises is *"the
 * same one everyone gets today"*. The pattern is shared on purpose — it is
 * the whole reason a score is comparable — so a personal name on it is a
 * claim about the wall that is not true.
 *
 * What is already personal here is the climber: their figure, their stat
 * hooks, their unlocked rock, their ghost. So this names something of
 * theirs, and the Ascent is the right screen for it: the card on the game
 * page calls it the rest-day activity and the payout says *"the good
 * paydays are on rest days"*. A screen built around resting is the one
 * place in the app where naming what you are resting **for** is not a nag.
 *
 * ## It reads, and never writes
 *
 * Nothing here changes a run, a payout or a project. It is a sentence and a
 * link, which is the whole of it: the game must not become a place where
 * projects are worked.
 */

import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { displayGrade, type GradeDisplay } from '../grades';
import { activeProjects, summariseProject } from '../projects';

export interface RestingFor {
  id: string;
  name: string;
  /** In the notation the climber reads, not the one it was stored in. */
  grade: string;
  /** Where it is, when the project says. */
  location: string | null;
  /** Distinct days it has been touched. */
  days: number;
  /** Days since the last burn. Null when it has never been touched. */
  daysSinceLast: number | null;
  /** Best percentage from the ground, or null. */
  highPoint: number | null;
}

export interface RestingInput {
  projects: readonly Project[];
  sessions: readonly Session[];
  display: GradeDisplay;
  today?: string;
}

/**
 * The active project you touched most recently, or null.
 *
 * **Most recently, not most often.** A climber with two projects on the go
 * is working the one they were on last week, and the one they put twenty
 * burns into last winter is the wrong answer however big its number is.
 * Burns break a tie, and an untouched project only wins when nothing has
 * been touched at all — it is still the climb you said you were on.
 */
export function restingFor(input: RestingInput): RestingFor | null {
  const active = activeProjects([...input.projects]);
  if (active.length === 0) return null;

  const sessions = [...input.sessions];
  const rated = active.map((project) => ({
    project,
    summary: summariseProject(project.id, sessions, input.today),
  }));
  rated.sort((a, b) => {
    const last = (b.summary.lastDate ?? '').localeCompare(a.summary.lastDate ?? '');
    if (last !== 0) return last;
    const burns = b.summary.burns - a.summary.burns;
    if (burns !== 0) return burns;
    return b.project.updatedAt.localeCompare(a.project.updatedAt);
  });

  const { project, summary } = rated[0]!;
  return {
    id: project.id,
    name: project.name,
    grade: displayGrade(project.scale, project.grade, input.display),
    location: project.location !== undefined && project.location.trim() !== ''
      ? project.location.trim()
      : null,
    days: summary.days,
    daysSinceLast: summary.daysSinceLast,
    highPoint: summary.highPoint,
  };
}

/** `V7` · `V7, at The Works` — the climb, and where it is when it says. */
export function describeClimb(resting: RestingFor): string {
  return resting.location === null ? resting.grade : `${resting.grade}, at ${resting.location}`;
}

/**
 * How it is going, in one sentence.
 *
 * Null for a project with no burns on it: *"0 days on it"* is the app
 * telling a climber off for a climb they have only just written down.
 */
export function describeBurns(resting: RestingFor): string | null {
  if (resting.daysSinceLast === null || resting.days === 0) return null;
  const days = `${resting.days} day${resting.days === 1 ? '' : 's'} on it`;
  const since =
    resting.daysSinceLast === 0
      ? 'last touched today'
      : resting.daysSinceLast === 1
        ? 'last touched yesterday'
        : `last touched ${resting.daysSinceLast} days ago`;
  const high = resting.highPoint === null ? '' : ` High point ${resting.highPoint}%.`;
  return `${days}, ${since}.${high}`;
}
