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
import type { BetaNote, Project } from '@/db/projects';
import type { Objective } from './objectives';
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
  /**
   * Two season-scale goals, so the Objectives screen is not bare
   * (PLAN.md M207).
   *
   * One tied to the project being worked and one a trip with the blocks
   * named before it — between them they cover both shapes the page draws:
   * an objective inside the peak runway, where `peak.ts` answers the timing,
   * and one with a `season`, where the dates are derived backwards from the
   * target.
   */
  objectives: Objective[];
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
 * Routes, and the half of the app a boulderer never sees (PLAN.md M277).
 *
 * Measured before this was written: 174 sessions, 473 climbs, **every one of
 * them V-scale**. Not one YDS route, not one `ropeStyle`, not one partner. So
 * the sample climber — whose whole job this file states as *"M12 needs store
 * screenshots of an app that looks lived in"* — left every roped reading in
 * the app returning null:
 *
 * - `describeRopeSplit` (M133), so the **Led and top-roped** card never drew.
 * - `describeRopeContext` (M276), the same card's second paragraph.
 * - `partnerTally` and `unsaid` (M237), so **Who you climbed with** never drew.
 * - `state.sport`, so the route ladder was empty on every screen that offers
 *   the Routes chip beside Boulder.
 *
 * Which is this file's own charge against a flattering demo, one level up:
 * *"every screen in the app exists to say something about those, and a sample
 * climber who never has a bad month shows none of them working."* A climber
 * who never ties in shows none of the roped ones working either.
 *
 * ## Their own stream, or every record after them moves
 *
 * The rule this file states at `prose`: every draw comes off one sequence, so
 * inserting a single `chance()` re-rolls every session, burn and benchmark
 * after it. The same applies here and harder — this adds a session per fortnight
 * — so the roped climber comes off a third stream and lands on a day the
 * bouldering loop does not use. Every V record is byte-identical to before.
 */
const ROUTES = ['5.9', '5.10a', '5.10c', '5.11a', '5.11c', '5.12a'];

/**
 * Who they climb with.
 *
 * One regular and two others, because that is the shape of a real log and it
 * is what gives `partnerTally` something to sort. Invented names on an
 * invented climber: `partners.ts` holds the rule that they never leave on a
 * share card, and `sharedNames.test.ts` checks it.
 */
const BELAYERS = ['Priya', 'Priya', 'Priya', 'Tom', 'Marta'];

/** The route ceiling, trailing the boulder one — they are different skills. */
function routeCeilingAt(week: number): number {
  return Math.min(ROUTES.length - 1, 1 + Math.floor(week / 14));
}

/**
 * A session on the rope.
 *
 * **Warm up on a top-rope, lead the harder ones**, which is how a route
 * session actually goes and is therefore what the sample log should show. It
 * means most of these sessions carry both styles — so the rope card reads
 * *"you have led and top-roped in the same session N times"*, which is the
 * true sentence for this climber rather than the flattering one. Rigging the
 * demo to fire a particular reading would be the brochure this file refuses.
 *
 * Some sessions are all top-rope: the evening where nobody wanted to lead.
 */
function routesFor(rng: Rng, week: number, id: string): Climb[] {
  const top = routeCeilingAt(week);
  const leads = !chance(rng, 0.25);
  const out: Climb[] = [];
  for (let i = Math.max(0, top - 2); i <= top; i += 1) {
    // The warm-ups go on a top-rope and the hard ones get led, when anything
    // is being led at all.
    const style = leads && i > top - 2 ? 'lead' : 'toprope';
    const sent = i < top || chance(rng, 0.4);
    out.push({
      id: `${id}-r${i}`,
      grade: ROUTES[i]!,
      scale: 'YDS',
      count: i === top ? 1 : 2,
      result: sent ? 'send' : 'attempt',
      ropeStyle: style,
      ...(sent && i === top && chance(rng, 0.3) ? { style: 'onsight' as const } : {}),
    });
  }
  return out;
}

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

/**
 * What a climber writes down, and why the sample one now does (PLAN.md M207).
 *
 * The journal stores nothing — it reads notes back off sessions, projects
 * and benchmarks. So a sample climber with no notes leaves that screen
 * empty while Settings promises the button fills *"every screen"*. These
 * are written the way the log is: some sessions, not all, and about the
 * session rather than about the app.
 */
