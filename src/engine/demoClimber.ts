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
import type { Program, ProgramId } from '@/content/types';
import type { AwayPeriod } from './away';
import type { BlockRecord } from './blocks';
import { deriveClimberState } from './derive';
import { measure, type SkillInput, type SkillRequirement } from './skills';
import { CUSTOM_PREFIX } from './customProgram';
import { createRng, next, type Rng } from './ascent/rng';
import { addDays, startOfWeek } from './dates';
import { getProgram } from '@/content/programs';
import type { SessionType } from '@/content/types';
import { layoutsFor, planFromLayout, type WeekPlan } from './scheduler';
import type { Exercise } from '@/content/types';
import type { LoggedExercise, SetOutcome } from '@/db/sessions';
import { plannedDay, prescriptionFor, weekInPhase, type PlannedDay } from './plan';
import { restDayDrill } from './restDrill';
import { concerning, injuryPolicy } from './injury';
import { directFingerWork } from './fingerGap';
import { metricConflict } from './bodyLoad';
import { gradeOrdinal, V_GRADES } from './grades';
import { onTheWall } from './climbing';
import { takenIn, testWeek, testsOn } from './testDays';
import { doseRange } from './exerciseLog';
import { restStart, trainingStart } from './sessionStart';

/** One climber, so a screenshot taken today matches one taken in a year. */
export const DEMO_SEED = 20_260_112;

/**
 * Two years, which is what the Projects page needs (PLAN.md M313).
 *
 * A year was enough for the career page and the year review, and the whole
 * point of this climber is that every screen has something to show. The
 * Projects page never did: its headline wants three sends before it will
 * say anything, because below that a median is an anecdote, and a year of
 * one climber sends one project. A second year is where a project history
 * comes from — four sends, at two grades, with the burns that made them.
 *
 * Everything here that was written against the length of the log reads it
 * as a fraction now rather than counting weeks, so the arc stretches
 * instead of running off the end of the ladder and flattening.
 */
export const DEMO_WEEKS = 104;

/** How far through the log a week is, in the 52 the thresholds were written for. */
function asYearOne(week: number): number {
  return (week * 52) / DEMO_WEEKS;
}

/** The week the session loop skips, marked by `awayFor` (PLAN.md M305). */
const WEEK_OFF = 26;

/**
 * The program the sample climber wrote, and the block they finished
 * (PLAN.md M282).
 *
 * `scripts/layout.mjs` could not reach `/build/:id`, `/build/:id/session/:typeId`
 * or `/finish/:id` at any size, for one reason each time: the sample climber
 * has never written a program and has only ever run one block. Two screens
 * are dark with it — **Your programs** lists nothing, and **Blocks you have
 * run** needs a second row before it draws at all.
 *
 * ## Written here rather than forked from the catalogue
 *
 * `forkProgram(getProgram('base_camp'))` was the first draft and would have
 * been shorter. It also makes this generator depend on the catalogue being
 * loaded — and this file's whole contract is *"Pure: a seed and a date in,
 * records out"*. A small program written out is the cost of keeping that.
 *
 * It is deliberately a *plausible* one and not a showcase: two session types,
 * eight weeks, one phase. What a climber actually writes first is a stripped
 * copy of something that worked, not a masterpiece.
 */
export const DEMO_PROGRAM_ID = `${CUSTOM_PREFIX}demo-own` as ProgramId;

function writtenProgram(): Program {
  return {
    id: DEMO_PROGRAM_ID,
    name: 'My winter block',
    subtitle: 'Written by me',
    kind: 'program',
    stage: 'style',
    discipline: 'boulder',
    gradeRange: { scale: 'V', min: 'V3', max: 'V7', label: 'V3–V7' },
    weeks: 8,
    equipment: ['wall', 'hangboard'],
    intro: {
      pitch: 'Two days on the wall and one on the board, for the months when nothing is dry.',
      rhythm: [],
      graduation: '',
    },
    phases: [
      { id: 'winter', name: 'Winter', weekStart: 1, weekEnd: 8, description: '', goals: [] },
    ],
    sessionTypes: [
      {
        id: 'own_board',
        name: 'Board night',
        icon: 'grid',
        description: 'Hard moves on the board, short and angry.',
        duration: '60-75 min',
      },
      {
        id: 'own_volume',
        name: 'Volume day',
        icon: 'repeat',
        description: 'Everything two grades down, until the feet stop being tidy.',
        duration: '90 min',
      },
    ],
    constraints: [],
    assessments: [],
    nextPrograms: [],
  };
}

/**
 * The block before the one they are running — **their own program**.
 *
 * A climber a year into the app who has run exactly one block is not a
 * climber anybody recognises, and `FinishPage` hides **Blocks you have run**
 * until there are two. Recorded rather than left to `reconstructBlocks`,
 * because a reconstructed row carries no `reason` — and the reason is most of
 * what that screen is for: *"a block left in week six and one run to its last
 * day look identical from the dates alone."*
 *
 * ## Why the written program and not a catalogue one
 *
 * A first draft finished a **Base Camp** block, and a test caught what that
 * costs: the clear unpicks a program by id, so a climber who had their own
 * Base Camp block would have lost it to the demo's. The written program's id
 * belongs to the sample climber and to nothing else, so nothing of theirs can
 * collide with it.
 *
 * It also tells one story instead of two — they wrote a block, ran it, and
 * moved onto Iron Grip — and it puts a custom program's block through
 * `programForRecord`, which nothing in the demo exercised before.
 */
