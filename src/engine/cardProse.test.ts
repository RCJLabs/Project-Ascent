import { describe, expect, it } from 'vitest';
import type { RestChecklist, Session } from '@/db/sessions';
import { angles, describeAngles } from './angles';
import { compareBlocks, describeBlocks } from './blockCompare';
import { checkInHistory, describeCheckIns } from './checkIns';
import { buildTips } from './coach';
import { buildHeatGrid, describeConsistency } from './consistency';
import { conversionTrend, describeConversion } from './conversion';
import { addDays } from './dates';
import { deriveClimberState } from './derive';
import { describeLadders, ladders } from './ladders';
import { describeTrend, loadTrend } from './loadTrend';
import { diagnose } from './plateau';
import { projectGrade, pyramid, weeklyProgression } from './progress';
import { describePyramid, readPyramid } from './pyramidShape';
import { describeRestHabits, restHabits } from './restHabits';
import { describeRopeSplit, ropeSplit } from './ropeStyle';
import { describeTissue, tissueLoad } from './tissueLoad';
import { describeYear, reviewYear } from './yearReview';

/**
 * The sentences on Progress, held to the numbers they sit beside
 * (PLAN.md M248).
 *
 * M244, M245, M246 and M247 were all one defect wearing four coats: a
 * describer producing prose that disagrees with its own input. The engine
 * tests under each of them prove the maths; nothing proved the sentence.
 * Every one of the four shipped with the whole suite green.
 *
 * **This catches the mechanical half and not the semantic half, and the
 * distinction is worth stating rather than blurring.** A `NaN` count, a
 * count above the requirement it is counted against, a rate of zero beside
 * a non-zero tally, a plural disagreeing with its number — those are
 * properties of the string and are checked here for every card against
 * every shape of log. "Now 0.00" being three weeks stale and "one hard
 * session moves it" being arithmetically false are not: both sentences are
 * well-formed, and only a test that knows what the card means can catch
 * them. Those live in `staleReadings.test.ts` and `effortGap.test.ts`,
 * where they belong.
 *
 * What this stops is the next one of the mechanical kind, on a card nobody
 * is looking at, against a log shape nobody thought of.
 */

const TO = '2026-09-17';
const CHECKLIST: RestChecklist = { hydration: true, mobility: true, zone1: false, sleep: true };