const SESSION_NOTES = [
  'Felt heavy from the first pull. Cut it at four problems and went home.',
  'Best session in weeks. Everything on the 40 felt like it had a handle.',
  'Skin thin by the third go. Taped and kept it to feet-on.',
  'Left early, shoulder grumbling on anything overhead.',
  'Warmed up properly for once and it showed — flashed two at the grade.',
  'Crowded. Spent more time queueing than climbing, which is its own rest.',
  'Legs still wrecked from the weekend. Kept it to technique and traverses.',
  'Tried the sit start again. Still cannot see the sequence past move three.',
  'Good head day. Committed to the dyno first go instead of talking myself out.',
  'Fingers felt flat. Stopped the hangs after two sets rather than push it.',
] as const;

const BETA_NOTES = [
  'Heel hook on the arête, not the toe. Everything follows from that.',
  'The crux is the second clip, not the move above it — get the feet up first.',
  'Right hand to the sloper is a trap. Cross through low instead.',
  'Rest at the rail is real if you drop the hip in. Twenty seconds, no more.',
] as const;

const BENCHMARK_NOTES = [
  'Fresh, after two rest days. Honest number.',
  'Tested tired at the end of a session — read it as a floor, not a ceiling.',
  'Elbow quiet throughout, which is the news.',
] as const;