function finishedBlock(ironGripStart: string, program: Program): BlockRecord {
  const startDate = addDays(ironGripStart, -program.weeks * 7);
  return {
    id: `${program.id}#${startDate}`,
    programId: program.id,
    name: program.name,
    startDate,
    weeks: program.weeks,
    endedAt: addDays(ironGripStart, -1),
    reason: 'ran-out',
  };
}

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
  /**
   * The stretches it says it was away (PLAN.md M305).
   *
   * M275 built the record, four engines and two screens read it, and
   * **nothing ever wrote one here** — so every browser check, layout run and
   * screenshot since has been of an app in which the feature does not exist.
   * The sample climber takes a week off in the spring and the log has never
   * said why, which is the exact gap the record was built for.
   */
  away: AwayPeriod[];
  /** The program the demo is mid-way through, and when it started. */
  programId: string;
  startDate: string;
  /**
   * The week it committed to, for the profile to hold (PLAN.md M319).
   *
   * Carried out rather than derived again by the caller: the sessions below
   * are stamped from this plan, so a second derivation is a second answer to
   * one question and the two can drift. They had — the plan `SettingsPage`
   * seeded asked for four days a week the log never used.
   */
  plan: WeekPlan;
  /** The track it runs the block on, for the profile to hold (PLAN.md M324). */
  trackId: string;
  /** One program the climber wrote, for the `programs` store to hold. */
  program: Program;
  /** Blocks finished before the running one, oldest first. */
  blocks: BlockRecord[];
}

/**
 * One project, worked over a stretch of the log (PLAN.md M313).
 *
 * The list of projects and the burns behind them used to be two statements
 * of the same fact: the project said *sent, forty days ago* and this
 * function put a send somewhere in weeks 41 to 43 of 52, and they agreed
 * because both were tuned until they did. They come from this table now —
 * the burns are generated from it and the project records are built from it
 * afterwards, with each `sentDate` read off the session that actually
 * carries the send.
 *
 * Grades against the climber's own ceiling: the V4 lands while `ceilingAt`
 * is still at V5 indoors, the three V5s over the long plateau that is this
 * app's whole subject, and the V6 is the one still open.
 */
interface Campaign {
  id: string;
  name: string;
  grade: string;
  location: string;
  /** The weeks of the log it was worked over, inclusive. */
  from: number;
  to: number;
  /** Whether it went. **When** is the log's to say, not this table's. */
  goes: boolean;
  shelved?: boolean;
}

const CAMPAIGNS: Campaign[] = [
  { id: 'demo-bracken-arete', name: 'Bracken Arête', grade: 'V4', location: 'Stanage', from: 34, to: 46, goes: true },
  { id: 'demo-careless-torque', name: 'Careless Torque', grade: 'V7', location: 'Stanage', from: 48, to: 58, goes: false, shelved: true },
  { id: 'demo-the-long-reach', name: 'The Long Reach', grade: 'V5', location: 'The Roaches', from: 60, to: 71, goes: true },
  { id: 'demo-sheep-track-traverse', name: 'Sheep Track Traverse', grade: 'V5', location: 'Stanage', from: 73, to: 84, goes: true },
  { id: 'demo-the-joker', name: 'The Joker', grade: 'V5', location: 'Stanage', from: 86, to: 95, goes: true },
  { id: 'demo-brad-pit', name: 'Brad Pit', grade: 'V6', location: 'The Roaches', from: 97, to: DEMO_WEEKS - 1, goes: false },
];

/** The one being worked that week, if any. Earliest wins where two overlap. */
function campaignAt(week: number): Campaign | undefined {
  return CAMPAIGNS.find((c) => week >= c.from && week <= c.to);
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
  const campaign = campaignAt(week);
  // A coin toss per day out, which leaves some days for other crags. It
  // was Careless Torque's window that starved it, not this number: nine
  // weeks of it sat before the season this climber started getting
  // outside, so there were six days out to roll against and all six came
  // up tails. `demo.test.ts` holds every campaign to leaving a mark now,
  // rather than leaving it to the dice on whatever seed is current.
  if (campaign === undefined || !chance(rng, 0.45)) return [];
  const progress = Math.min(1, (week - campaign.from) / Math.max(1, campaign.to - campaign.from));
  const high = Math.round(35 + progress * 55 + next(rng) * 8);
  return [
    {
      id: `${id}-a`,
      projectId: campaign.id,
      outcome: high > 80 ? 'fell-high' : high > 55 ? 'fell-crux' : 'fell-mid',
      highPoint: Math.min(95, high),
      // Worked from partway up often enough that the longest link is not
      // always the ground-up high point (PLAN.md M102).
      ...(chance(rng, 0.3) ? { from: Math.round(next(rng) * 30) } : {}),
      count: 1 + Math.floor(next(rng) * 4),
      ...(chance(rng, 0.25) ? { note: pick(rng, ['Skin gone.', 'Wind picked up.', 'Closer.']) } : {}),
    },
  ];
}

/**
 * The last go on a project that went, turned into the send (PLAN.md M313).
 *
 * The send used to be emitted at a week named in the table, and burns are
 * only written on outdoor sessions — so The Joker's send fell in a week
 * that had none, and the project came out of a two-year log still open with
 * its last go forty days ago. The fix is not a better week. The table says
 * *whether* a project went; the log says *when*, and the answer is the last
 * burn on it, which is also what sending something means.
 */
function landTheSends(sessions: Session[]): void {
  for (const campaign of CAMPAIGNS) {
    if (!campaign.goes) continue;
    let last: ProjectAttempt | undefined;
    for (const session of sessions) {
      for (const attempt of session.projectAttempts ?? []) {
        if (attempt.projectId === campaign.id) last = attempt;
      }
    }
    if (last === undefined) continue;
    last.outcome = 'send';
    delete last.highPoint;
    delete last.from;
  }
}