const at = (daysAgo: number, patch: Partial<Session> = {}): Session =>
  ({
    id: `${addDays(TO, -daysAgo)}#${daysAgo}`,
    date: addDays(TO, -daysAgo),
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 6,
    durationMin: 60,
    climbs: [{ id: `c${daysAgo}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    createdAt: `${addDays(TO, -daysAgo)}T18:00:00.000Z`,
    updatedAt: `${addDays(TO, -daysAgo)}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const restDay = (daysAgo: number): Session =>
  at(daysAgo, { climbs: [], rpe: undefined, restChecklist: CHECKLIST });

/** A check-in the app knows, and one carrying a word from another version. */
const ANSWERED = { fingers: 'tender', sleep: 'short' } as const;
const UNREADABLE = { fingers: 'good', sleep: 'poor' } as unknown as Session['checkIn'];

/**
 * Shapes of log, not a random walk.
 *
 * A generator would spend most of its runs on the ordinary climber every
 * card was written for. These are the edges the four defects were found at:
 * a log with nothing in it, one with a single record, one that stops, one
 * that is mostly rest, one where nothing is ever sent, and the ordinary one
 * to prove the checks are not passing by finding nothing to read.
 */
const SHAPES: Record<string, Session[]> = {
  empty: [],
  one: [at(2)],
  'first week': [at(1), at(3), at(5)],
  ordinary: Array.from({ length: 34 }, (_, i) =>
    at(2 + i * 2, { rpe: 5 + (i % 5), checkIn: i % 3 === 0 ? ANSWERED : undefined }),
  ),
  // A restored backup carrying answers this version has never had, which is
  // the M244 path — and the shape that turns a count into `NaN`.
  'answers from another version': Array.from({ length: 20 }, (_, i) =>
    at(2 + i * 3, { rpe: 8, checkIn: i % 4 === 0 ? UNREADABLE : ANSWERED }),
  ),
  stopped: Array.from({ length: 24 }, (_, i) => at(35 + i * 3)),
  'mostly rest': [
    ...Array.from({ length: 20 }, (_, i) => restDay(2 + i * 3)),
    at(4),
    at(10),
  ],
  'nothing sent': Array.from({ length: 20 }, (_, i) =>
    at(2 + i * 3, { climbs: [{ id: `a${i}`, grade: 'V5', scale: 'V', count: 5, result: 'attempt' }] }),
  ),
  'nothing scored': Array.from({ length: 20 }, (_, i) =>
    at(2 + i * 3, { rpe: undefined, durationMin: undefined }),
  ),
  'same day twice': [at(2), at(2, { id: 'dup' }), at(4)],
  'one long year': Array.from({ length: 40 }, (_, i) => at(2 + i * 9)),
};

/** Every sentence a card on Progress can print, for one log. */
function proseFor(sessions: Session[]): { card: string; text: string }[] {
  const state = deriveClimberState(sessions, { today: TO });
  const rows = pyramid(state.boulder, 'V');
  const out: { card: string; text: string | null }[] = [
    { card: 'Consistency', text: describeConsistency(buildHeatGrid({ sessions, to: TO })) },
    { card: 'Where the ratio has been', text: describeTrend(loadTrend({ sessions, to: TO })) },
    { card: 'Against the four weeks before', text: describeBlocks(compareBlocks({ sessions, to: TO })) },
    { card: 'How you were feeling', text: describeCheckIns(checkInHistory({ sessions, to: TO })) },
    { card: 'What you have been loading', text: describeTissue(tissueLoad({ sessions, to: TO })) },
    { card: 'How you rest', text: describeRestHabits(restHabits({ sessions, to: TO })) },
    { card: 'Sends per try', text: describeConversion(conversionTrend({ sessions, scale: 'V', to: TO })) },
    { card: 'Angles', text: describeAngles(angles(sessions, 'V')) },
    { card: 'Rope styles', text: describeRopeSplit(ropeSplit(sessions)) },
    { card: 'Ladders', text: describeLadders(ladders(sessions, 'V')) },
    { card: 'Grade pyramid', text: describePyramid(readPyramid(rows, state.boulder.totalSends), (g) => g) },
    { card: 'Grade progression', text: projectGrade(weeklyProgression(sessions, 'V', 12, TO), 'V').summary },
    { card: 'Training state', text: diagnose({ state, sessions, today: TO }).explanation },
    ...diagnose({ state, sessions, today: TO }).evidence.map((e) => ({
      card: `Training state · ${e.label}`,
      text: e.value,
    })),
    ...describeYear(reviewYear({ sessions, records: state.personalRecords, today: TO }, 2026)).map((line, i) => ({
      card: `Year in review [${i}]`,
      text: line,
    })),
  ];
  return out.filter((row): row is { card: string; text: string } => typeof row.text === 'string');
}

/**
 * The coach, which is the same prose problem with a wider mouth
 * (PLAN.md M249).
 *
 * `buildTips` is the app's voice on Home — a headline and a body per
 * observation, chosen from thirty-odd rules against the same log every card
 * on Progress reads. It had no corpus at all.
 */
function voiceFor(sessions: Session[]): { card: string; text: string }[] {
  const state = deriveClimberState(sessions, { today: TO });
  return buildTips({ state, sessions }).flatMap((tip) => [
    { card: `coach ${tip.id} · headline`, text: tip.headline },
    { card: `coach ${tip.id} · body`, text: tip.body },
  ]);
}

const EVERY = Object.entries(SHAPES).flatMap(([shape, sessions]) =>
  [...proseFor(sessions), ...voiceFor(sessions)].map((row) => ({ shape, ...row })),
);

/**
 * The structures the sentences are read off, for the faults that never reach
 * a sentence.
 *
 * M244 is the case: an out-of-vocabulary answer made `fingers[feel] += 1`
 * into `NaN`, but it landed under a **new key** — `sleep.poor` — and every
 * key `describeCheckIns` actually reads stayed correct. The prose was clean
 * and the card was wrong. So the numbers are walked as well as read: a
 * `NaN`, an `Infinity` or a tally that has grown a column is a fault whether
 * or not a sentence happens to print it.
 */
function structuresFor(sessions: Session[]): Record<string, unknown> {
  const state = deriveClimberState(sessions, { today: TO });
  return {
    'check-in history': checkInHistory({ sessions, to: TO }),
    consistency: buildHeatGrid({ sessions, to: TO }),
    'load trend': loadTrend({ sessions, to: TO }),
    'block compare': compareBlocks({ sessions, to: TO }),
    'tissue load': tissueLoad({ sessions, to: TO }),
    'rest habits': restHabits({ sessions, to: TO }),
    conversion: conversionTrend({ sessions, scale: 'V', to: TO }),
    'climber state': state,
    'year review': reviewYear({ sessions, records: state.personalRecords, today: TO }, 2026),
  };
}

/** Every number inside a value, with the path it was found at. */
function numbersIn(value: unknown, path = ''): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => numbersIn(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, path ? `${path}.${k}` : k));
  }
  return [];
}

const where = (row: { shape: string; card: string; text: string }) =>
  `${row.card} — ${row.shape}: "${row.text}"`;

/**
 * A check, and a sentence it must reject.
 *
 * The example is not decoration. M247's zero-rate defect is fixed, so
 * nothing in the corpus trips that rule any more and the assertion would
 * have sat there passing over an empty loop — a probe that cannot find a
 * known-present instance is not a probe (PLAN.md M195). Every check here
 * proves it still fires before it is trusted to say the corpus is clean.
 */
interface Check {
  name: string;
  /** The problem with this sentence, or null. */
  fault: (text: string) => string | null;
  /** A sentence the check must reject. */
  example: string;
}

const NOUNS =
  'sessions|session|days|day|weeks|week|months|month|years|year|climbs|climb|sends|send|attempts|attempt|tries|try|entries|entry|times|time';

const CHECKS: Check[] = [
  {
    // M244: `fingers[feel] += 1` on a word the record does not have.
    name: 'no value that failed to become a number',
    example: 'Fingers came back sore on NaN sessions of the 29.',
    fault: (text) => {
      const hit = text.match(/\bNaN\b|\bundefined\b|\bnull\b|\bInfinity\b|\[object Object\]|Invalid Date/);
      return hit ? `rendered ${hit[0]}` : null;
    },
  },
  {
    // M246: "Sessions logged | 22 of 8".
    name: 'no count past the requirement it is counted against',
    example: '22 of 8',
    fault: (text) => {
      for (const [whole, have, want] of text.matchAll(/(\d+) of (\d+)\b/g)) {
        if (Number(have) > Number(want)) return `"${whole}" counts past its own requirement`;
      }
      return null;
    },
  },
  {
    // M247: "1 day logged over 53 weeks · 0.0 a week".
    name: 'no rate of zero for a climber who logged something',
    example: '1 day logged over 53 weeks · 0.0 a week · longest gap 2 days.',
    fault: (text) => {
      if (!/\b0\.0 (a|per) (week|session|day)\b/.test(text)) return null;
      const counted = text.match(new RegExp(String.raw`\b[1-9]\d* (${NOUNS})\b`));
      return counted ? `a zero rate beside "${counted[0]}"` : null;
    },
  },
  {
    // M80's rule, which three headlines broke at once.
    name: 'agreement about one of anything',
    example: 'You went over it 1 times, across 2 session.',
    fault: (text) => {
      const plural = (noun: string) => /s$/.test(noun) || noun === 'tries' || noun === 'entries';
      for (const [whole, n, noun] of text.matchAll(new RegExp(String.raw`\b(\d+) (${NOUNS})\b`, 'g'))) {
        if ((Number(n) === 1) === plural(noun!)) return `"${whole}"`;
      }
      return null;
    },
  },
  {
    name: 'a finished sentence',
    example: 'Answered on 3 of 5 sessions  · · and nothing else —',
    fault: (text) => {
      if (text === '') return null;
      const hit = text.match(/ {2}|\s[.,]|·\s*·|—\s*\.|\(\)|\s—\s*$/);
      if (hit) return `contains ${JSON.stringify(hit[0])}`;
      return text.trim() === text ? null : 'has space around it';
    },
  },
];

/**
 * One rule was attempted and dropped: *an empty log has nothing to count, so
 * any figure in the sentence is invented.* It cannot be stated. "Needs 21
 * days of logging and at least 6 scored training days inside the last 28" is
 * a requirement, not a count, and the only way to tell the two apart
 * mechanically is a list of the sentences allowed to carry numbers — which
 * is asserting the answer rather than computing it, the thing M245 was
 * about. It is left out rather than fudged green.
 */

describe('the checks themselves', () => {
  for (const check of CHECKS) {
    it(`${check.name}: rejects its own example`, () => {
      expect(check.fault(check.example), check.example).not.toBeNull();
    });
  }

  /** The structural pair, held to the same standard as the string ones. */
  it('the walk finds a number that is not one, however deep', () => {
    const found = numbersIn({ a: 1, b: { c: [2, NaN] }, d: 'x' });
    expect(found.map(([path]) => path)).toEqual(['a', 'b.c[0]', 'b.c[1]']);
    expect(found.filter(([, n]) => !Number.isFinite(n))).toHaveLength(1);
  });

  it('a grown tally is not the set it declares', () => {
    const grown = { good: 1, tender: 0, sore: 0, poor: NaN };
    expect(Object.keys(grown).sort()).not.toEqual(['good', 'sore', 'tender']);
  });
});

describe('every sentence on Progress, against every shape of log', () => {
  /**
   * Named by source, because a total is not a probe (PLAN.md M195). A count
   * over eighty was already satisfied by the Progress cards alone, so the
   * coach could be dropped from the corpus and every check below would go
   * on passing over what was left — which is what the battery found.
   */
  it('has a corpus to check, from every source it claims', () => {
    expect(new Set(EVERY.map((r) => r.shape)).size).toBe(Object.keys(SHAPES).length);

    const cards = new Set(EVERY.filter((r) => !r.card.startsWith('coach ')).map((r) => r.card));
    expect(cards.size, 'cards on Progress').toBeGreaterThan(12);

    const tips = new Set(
      EVERY.filter((r) => r.card.startsWith('coach ')).map((r) => r.card.split(' · ')[0]),
    );
    expect(tips.size, `coach observations: ${[...tips].join(', ')}`).toBeGreaterThan(5);
    // Both halves of every tip, not just its headline.
    expect(EVERY.filter((r) => r.card.endsWith('· body')).length).toBe(
      EVERY.filter((r) => r.card.endsWith('· headline')).length,
    );
  });

  for (const check of CHECKS) {
    it(check.name, () => {
      for (const row of EVERY) {
        expect(check.fault(row.text), where(row)).toBeNull();
      }
    });
  }

  /** M244, which no sentence ever showed. */
  it('holds no number that failed to be a number', () => {
    for (const [shape, sessions] of Object.entries(SHAPES)) {
      for (const [name, structure] of Object.entries(structuresFor(sessions))) {
        for (const [path, n] of numbersIn(structure)) {
          expect(Number.isFinite(n), `${name} — ${shape}: ${path} is ${n}`).toBe(true);
        }
      }
    }
  });

  /**
   * And grows no column the vocabulary has never had. The keys of a tally
   * are a closed set; a log that adds one has been let through unread.
   */
  it('keeps every tally to the keys it declares', () => {
    const KEYS: Record<string, string[]> = {
      'check-in history.fingers': ['good', 'sore', 'tender'],
      'check-in history.sleep': ['good', 'none', 'short'],
    };
    for (const [shape, sessions] of Object.entries(SHAPES)) {
      const history = checkInHistory({ sessions, to: TO });
      const tallies: Record<string, object> = {
        'check-in history.fingers': history.fingers,
        'check-in history.sleep': history.sleep,
      };
      for (const [name, tally] of Object.entries(tallies)) {
        expect(Object.keys(tally).sort(), `${name} — ${shape}`).toEqual(KEYS[name]);
      }
    }
  });

  /** Nothing here may read the clock or a random number. */
  it('says the same thing twice', () => {
    for (const [shape, sessions] of Object.entries(SHAPES)) {
      expect(proseFor(sessions), shape).toEqual(proseFor(sessions));
    }
  });
});