export function demoClimber(today: string, seed = DEMO_SEED): DemoClimber {
  const rng = createRng(seed);
  /**
   * A second stream, for the prose only (PLAN.md M207).
   *
   * The sample climber is deterministic from its seed — *"one climber, so a
   * screenshot taken today matches one taken in a year"* — and every draw
   * comes off one sequence, so inserting a single `chance()` for a note
   * re-rolls every session, burn and benchmark after it. The first version
   * of this did exactly that and a test about the burns on a project went
   * red for reasons that had nothing to do with burns. Notes come off their
   * own stream, so the climber underneath them is the same one as before.
   */
  const prose = createRng(seed ^ 0x5eed_0f5e);
  /**
   * A third, for the roped sessions (PLAN.md M277), on the same reasoning.
   *
   * These land on a Thursday, which the bouldering loop below never uses —
   * it walks Monday, Wednesday, Friday and rests on Sunday. Off its own
   * stream and onto its own day, so every V record this file produced before
   * M277 is byte-identical after it.
   */
  const ropes = createRng(seed ^ 0x0f0f_b00b);
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
          // Roughly one session in five. A climber who wrote one every time
          // would be a different climber, and the journal would read like a
          // form rather than a log.
          ...(chance(prose, 0.2) ? { notes: pick(prose, SESSION_NOTES) } : {}),
        }),
      );
    }
    /**
     * A route session most fortnights, on the Thursday.
     *
     * Not every week, because this climber is a boulderer who also climbs
     * routes — which is the common shape and the one that puts both ladders
     * on the screen with a real difference between them.
     */
    if (week % 2 === 1 && chance(ropes, 0.85)) {
      const date = addDays(monday, 3);
      if (date <= today) {
        const id = sessionId(date, 0);
        sessions.push(
          newSession(date, 0, {
            ...stamps(date),
            demo: true,
            completed: true,
            rewarded: true,
            planned: false,
            // Malham is the sport crag on the location list; the rest of the
            // year's routes are indoors, which is where routes mostly happen.
            mode: 'indoor',
            rpe: 5 + Math.floor(next(ropes) * 4),
            durationMin: 90 + Math.floor(next(ropes) * 3) * 15,
            warmup: chance(ropes, 0.9),
            climbs: routesFor(ropes, week, id),
            // Roped climbing has a second person in it by definition, which
            // is `partners.ts`'s own opening line — but the *field* is still
            // one a climber forgets, so it is filled most times and not all.
            ...(chance(ropes, 0.75) ? { partners: [pick(ropes, BELAYERS)] } : {}),
            /**
             * Off `ropes`, not `prose`.
             *
             * The first draft reused the prose stream here and the check
             * caught it: two notes moved between bouldering sessions, because
             * every draw after an inserted one comes up different. That is the
             * exact failure this file's header documents at `prose`, and a
             * roped session is an inserted draw.
             */
            ...(chance(ropes, 0.15) ? { notes: pick(ropes, SESSION_NOTES) } : {}),
          }),
        );
      }
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
          {
            metricId: 'max_hang_20mm_7s',
            date,
            value: 20 + ceilingAt(week) * 5 + Math.floor(next(rng) * 5),
            demo: true,
            // The condition a number was taken in is half of what it means,
            // and it is the kind of note the journal exists to surface.
            ...(chance(prose, 0.5) ? { note: pick(prose, BENCHMARK_NOTES) } : {}),
          },
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

  /** Beta accumulates on a project you are actually on, not on a wish. */
  const beta = (count: number, from: number): BetaNote[] =>
    BETA_NOTES.slice(0, count).map((text, i) => ({
      id: `demo-beta-${from}-${i}`,
      date: addDays(today, -from + i * 9),
      text,
    }));

  return {
    sessions,
    // One sent, one being worked, one shelved: the three states the project
    // pages actually have between them.
    projects: [
      made('The Joker', 'V5', {
        location: 'Stanage',
        status: 'sent',
        sentDate: addDays(today, -40),
        beta: beta(1, 60),
      }),
      made('Brad Pit', 'V6', { location: 'The Roaches', beta: beta(3, 50) }),
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
    objectives: objectivesFor(today, start),
    programId: 'iron_grip',
    startDate: addDays(startOfWeek(today), -7 * 5),
  };
}

/**
 * What this climber is training *for*, as opposed to what they are on.
 *
 * Requirements are the skill vocabulary, which is the whole reason
 * `objectives.ts` reuses it — every one of these is measured against the log
 * above rather than declared, so the page shows real progress bars on a
 * climber who really did the sessions behind them. Both are deliberately
 * **unfinished**: an objective with every box ticked draws a screen that
 * never shows a gap, which is the screen this climber exists to photograph
 * least.
 */
function objectivesFor(today: string, start: string): Objective[] {
  const stamp = (date: string) => `${date}T09:00:00.000Z`;
  return [
    {
      id: 'demo-objective-brad-pit',
      name: 'Brad Pit',
      kind: 'boulder',
      status: 'training',
      grade: 'V6',
      scale: 'V',
      location: 'The Roaches',
      // The project they are actually on, so the two screens agree about it.
      projectId: 'demo-brad-pit',
      // No `season`: this one is inside the runway, and `peak.ts` answers
      // the timing question better than a list of blocks would.
      requirements: [
        // Tuned against this climber's own log, not guessed at. M207's
        // battery caught the first version reading **56 of 8** on the
        // pyramid — a requirement already done seven times over is worse on
        // screen than no requirement, and it left two of three ticked.
        // One met and two open is the shape: the base is there, the
        // fingers and the mileage are not.
        {
          id: 'demo-req-pyramid',
          requirement: { kind: 'sends', scale: 'V', grade: 'V5', count: 40 },
          why: 'A grade is a base before it is a ceiling. This part is done.',
        },
        {
          id: 'demo-req-hang',
          requirement: { kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: 52 },
          why: 'The crux is a two-finger drag off the lip. Fingers first.',
        },
        {
          id: 'demo-req-outside',
          requirement: { kind: 'outdoor-days', count: 40 },
          why: 'Grit is a skill. Indoor V6 is not this V6.',
        },
      ],
      notes: 'Sat start still feels impossible. The stand is close.',
      createdAt: stamp(start),
      updatedAt: stamp(addDays(today, -12)),
    },
    {
      id: 'demo-objective-font',
      // Not "Font in October": the target is computed from *today*, so a
      // name with a month in it is wrong for most of the year — which the
      // browser showed as "Font in October … for March 3" (PLAN.md M207).
      name: 'A week in Font',
      kind: 'trip',
      status: 'planning',
      location: 'Fontainebleau',
      // Twenty-eight weeks, which is exactly what the season below adds up
      // to: 12 + 12 + 4. The first version was 24 weeks against 28 of
      // blocks, so the sample climber opened on the card's *warning* — a
      // fixture whose plan does not fit reads as a mistake in the fixture.
      targetDate: addDays(today, 7 * 28),
      // Blocks named before it; every date on the page is derived from this
      // sequence and the target, working backwards (PLAN.md M109).
      season: ['iron_grip', 'peak_performance', 'trip_prep'],
      requirements: [
        {
          id: 'demo-req-volume',
          requirement: { kind: 'outdoor-days', count: 45 },
          why: 'Six days on circuits asks for a body that has been outside.',
        },
        {
          id: 'demo-req-flash',
          requirement: { kind: 'style-sends', style: 'flash', count: 20 },
          why: 'A circuit is flashing, not projecting. Practise the thing.',
        },
        {
          id: 'demo-req-consistent',
          requirement: { kind: 'streak-weeks', weeks: 20 },
          why: 'Nothing here needs a peak. It needs twenty weeks of showing up.',
        },
      ],
      createdAt: stamp(addDays(today, -60)),
      updatedAt: stamp(addDays(today, -30)),
    },
  ];
}
