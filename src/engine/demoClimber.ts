/**
 * A climber who does not exist (PLAN.md M110).
 *
 * §9.3 closed multi-profile with *"better served by a sample-data mode"* and
 * nothing was built, so three jobs had no answer: M12 needs store
 * screenshots of an app that looks lived in, the coach makes content about
 * a log that has something in it, and **every browser verification from M89
 * to M109 hand-rolled a fixture into IndexedDB through a throwaway script**
 * — seven times in this run alone, each one a different shape, none of them
 * kept.
 *
 * ## Deterministic, from the one RNG the app already has
 *
 * `ascent/rng.ts` exists for the wall game and says of itself that "a seed
 * plus a sequence of inputs reproduces a run exactly on any machine". That
 * is the property a screenshot set needs, so this uses it rather than a
 * second generator. One seed, one climber, every time.
 *
 * ## Plausible, not flattering
 *
 * A demo log full of sends at the top of the pyramid is a brochure. This
 * one has a plateau, a week off, sessions with no warmup, a project that is
 * not sent, an injury that is still there, and assessments that go sideways
 * before they go up — because every screen in the app exists to say
 * something about those, and a sample climber who never has a bad month
 * shows none of them working.
 *
 * ## Every record is tagged
 *
 * `demo: true` on each one, which is what makes the wipe safe: it deletes
 * what it wrote and nothing else, so a real session logged on top survives.
 *
 * **Its timestamps come from the day, not the clock.** `newSession` stamps
 * `createdAt` and `updatedAt` with `new Date()`, which is right for a
 * session someone logs and fatal here: two runs a millisecond apart
 * produced different records, so "the same climber every time" was false
 * and the screenshots were not reproducible. Every stamp below is derived
 * from the date the record belongs to.
 *
 * Pure: a seed and a date in, records out. Writing them is `db/demo.ts`.
 */

import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import type { Climb, ProjectAttempt, Session, WallAngle } from '@/db/sessions';
import { newSession, sessionId } from '@/db/sessions';
import type { Injury } from '@/store/profile';
import { createRng, next, type Rng } from './ascent/rng';
import { addDays, startOfWeek } from './dates';

/** One climber, so a screenshot taken today matches one taken in a year. */
export const DEMO_SEED = 20_260_112;

/** A year, which is what the career page and the year review need. */
export const DEMO_WEEKS = 52;

export interface DemoClimber {
  sessions: Session[];
  projects: Project[];
  metrics: MetricEntry[];
  injuries: Injury[];
  /** The program the demo is mid-way through, and when it started. */
  programId: string;
  startDate: string;
}

/**
 * Burns on a project, escalating.
 *
 * Without these every project page reads "No burns yet" — the timeline, the
 * high point and M102's longest link all draw nothing, and those are the
 * screens a project is *for*. Seen in the sample climber's own screenshots,
 * which is the job this climber exists to do.
 */
function burnsFor(rng: Rng, week: number, id: string): ProjectAttempt[] {
  // Two projects worked over the back half of the year, one of them sent.
  if (week < 30 || !chance(rng, 0.45)) return [];
  const onJoker = week < 44;
  const progress = Math.min(1, (week - 30) / 18);
  const high = Math.round(35 + progress * 55 + next(rng) * 8);
  // No extra roll on top of the two that already gate a burn: behind three
  // dice the send never landed, and the project list said "sent" over a
  // timeline with nothing but falls in it.
  const sent = onJoker && week >= 41;
  return [
    {
      id: `${id}-a`,
      projectId: onJoker ? 'demo-the-joker' : 'demo-brad-pit',
      outcome: sent ? 'send' : high > 80 ? 'fell-high' : high > 55 ? 'fell-crux' : 'fell-mid',
      ...(sent ? {} : { highPoint: Math.min(95, high) }),
      // Worked from partway up often enough that the longest link is not
      // always the ground-up high point (PLAN.md M102).
      ...(!sent && chance(rng, 0.3) ? { from: Math.round(next(rng) * 30) } : {}),
      count: 1 + Math.floor(next(rng) * 4),
      ...(chance(rng, 0.25) ? { note: pick(rng, ['Skin gone.', 'Wind picked up.', 'Closer.']) } : {}),
    },
  ];
}

/** Timestamps from the day the record is about, never from the clock. */
const stamps = (date: string) => ({ createdAt: `${date}T18:00:00.000Z`, updatedAt: `${date}T20:00:00.000Z` });

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(next(rng) * items.length)]!;
const chance = (rng: Rng, p: number): boolean => next(rng) < p;

/** V grades, hardest last, so a week index can walk up them. */
const LADDER = ['V2', 'V3', 'V4', 'V5', 'V6', 'V7'];
const ANGLES: WallAngle[] = ['slab', 'vertical', 'overhang', 'roof'];

/**
 * The ceiling this week.
 *
 * Up for five months, flat for four — the plateau is the point, since
 * `plateau.ts`, the coach and half the progress page exist to say something
 * about one and say nothing at all against a line that only goes up.
 */