/** The newest reading of a metric on or before a date, or null. */
function latest(entries: readonly MetricEntry[], metricId: string, date: string): number | null {
  let best: MetricEntry | null = null;
  for (const entry of entries) {
    if (entry.metricId !== metricId || entry.date > date) continue;
    if (best === null || entry.date > best.date) best = entry;
  }
  return best === null ? null : best.value;
}

/**
 * A result for one test inside the block (PLAN.md M325), built on the last
 * one so the block report has a line to draw rather than two unrelated dots.
 *
 * The boulder grade is not drawn at all: it is the hardest problem the
 * session it was taken in sent, which is what the number means.
 */
function testResult(
  rng: Rng,
  metricId: string,
  date: string,
  metrics: readonly MetricEntry[],
  session: Session,
  /** The block's first test week, whose max hang is last season's number again. */
  baseline: boolean,
): MetricEntry | null {
  const before = latest(metrics, metricId, date);
  const step = (lo: number, hi: number) => lo + Math.floor(next(rng) * (hi - lo + 1));
  const value = (): number | null => {
    switch (metricId) {
      // Added pounds, off the benchmark eight weeks before; the first phase
      // is the strength one, so the second test is the one that moves.
      case 'max_hang_20mm_7s':
        return (before ?? 25) + (baseline ? step(0, 2) : step(3, 5));
      case 'repeater_weight':
        return before === null ? 10 + step(0, 2) * 2.5 : before + step(1, 2) * 2.5;
      case 'dead_hang':
        return before === null ? 50 + step(0, 10) : before + step(2, 8);
      case 'max_pushups':
        return before === null ? 30 + step(0, 8) : before + step(0, 4);
      // The four the elbow keeps this climber from — modelled anyway, so the
      // reason they are missing is the elbow and not a gap in this switch.
      case 'weighted_pullup_3rm':
        return before === null ? 25 + step(0, 3) * 5 : before + step(0, 1) * 5;
      case 'lock_off_90':
        return before === null ? 8 + step(0, 4) : before + step(0, 2);
      case 'max_pullups':
        return (before ?? 10) + step(0, 2);
      default:
        return null;
    }
  };
  if (metricId === 'core_lever') {
    return { metricId, date, value: 0, display: pick(rng, ['tuck / 12s', 'advanced tuck / 6s']), demo: true };
  }
  if (metricId === 'max_boulder_grade') {
    const sent = (session.climbs ?? []).filter((c) => c.result === 'send').map((c) => gradeOrdinal('V', c.grade));
    if (sent.length === 0) return null;
    const top = Math.max(...sent);
    return { metricId, date, value: top, display: V_GRADES[top]!, demo: true };
  }
  const v = value();
  return v === null ? null : { metricId, date, value: v, demo: true };
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
  return Math.min(ROUTES.length - 1, 1 + Math.floor(asYearOne(week) / 14));
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
  // Read as a fraction of the log, not as a count of weeks (PLAN.md M313).
  // These thresholds were written for a 52-week log, and against a 104-week
  // one they put the climber at the top of the ladder by week 59 and left
  // them there for a year — an arc that reads as a broken fixture rather
  // than as a plateau. Stretched, the shape and both endpoints are what
  // they always were.
  const w = asYearOne(week);
  if (w < 20) return Math.min(3, Math.floor(w / 7));
  if (w < 38) return 3;
  return Math.min(LADDER.length - 1, 3 + Math.floor((w - 38) / 7));
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

/** The catalogue program the sample climber is six weeks into. */
const IRON_GRIP_ID = 'iron_grip' as ProgramId;

/**
 * Iron Grip, through the registry rather than its own module.
 *
 * A direct `import { IRON_GRIP } from '@/content/programs/ironGrip'` reads
 * better and costs a chunk: `perf.test.ts` holds every program body inside
 * the shared catalogue chunk, and naming the module pulled Iron Grip's twelve
 * weeks of protocols out of it and in here. The registry is also what every
 * reader of these sessions uses — `useTips`, `withDeclaredMode`, `fingerGap` —
 * so the generator and they now agree about a program whose weeks the climber
 * has adapted.
 *
 * `!` rather than a fallback: a demo that quietly generated no program link
 * because the id stopped resolving is the failure this milestone is about.
 * Every test that builds a climber holds it, because the generator throws
 * here rather than writing four hundred unlinked sessions.
 */
function ironGrip(): Program {
  return getProgram(IRON_GRIP_ID)!;
}

/**
 * Which way through Iron Grip the sample climber takes (PLAN.md M324).
 *
 * No campus board, for two reasons the log already gives: the climber is
 * carrying an elbow injury — *"Felt it on a hard lock-off. Easing, slowly."*
 * — and Iron Grip's own description of the board track calls it *"the highest
 * injury risk in the program"*. Nobody coaching this climber would put them
 * on it. `demoPlanned.test.ts` holds that the program declares the id.
 */
export const DEMO_TRACK = 'no_board';

/**
 * An evening start, in the climber's own timezone (PLAN.md M324).
 *
 * **Local time, deliberately, and the one place this file is not pure.**
 * Every other stamp here is fixed UTC — `stamps()` writes `T18:00:00.000Z` —
 * because nothing reads those as an hour of the day. `startedAt` is read as
 * exactly that: `coach.ts`'s `lateSessions` takes
 * `new Date(startedAt).getHours()` against `LATE_HOUR`, which is local. A
 * fixed-UTC evening would be a late trainer in Tokyo and an early one in
 * Denver, so the tip would fire by longitude. This builds 17:45 plus up to
 * ninety minutes *where the log is loaded*, which is the same evening
 * everywhere and nowhere near nine o'clock.
 */
function evening(date: string, minutes: number): string {
  const at = new Date(`${date}T17:45:00`);
  at.setMinutes(at.getMinutes() + minutes);
  return at.toISOString();
}

/** When a session that started at `startedAt` and ran `minutes` finished. */
function endOf(startedAt: string, minutes: number): string {
  return new Date(Date.parse(startedAt) + minutes * 60_000).toISOString();
}

/**
 * What a finger-protocol line was done at (PLAN.md M324).
 *
 * The dose is the logger's own — `prescriptionFor` has already applied the
 * week's step and the deload — and the load is a percentage of this climber's
 * own last max hang, read off the prescription's *"60-70% max added weight"*
 * and rounded to the 2.5lb plates a gym has. Up a notch a week inside the
 * phase, the way Iron Grip's Anvil rationale asks — *"Easy? Add 2.5 lbs"* —
 * and a notch **down** on a deload week, because that is what Iron Grip's own
 * deload step says: *"Three sets on the same edge, a step lighter than you
 * have been hanging, and stop while it still feels easy."* The first draft
 * held the load, following `plan.ts`'s generic `DELOAD_STEP` — which is the
 * default for a program that wrote no deload of its own, and Iron Grip did.
 * The logger printed the program's sentence over a load that contradicted it.
 */
function fingerLine(
  rng: Rng,
  exercise: Exercise,
  maxHang: number | null,
  notch: number,
): LoggedExercise {
  const sets = doseRange(exercise.sets)?.max;
  const reps = doseRange(exercise.reps)?.max;
  const hold = doseRange(exercise.hold)?.max;
  const pct = /(\d+)\s*[-–]\s*(\d+)\s*%/.exec(exercise.load ?? '');
  const load =
    pct && maxHang !== null
      ? Math.round(((maxHang * (Number(pct[1]) + Number(pct[2]))) / 200) / 2.5) * 2.5 + notch * 2.5
      : undefined;
  const outcome: SetOutcome = pick(rng, ['solid', 'solid', 'solid', 'hard', 'hard', 'failed'] as const);
  return {
    name: exercise.name,
    ...(sets !== undefined ? { sets } : {}),
    ...(reps !== undefined ? { reps } : {}),
    ...(hold !== undefined ? { hold } : {}),
    ...(load !== undefined ? { load } : {}),
    outcome,
  };
}

/**
 * What the logger would hold for a session of this type on this day
 * (PLAN.md M324).
 *
 * Read through `prescriptionFor`, which is what the logger draws — the track
 * filtered, the week's step applied, the deload lightened — so nothing here
 * decides a dose. The finger protocol is logged with its numbers, since it is
 * the session. The rest is ticked, the way a climber ticks a block of pulls,
 * and dropped now and then, which is what happens to the end of a session
 * that ran long. A menu logs as many lines as it asks to be picked.
 */
function loggedFor(rng: Rng, type: SessionType, day: PlannedDay, maxHang: number | null): LoggedExercise[] {
  if (day.phase === undefined || day.week === null) return [];
  const inPhase = weekInPhase(day.phase, day.week) ?? 1;
  // A notch a week, and on a deload one step below the week before it.
  const notch = Math.max(0, inPhase - (day.isDeload ? 3 : 1));
  const out: LoggedExercise[] = [];
  for (const block of prescriptionFor(type, day.phase, DEMO_TRACK, day.week, day.isDeload)) {
    const lines = block.entry.exercises;
    const protocol = lines.some((e) => directFingerWork(e.name));
    if (!protocol && !chance(rng, 0.8)) continue;
    for (const exercise of lines.slice(0, block.entry.selection?.pick ?? lines.length)) {
      out.push(directFingerWork(exercise.name) ? fingerLine(rng, exercise, maxHang, notch) : { name: exercise.name });
    }
  }
  return out;
}

/**
 * The week the sample climber committed to when they started the block
 * (PLAN.md M319).
 *
 * The program's own recommended layout, which is what a climber picking Iron
 * Grip from the catalogue is offered first — and now the **one** statement of
 * it. `SettingsPage` derived the same thing separately and handed it to
 * `startProgram`, so the plan on the profile and the log underneath it were
 * two answers to one question. They disagreed: the plan asked for Monday,
 * Wednesday, Thursday and Saturday, and the generator wrote Monday, Wednesday
 * and Friday.
 *
 * A function rather than a module constant, so nothing here runs the layout
 * solver at import time.
 */
export function demoPlan(): WeekPlan {
  // Held by `demoPlanned.test.ts`, which names the four days: a program that
  // lost its recommended layout would otherwise seed an empty week in silence.
  return planFromLayout(layoutsFor(ironGrip())[0]!);
}

/** A day the generator writes a session on, and what the plan called it. */
interface TrainingDay {
  date: string;
  /** Undefined outside the block, where nothing placed it. */
  type?: SessionType;
}

/*
 * Whether climbs get logged on a planned session (PLAN.md M319) is
 * `onTheWall`'s answer: off the type's own declared fields rather than its
 * id. Iron Grip's climbing session asks for a grade; its finger day —
 * *"Hangboard protocol plus pulling, pushing, core, and armor work"* — asks
 * for nothing of the sort, and eight boulder problems written onto a
 * hangboard session would be the generator showing the app data the session
 * type never asks for. The same function the test-week planner uses to find
 * the climbing day (PLAN.md M325), so the two cannot disagree about which
 * one it is.
 */

/**
 * The days inside the running block, taken from the plan (PLAN.md M319).
 *
 * Weekday order, so the sessions come out dated forwards like every other
 * week — `landTheSends` reads the last burn on a project as its send, and a
 * make-up day appended out of order would move that date backwards.
 */
function planDays(rng: Rng, plan: WeekPlan, program: Program, monday: string): TrainingDay[] {
  const out: TrainingDay[] = [];
  let skipped: SessionType | undefined;
  for (const day of [0, 1, 2, 3, 4, 5, 6] as const) {
    const typeId = plan[day];
    if (typeId === undefined) continue;
    const type = program.sessionTypes.find((t) => t.id === typeId);
    if (type === undefined) continue;
    if (type.isRest === true) continue;
    // Missed now and then, because six weeks run to the letter is nobody's
    // block and an adherence card reading 100% is a card nobody looks at.
    if (chance(rng, 0.85)) {
      // Monday is day 1, and the week's Sunday is the day before `monday`.
      out.push({ date: addDays(monday, day - 1), type });
      continue;
    }
    // **Monday's, and only Monday's** (PLAN.md M321). The make-up below lands
    // on the Tuesday, so making up anything later in the week dates the
    // replacement before the session it replaces. Harmless-looking, and M321
    // caught what it cost: the Monday finger day plus a Tuesday standing in
    // for a Thursday put two hangboard sessions twenty-four hours apart in
    // the sample climber's log, which is the one thing the app's own
    // forty-eight hour rule exists to tell a climber not to do.
    if (day === 1) skipped = type;
  }
  // Made up the next day, half the time. `blockAdherence` scores the week and
  // not the day — *"a climber who moves Tuesday's session to Wednesday did the
  // work"* — and a fixture whose logged days all sit on the plan's days would
  // never have put that rule through a browser. Tuesday because the plan
  // leaves it free and the route night below takes the Friday.
  if (skipped !== undefined && chance(rng, 0.5)) out.push({ date: addDays(monday, 1), type: skipped });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Monday, Wednesday, Friday — the shape before the block, placed by nobody. */
function freeDays(rng: Rng, monday: string): TrainingDay[] {
  const days = chance(rng, 0.2) ? 2 : 3;
  const out: TrainingDay[] = [];
  for (let d = 0; d < days; d += 1) out.push({ date: addDays(monday, d * 2) });
  return out;
}

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
   * These land on a day the bouldering loop below does not use — a Thursday
   * before the block, a Friday inside it (PLAN.md M319), where the plan puts
   * a finger session on the Thursday. Off its own stream and onto its own
   * day, so every V record this file produced before M277 is byte-identical
   * after it.
   */
  const ropes = createRng(seed ^ 0x0f0f_b00b);
  /**
   * A fourth, for how the rock was (PLAN.md M289), on the same reasoning.
   *
   * Drawn only on the outdoor days, and off its own sequence, so every
   * record this file produced before M289 — climbs, burns, benchmarks,
   * notes — is byte-identical after it. Checked rather than assumed, which
   * is what M277 had to do the hard way.
   *
   * Not rigged to fire the coach's run-of-bad-days tip. A sample climber
   * whose log was arranged to trigger a rule is a demo of the rule and not
   * of a climber; `coach.test.ts` holds the rule, and this holds a log that
   * looks like somebody's.
   */
  const weather = createRng(seed ^ 0xc01d_d00d);
  const start = addDays(startOfWeek(today), -(DEMO_WEEKS - 1) * 7);
  /** Named once, because the finished block below is dated backwards off it. */
  const ironGripStart = addDays(startOfWeek(today), -7 * 5);
  const written = writtenProgram();
  /** The block they are six weeks into, and the week they committed to. */
  const running = ironGrip();
  const plan = demoPlan();
  /**
   * The elbow, hoisted out of the return (PLAN.md M324).
   *
   * The rest-day drill has to avoid it, and it is the reason for the track
   * above. Read through `injuryPolicy` and `concerning`, which is what
   * `PreSession` hands `restDayDrill`, so the demo is offered the drill a
   * real climber with this injury would be.
   */
  const injury: Injury = {
    id: 'demo-injury',
    part: 'elbow',
    side: 'right',
    since: addDays(today, -48),
    severity: 'managing',
    status: 'returning',
    note: 'Felt it on a hard lock-off. Easing, slowly.',
  };
  const hurt = concerning(injuryPolicy([injury]));
  /**
   * A fifth stream, for what the logger wrote (PLAN.md M324), on the reasoning
   * the four above give: exercises, drills and start times are drawn here and
   * nowhere else, so every climb, burn, note and benchmark this file produced
   * before M324 comes out of the same draws after it.
   */
  const logbook = createRng(seed ^ 0x106b_00c5);
  /**
   * A sixth, for the tests taken inside the block (PLAN.md M325), on the same
   * reasoning again: every record above comes out of the same draws after it.
   */
  const bench = createRng(seed ^ 0x7e57_da75);
  /** The plan's day, read the way the logger reads it. */
  const planOn = (date: string) => plannedDay(running, ironGripStart, plan, date);
  /** The drill `PreSession` offers on a day the plan leaves free. */
  const restDrillOn = (date: string) => {
    const day = planOn(date);
    return day.isRest && day.over !== true ? restDayDrill(date, hurt) : null;
  };
  /** Inside the running block, which is where anything was stamped by a plan. */
  const underPlan = (date: string) => date >= ironGripStart;

  const sessions: Session[] = [];
  const metrics: MetricEntry[] = [];

  for (let week = 0; week < DEMO_WEEKS; week += 1) {
    const monday = addDays(start, week * 7 + 1);
    // One week off in the spring, because a log with no gap in it has never
    // belonged to anyone. `WEEK_OFF` is the same number, and `awayFor` below
    // marks the days this skips — two copies of one week is one copy plus a
    // thing to forget.
    if (week === WEEK_OFF) continue;

    /**
     * Whether this week falls inside the block the climber is running.
     *
     * `ironGripStart` is a Sunday, so a week is in it once its Monday is
     * past that. Six of the hundred and four — before them this climber was
     * training on their own, and a session from then carries no program link
     * because nothing placed it.
     */
    const inBlock = monday > ironGripStart;
    /**
     * Which days this week trained on, and what the plan called each one
     * (PLAN.md M319).
     *
     * Every bouldering session this generator wrote used to claim
     * `planned: true` and carry no `sessionTypeId`, which is a sentence with
     * no subject. Measured on the sample climber: `blockAdherence` read it as
     * nought of twenty-one placed sessions done against seventeen unplanned
     * ones, `planVsLog` found one thing to say instead of three,
     * `deriveClimberState.sessionsByType` came back `{}`, and `loadRelief`
     * had no per-type median to take and so withheld its answer whole. Four
     * engines on their empty-input path, on the one fixture every browser
     * check, layout run and screenshot uses.
     *
     * `fingerGap` is a fifth reader and this does **not** reach it: it tests
     * the session type's *name* against a pattern that has `hangboard` and
     * `fingerboard` in it but not the bare word, so Iron Grip's *"Finger
     * Protocol + Engine"* misses. Measured, not assumed, and left for its own
     * milestone — widening that pattern reaches every drill `bodyLoad` scans.
     */
    const training = inBlock ? planDays(rng, plan, running, monday) : freeDays(rng, monday);
    for (const { date, type } of training) {
      if (date > today) continue;
      const id = sessionId(date, 0);
      /** A hangboard day logs no climbs; see `onTheWall`. */
      const wall = type === undefined || onTheWall(type);
      // Project season in the back half of the year, which is both more
      // plausible and what puts enough burns on the project pages for them
      // to draw anything.
      // Week 30 of the log, not the same fraction of it (PLAN.md M313).
      // This one is an event in the climber's history — the season they
      // started getting outside — rather than a proportion of how long they
      // have been logging, and stretching it put every project campaign in
      // the sparse half: Careless Torque came out shelved with no burns on
      // it at all, which is a card nobody can read.
      const outdoor = wall && chance(rng, week >= 30 ? 0.4 : 0.12);
      // Drawn here rather than inline, in the same order the literal drew
      // them, so the stream stays where it was.
      const rpe = 5 + Math.floor(next(rng) * 4);
      const durationMin = 60 + Math.floor(next(rng) * 4) * 15;
      /**
       * Everything a plan stamps, through the function that stamps it for a
       * real climber (PLAN.md M324). Outside the block nothing placed these
       * sessions and none of it applies.
       */
      const day = underPlan(date) ? planOn(date) : undefined;
      /**
       * No clock on today's session (PLAN.md M324).
       *
       * This file is a seed and a date, and it cannot know the time of day.
       * Loaded at midnight, an evening start stamped on today is a session
       * that began tonight and has already ended — measured in the browser at
       * 00:05, where the logger said *"1 h on the clock"* about a session
       * eighteen hours away. Today's is logged the way a session entered
       * after the fact is: with no clock. Drawn anyway, so which day is today
       * does not move every draw after it.
       */
      const minutes = day ? Math.floor(next(logbook) * 90) : 0;
      const started = day && date < today ? evening(date, minutes) : undefined;
      const stamped = day
        ? trainingStart({
            startedAt: started,
            programId: running.id,
            sessionTypeId: type?.id,
            trackId: DEMO_TRACK,
            day,
            restDrill: restDrillOn(date),
          })
        : { planned: false };
      /**
       * A deload week is lighter, which is the only thing that makes it one.
       *
       * The draws above do not know what week it is, so a deload week came
       * out as heavy as any other — measured at M319, where `planVsLog` put
       * the sample climber's week four at 1.34× the weeks before it. The
       * program's own step says a set comes off and the climber stops while
       * it still feels easy, so the effort does and the length does.
       */
      const light = day?.isDeload === true;
      const effort = light ? Math.max(4, rpe - 2) : rpe;
      const length = light ? Math.max(45, Math.round((durationMin * 0.7) / 15) * 15) : durationMin;
      const maxHang = latest(metrics, 'max_hang_20mm_7s', date);
      const lines = day && type ? loggedFor(logbook, type, day, maxHang) : [];
      // The plan's drill is usually done; the rest-day one a free day is
      // offered is a suggestion, and mostly stays one.
      const drillDone =
        stamped.drillId === undefined ? undefined : chance(logbook, day?.drill ? 0.75 : 0.3);
      sessions.push(
        newSession(date, 0, {
          ...stamps(date),
          demo: true,
          completed: true,
          rewarded: true,
          ...stamped,
          mode: outdoor ? 'outdoor' : 'indoor',
          rpe: effort,
          durationMin: length,
          ...(started ? { endedAt: endOf(started, length) } : {}),
          ...(lines.length > 0 ? { exercises: lines } : {}),
          ...(drillDone !== undefined ? { drillDone } : {}),
          warmup: chance(rng, 0.85),
          ...(wall ? { climbs: climbsFor(rng, week, id) } : {}),
          ...(outdoor ? { projectAttempts: burnsFor(rng, week, id) } : {}),
          ...(outdoor
            ? {
                fields: {
                  location: pick(rng, ['Stanage', 'The Roaches', 'Malham']),
                  conditions: pick(weather, ['Good', 'Okay', 'Okay', 'Greasy']),
                },
              }
            : {}),
          ...(chance(rng, 0.3)
            ? { checkIn: { fingers: pick(rng, ['good', 'good', 'tender'] as const), sleep: pick(rng, ['good', 'good', 'short'] as const) } }
            : {}),
          // Roughly one session in five. A climber who wrote one every time
          // would be a different climber, and the journal would read like a
          // form rather than a log.
          ...(chance(prose, 0.2) ? { notes: pick(prose, SESSION_NOTES) } : {}),
        }),
      );
      /**
       * The tests the plan gives this session, in a test week (PLAN.md M325).
       *
       * Taken the way the day's nudge says to take them, which includes the
       * part that is not the planner's: anything that loads the elbow waits.
       * `TestSafety` says so beside each one, the climber told the app about
       * the elbow, and a sample climber who max-tested a lock-off on the
       * injury a lock-off gave them would be the fixture ignoring the app.
       */
      if (day?.test !== undefined && type !== undefined) {
        const battery = testWeek(running, ironGripStart, plan, date);
        /**
         * And what an earlier session of the same kind was given and did not
         * get, because it was missed. The nudge lists those as still to take;
         * the same session later in the week is where a climber takes them —
         * which is also what a Tuesday make-up for a missed Monday is.
         */
        const taken = battery ? takenIn(battery, metrics) : new Set<string>();
        const carried = (battery?.days ?? [])
          .filter((d) => d.date < date && d.sessionType.id === type.id)
          .flatMap((d) => d.metrics)
          .filter((m) => !taken.has(m.id));
        for (const metric of [...testsOn(battery, date), ...carried]) {
          if (metricConflict(metric, hurt) !== null) continue;
          const entry = testResult(bench, metric.id, date, metrics, sessions.at(-1)!, day.test === 'baseline');
          if (entry) metrics.push(entry);
        }
      }
    }
    /**
     * A route session most fortnights, on the Thursday.
     *
     * Not every week, because this climber is a boulderer who also climbs
     * routes — which is the common shape and the one that puts both ladders
     * on the screen with a real difference between them.
     */
    if (week % 2 === 1 && chance(ropes, 0.85)) {
      // Friday inside the block, because the plan puts a finger day on the
      // Thursday there and two sessions cannot share a slot on one date
      // (PLAN.md M319). Which also makes it the honest thing it already was:
      // a night the program did not ask for, and the only sessions the
      // adherence card has to count as unplanned.
      const date = addDays(monday, inBlock ? 4 : 3);
      if (date <= today) {
        const id = sessionId(date, 0);
        const rpe = 5 + Math.floor(next(ropes) * 4);
        const durationMin = 90 + Math.floor(next(ropes) * 3) * 15;
        /**
         * Started from the same button as any other session (PLAN.md M324).
         *
         * Which is why it carries the program and the track with no type
         * under them: `PreSession` stamps the running block on everything
         * started while one is running, and a free Friday offers the rest-day
         * drill as a suggestion. Unplanned, because the plan put nothing here.
         */
        const minutes = underPlan(date) ? Math.floor(next(logbook) * 90) : 0;
        // No clock on today's, for the reason the training sessions give.
        const started = underPlan(date) && date < today ? evening(date, minutes) : undefined;
        const stamped = underPlan(date)
          ? trainingStart({
              startedAt: started,
              programId: running.id,
              trackId: DEMO_TRACK,
              day: planOn(date),
              restDrill: restDrillOn(date),
            })
          : { planned: false };
        const drillDone = stamped.drillId === undefined ? undefined : chance(logbook, 0.3);
        sessions.push(
          newSession(date, 0, {
            ...stamps(date),
            demo: true,
            completed: true,
            rewarded: true,
            ...stamped,
            // Malham is the sport crag on the location list; the rest of the
            // year's routes are indoors, which is where routes mostly happen.
            mode: 'indoor',
            rpe,
            durationMin,
            ...(started ? { endedAt: endOf(started, durationMin) } : {}),
            ...(drillDone !== undefined ? { drillDone } : {}),
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
        /**
         * Logged as a rest day, through the rest button (PLAN.md M324): the
         * block and the track, and the drill the day offers. No clock — a rest
         * day is ticked off after the fact more often than it is started — and
         * the checklist below replaces the empty one `restStart` begins with,
         * because it is what got ticked.
         */
        const stamped = underPlan(date)
          ? restStart({ programId: running.id, trackId: DEMO_TRACK, restDrill: restDrillOn(date) })
          : {};
        const drillDone = stamped.drillId === undefined ? undefined : chance(logbook, 0.3);
        sessions.push(
          newSession(date, 0, {
            ...stamps(date),
            demo: true,
            completed: true,
            rewarded: true,
            ...stamped,
            ...(drillDone !== undefined ? { drillDone } : {}),
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
          { metricId: 'max_pullups', date, value: 8 + Math.floor(asYearOne(week) / 12) + Math.floor(next(rng) * 3), demo: true },
        );
      }
    }
  }

  const made = (name: string, grade: string, patch: Partial<Project> = {}): Project => ({
    id: `demo-${name.toLowerCase().replace(/\W+/g, '-')}`,
    // `patch.id` below overrides this: the campaign owns the id, because
    // an objective and two tests name `demo-brad-pit` directly.
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

  /**
   * The day a send actually got logged, read off the log (PLAN.md M313).
   *
   * Not a date written beside the project and tuned until it lined up with
   * the burns: the send burn is in a session, the session has a date, and
   * that date is the one the record carries. A campaign whose send never
   * reached an outdoor session would come back undated here rather than
   * claiming a day nothing happened on, which `demo.test.ts` holds.
   */
  const sendDate = (id: string): string | undefined =>
    sessions.find((s) => (s.projectAttempts ?? []).some((a) => a.projectId === id && a.outcome === 'send'))?.date;
  landTheSends(sessions);
  // Beta goes on the one most recently sent rather than on an id written
  // here: "the project they got up last" is the rule, and a list of ids is
  // a second place to say which one that is (PLAN.md M313).
  const latestSend = [...CAMPAIGNS]
    .filter((c) => c.goes)
    .sort((a, b) => b.to - a.to)[0]?.id;

  return {
    sessions,
    // Sent, being worked, and shelved: the three states the project pages
    // have between them, and four of the first so the page's headline has
    // the three sends it needs before a median means anything (M313).
    projects: CAMPAIGNS.map((c) => {
      const sent = c.goes ? sendDate(c.id) : undefined;
      return made(c.name, c.grade, {
        id: c.id,
        location: c.location,
        // Created the week it was first touched, not the day the log opens.
        createdAt: `${addDays(start, c.from * 7 + 1)}T09:00:00.000Z`,
        ...(sent !== undefined
          ? { status: 'sent' as const, sentDate: sent }
          : c.shelved
            ? { status: 'shelved' as const }
            : { status: 'active' as const }),
        // Beta accumulates on the one being worked now, and a line on the
        // one most recently sent; a shelved project collected none.
        ...(c.id === latestSend ? { beta: beta(1, 60) } : {}),
        ...(sent === undefined && !c.shelved ? { beta: beta(3, 50) } : {}),
      });
    }),
    metrics,
    injuries: [injury],
    objectives: objectivesFor(today, start, sessions, metrics),
    away: awayFor(start),
    programId: running.id,
    startDate: ironGripStart,
    plan,
    trackId: DEMO_TRACK,
    program: written,
    blocks: [finishedBlock(ironGripStart, written)],
  };
}

/**
 * The week off, said out loud (PLAN.md M305).
 *
 * One period, not a handful: the loop above skips exactly one week, and a
 * marker over days with sessions in them would be a statement about silence
 * made over a stretch that is not silent. `life` rather than `rest`, for the
 * reason `away.ts` gives about the difference — the climber did not plan
 * this and telling the app they recovered would be the wrong fact.
 *
 * Dated off `start` like everything else here, and off no RNG stream at all,
 * so every record this file produced before M305 is byte-identical after it.
 */
function awayFor(start: string): AwayPeriod[] {
  const from = addDays(start, WEEK_OFF * 7 + 1);
  return [
    {
      id: 'demo-away-spring',
      from,
      // Monday to Sunday: the loop's week, whichever of its days it would
      // have used.
      to: addDays(from, 6),
      kind: 'life',
      note: 'Moving house',
      // From the day, not the clock, for the reason the session stamps are.
      updatedAt: `${from}T09:00:00.000Z`,
    },
  ];
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
/**
 * Targets read off the climber's own log (PLAN.md M313).
 *
 * These were three numbers typed in and tuned until the Brad Pit objective
 * read *one met, two open* — the shape the page needs, because a screen
 * with no gap on it is the screenshot this climber is worst at. Tuned
 * against a 52-week log, and the log is 104 now: forty outdoor days was a
 * stretch over one year and is behind this climber over two, so the
 * objective came out two-thirds done.
 *
 * `under` gives a round number this climber has already passed and `past`
 * one they have not, so the shape holds at any length of log. Round,
 * because *"56 of 50"* is a target met and *"56 of 8"* is a broken fixture,
 * which is the fault M207's battery caught in the first version of these.
 */
const under = (now: number, step: number): number => Math.max(step, Math.floor(now / step) * step);
const past = (now: number, step: number): number => (Math.floor(now / step) + 1) * step;

function objectivesFor(today: string, start: string, sessions: Session[], metrics: MetricEntry[]): Objective[] {
  const stamp = (date: string) => `${date}T09:00:00.000Z`;
  /**
   * Where this climber stands, counted by the thing that will count it
   * again on screen.
   *
   * Not a second tally written here: `measure` is what the objective card
   * runs, and a requirement pitched against any other reading of the log is
   * a target that is met in one place and open in another.
   */
  const input: SkillInput = { state: deriveClimberState(sessions), metrics, projects: [] };
  const standing = (requirement: SkillRequirement): number => measure(requirement, input).current;
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
          requirement: {
            kind: 'sends',
            scale: 'V',
            grade: 'V5',
            count: under(standing({ kind: 'sends', scale: 'V', grade: 'V5', count: 0 }), 10),
          },
          why: 'A grade is a base before it is a ceiling. This part is done.',
        },
        {
          id: 'demo-req-hang',
          requirement: {
            kind: 'metric',
            metricId: 'max_hang_20mm_7s',
            atLeast: past(standing({ kind: 'metric', metricId: 'max_hang_20mm_7s', atLeast: 0 }), 5),
          },
          why: 'The crux is a two-finger drag off the lip. Fingers first.',
        },
        {
          id: 'demo-req-outside',
          requirement: { kind: 'outdoor-days', count: past(standing({ kind: 'outdoor-days', count: 0 }), 10) },
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
          requirement: { kind: 'outdoor-days', count: past(standing({ kind: 'outdoor-days', count: 0 }), 10) + 10 },
          why: 'Six days on circuits asks for a body that has been outside.',
        },
        {
          id: 'demo-req-flash',
          requirement: {
            kind: 'style-sends',
            style: 'flash',
            count: past(standing({ kind: 'style-sends', style: 'flash', count: 0 }), 10),
          },
          why: 'A circuit is flashing, not projecting. Practise the thing.',
        },
        {
          id: 'demo-req-consistent',
          requirement: { kind: 'streak-weeks', weeks: past(standing({ kind: 'streak-weeks', weeks: 0 }), 5) },
          why: 'Nothing here needs a peak. It needs twenty weeks of showing up.',
        },
      ],
      createdAt: stamp(addDays(today, -60)),
      updatedAt: stamp(addDays(today, -30)),
    },
  ];
}