function ceilingAt(week: number): number {
  if (week < 20) return Math.min(3, Math.floor(week / 7));
  if (week < 38) return 3;
  return Math.min(LADDER.length - 1, 3 + Math.floor((week - 38) / 7));
}

function climbsFor(rng: Rng, week: number, id: string): Climb[] {
  const top = ceilingAt(week);
  const out: Climb[] = [];
  for (let i = 0; i <= top; i += 1) {
    // More of the easy ones than the hard ones, which is what a pyramid is.
    const count = Math.max(1, top - i + Math.floor(next(rng) * 2));
    const sent = i < top || chance(rng, 0.35);
    out.push({
      id: `${id}-c${i}`,
      grade: LADDER[i]!,
      scale: 'V',
      count,
      result: sent ? 'send' : 'attempt',
      ...(chance(rng, 0.7) ? { angle: pick(rng, ANGLES) } : {}),
      ...(sent && i === top && chance(rng, 0.4) ? { style: 'flash' as const } : {}),
    });
  }
  return out;
}

export function demoClimber(today: string, seed = DEMO_SEED): DemoClimber {
  const rng = createRng(seed);
  const start = addDays(startOfWeek(today), -(DEMO_WEEKS - 1) * 7);

  const sessions: Session[] = [];
  const metrics: MetricEntry[] = [];

  for (let week = 0; week < DEMO_WEEKS; week += 1) {
    const monday = addDays(start, week * 7 + 1);
    // One week off in the spring, because a log with no gap in it has never
    // belonged to anyone.
    if (week === 26) continue;

    const days = chance(rng, 0.2) ? 2 : 3;
    for (let d = 0; d < days; d += 1) {
      const date = addDays(monday, d * 2);
      if (date > today) continue;
      const id = sessionId(date, 0);
      // Project season in the back half of the year, which is both more
      // plausible and what puts enough burns on the project pages for them
      // to draw anything.
      const outdoor = chance(rng, week >= 30 ? 0.4 : 0.12);
      sessions.push(
        newSession(date, 0, {
          ...stamps(date),
          demo: true,
          completed: true,
          rewarded: true,
          planned: true,
          mode: outdoor ? 'outdoor' : 'indoor',
          rpe: 5 + Math.floor(next(rng) * 4),
          durationMin: 60 + Math.floor(next(rng) * 4) * 15,
          warmup: chance(rng, 0.85),
          climbs: climbsFor(rng, week, id),
          ...(outdoor ? { projectAttempts: burnsFor(rng, week, id) } : {}),
          ...(outdoor ? { fields: { location: pick(rng, ['Stanage', 'The Roaches', 'Malham']) } } : {}),
          ...(chance(rng, 0.3)
            ? { checkIn: { fingers: pick(rng, ['good', 'good', 'tender'] as const), sleep: pick(rng, ['good', 'good', 'short'] as const) } }
            : {}),
        }),
      );
    }
    // A rest day most weeks, which is a logged thing in this app.
    if (chance(rng, 0.6)) {
      const date = addDays(monday, 6);
      if (date <= today) {
        sessions.push(
          newSession(date, 0, {
            ...stamps(date),
            demo: true,
            completed: true,
            rewarded: true,
            restChecklist: {
              hydration: chance(rng, 0.8),
              mobility: chance(rng, 0.5),
              zone1: chance(rng, 0.3),
              sleep: chance(rng, 0.7),
            },
          }),
        );
      }
    }
    // A benchmark every eight weeks, going sideways before it goes up.
    if (week % 8 === 0) {
      const date = addDays(monday, 1);
      if (date <= today) {
        metrics.push(
          { metricId: 'max_hang_20mm_7s', date, value: 20 + ceilingAt(week) * 5 + Math.floor(next(rng) * 5), demo: true },
          { metricId: 'max_pullups', date, value: 8 + Math.floor(week / 12) + Math.floor(next(rng) * 3), demo: true },
        );
      }
    }
  }

  const made = (name: string, grade: string, patch: Partial<Project> = {}): Project => ({
    id: `demo-${name.toLowerCase().replace(/\W+/g, '-')}`,
    name,
    grade,
    scale: 'V',
    setting: 'outdoor',
    status: 'active',
    beta: [],
    demo: true,
    createdAt: `${start}T09:00:00.000Z`,
    updatedAt: `${today}T09:00:00.000Z`,
    ...patch,
  });

  return {
    sessions,
    // One sent, one being worked, one shelved: the three states the project
    // pages actually have between them.
    projects: [
      made('The Joker', 'V5', { location: 'Stanage', status: 'sent', sentDate: addDays(today, -40) }),
      made('Brad Pit', 'V6', { location: 'The Roaches' }),
      made('Careless Torque', 'V7', { location: 'Stanage', status: 'shelved' }),
    ],
    metrics,
    injuries: [
      {
        id: 'demo-injury',
        part: 'elbow',
        side: 'right',
        since: addDays(today, -48),
        severity: 'managing',
        status: 'returning',
        note: 'Felt it on a hard lock-off. Easing, slowly.',
      },
    ],
    programId: 'iron_grip',
    startDate: addDays(startOfWeek(today), -7 * 5),
  };
}
