import { describe, expect, it } from 'vitest';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import {
  ALL_PARTS,
  CLIMBING_PARTS,
  TISSUE_DAYS,
  describeTissue,
  quietestLoaded,
  tissueLoad,
  untouched,
} from './tissueLoad';

const TO = '2026-09-10';

const session = (date: string, patch: Partial<Session> = {}): Session =>
  ({
    id: `${date}#${patch.notes ?? 'a'}`,
    date,
    planned: false,
    completed: true,
    rewarded: true,
    mode: 'indoor',
    rpe: 7,
    durationMin: 60,
    warmup: true,
    climbs: [],
    createdAt: `${date}T18:00:00.000Z`,
    updatedAt: `${date}T18:00:00.000Z`,
    ...patch,
  }) as Session;

const climbing = (date: string, patch: Partial<Session> = {}) =>
  session(date, {
    climbs: [{ id: `c-${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    ...patch,
  } as Partial<Session>);

const build = (sessions: Session[], to = TO) => tissueLoad({ sessions, to });
const partFor = (load: ReturnType<typeof tissueLoad>, part: string) =>
  load.parts.find((p) => p.part === part)!;

describe('the window', () => {
  it('is four weeks, matching the training-load model', () => {
    const load = build([]);
    expect(load.from).toBe(addDays(TO, -(TISSUE_DAYS - 1)));
    expect(load.to).toBe(TO);
  });

  it('ignores what is outside it', () => {
    expect(build([climbing('2025-01-01')]).sessionCount).toBe(0);
    expect(build([climbing('2030-01-01')]).sessionCount).toBe(0);
  });

  it('ignores a session that was never completed', () => {
    expect(build([climbing(TO, { completed: false })]).sessionCount).toBe(0);
  });

  it('reports every part, whether or not it was touched', () => {
    // A missing row is indistinguishable from a zero row, and the point of
    // the chart is what is *not* being loaded.
    expect(build([]).parts.map((p) => p.part).sort()).toEqual([...ALL_PARTS].sort());
  });
});

describe('what a session is taken to load', () => {
  it('credits climbing even when nothing was written down', () => {
    // Most logged sessions carry no prose. Without this the chart reports a
    // climber who logs grades and nothing else as training no tissue at all.
    const load = build([climbing(TO)]);
    for (const part of CLIMBING_PARTS) expect(partFor(load, part).sessions).toBe(1);
  });

  it('reads the exercises that were ticked', () => {
    const load = build([session(TO, { exercises: [{ name: 'Max hangs on a 20mm edge' }] })]);
    expect(partFor(load, 'fingers').sessions).toBe(1);
    expect(partFor(load, 'knee').sessions).toBe(0);
  });

  it('reads the notes', () => {
    const load = build([session(TO, { notes: 'Lots of heel hooks today' })]);
    expect(partFor(load, 'knee').sessions).toBe(1);
    expect(partFor(load, 'hip').sessions).toBe(1);
  });

  it('reads words the caller supplies from the catalogue', () => {
    // A drill's name and a program's prescription live in content, not on
    // the record.
    const load = tissueLoad({
      sessions: [session(TO)],
      to: TO,
      textFor: () => 'Campus ladders',
    });
    expect(partFor(load, 'fingers').sessions).toBe(1);
    expect(partFor(load, 'shoulder').sessions).toBe(1);
  });

  it('counts a session it can read nothing in', () => {
    const load = build([session(TO)]);
    expect(load.sessionCount).toBe(1);
    expect(load.unreadSessions).toBe(1);
    expect(load.parts.every((p) => p.sessions === 0)).toBe(true);
  });
});

describe('how load is attributed', () => {
  it('gives each tissue the whole session, not a slice of it', () => {
    // Dividing would say a session loads your fingers less because it also
    // loaded your shoulder, which is not how a body works.
    const load = build([session(TO, { rpe: 8, durationMin: 60, exercises: [{ name: 'Pull-ups' }] })]);
    for (const part of ['elbow', 'shoulder', 'back']) {
      expect(partFor(load, part).load).toBeCloseTo(8, 6);
    }
  });

  it('adds up across sessions', () => {
    const load = build([
      session(TO, { rpe: 6, durationMin: 60, exercises: [{ name: 'Max hangs' }] }),
      session(addDays(TO, -2), { rpe: 4, durationMin: 60, exercises: [{ name: 'Max hangs' }] }),
    ]);
    expect(partFor(load, 'fingers').load).toBeCloseTo(10, 6);
    expect(partFor(load, 'fingers').sessions).toBe(2);
  });

  it('measures share against the busiest tissue, never against a sum', () => {
    // The parts deliberately do not sum to the session total, so a
    // percentage-of-total would be a number with no meaning.
    const load = build([
      climbing(TO, { rpe: 9, durationMin: 120 }),
      session(addDays(TO, -1), { rpe: 3, durationMin: 30, exercises: [{ name: 'Heel hook drills' }] }),
    ]);
    expect(load.parts[0]!.share).toBe(1);
    expect(partFor(load, 'knee').share).toBeGreaterThan(0);
    expect(partFor(load, 'knee').share).toBeLessThan(1);
  });

  it('orders heaviest first', () => {
    const load = build([climbing(TO), session(addDays(TO, -1), { notes: 'squats' })]);
    for (let i = 1; i < load.parts.length; i++) {
      expect(load.parts[i]!.load).toBeLessThanOrEqual(load.parts[i - 1]!.load);
    }
  });

  it('has no shares at all when nothing was loaded', () => {
    expect(build([]).parts.every((p) => p.share === 0)).toBe(true);
  });
});

describe('how long since', () => {
  it('counts days back to the last session that touched it', () => {
    const load = build([climbing(addDays(TO, -5))]);
    expect(partFor(load, 'fingers').daysSinceLoaded).toBe(5);
  });

  it('takes the most recent, not the first', () => {
    const load = build([climbing(addDays(TO, -20)), climbing(addDays(TO, -3))]);
    expect(partFor(load, 'fingers').daysSinceLoaded).toBe(3);
  });

  it('says nothing rather than zero for a tissue never touched', () => {
    // Zero would read as "loaded today", which is the opposite.
    expect(partFor(build([climbing(TO)]), 'ankle').daysSinceLoaded).toBeNull();
  });
});

describe('the quietest tissue', () => {
  it('is the least loaded of the ones that were loaded', () => {
    const load = build([
      climbing(TO, { rpe: 9, durationMin: 90 }),
      session(addDays(TO, -1), { rpe: 2, durationMin: 30, notes: 'ankle hops' }),
    ]);
    const quiet = quietestLoaded(load)!;
    expect(quiet.sessions).toBeGreaterThan(0);
    expect(['ankle', 'knee']).toContain(quiet.part);
  });

  it('is not a tissue nothing touched', () => {
    // Telling a climber their ankles are the weak point because the word
    // never appears in their log would be the scan pretending to be an
    // assessment.
    const load = build([
      climbing(TO, { rpe: 9, durationMin: 90 }),
      session(addDays(TO, -1), { rpe: 2, durationMin: 30, notes: 'ankle hops' }),
    ]);
    expect(quietestLoaded(load)!.sessions).toBeGreaterThan(0);
    expect(untouched(load).map((p) => p.part)).toContain('wrist');
  });

  it('names nobody when every loaded tissue ties', () => {
    // A climber who logs grades and no prose loads exactly the four
    // climbing tissues, equally, every session. The "quietest" of those is
    // whichever the sort put last, and naming it would invent a weak point
    // out of a tie.
    const load = build([climbing(TO), climbing(addDays(TO, -2))]);
    const loaded = load.parts.filter((p) => p.sessions > 0);
    expect(loaded).toHaveLength(CLIMBING_PARTS.length);
    expect(quietestLoaded(load)).toBeNull();
    expect(describeTissue(load)).not.toMatch(/least through/);
  });

  it('is nothing when nothing was read', () => {
    expect(quietestLoaded(build([]))).toBeNull();
    expect(untouched(build([]))).toHaveLength(ALL_PARTS.length);
  });
});

describe('the sentence', () => {
  it('says so when there is nothing', () => {
    expect(describeTissue(build([]))).toMatch(/nothing logged/i);
  });

  it('names the busiest and the quietest', () => {
    const load = build([
      climbing(TO, { rpe: 9, durationMin: 120 }),
      session(addDays(TO, -1), { rpe: 2, durationMin: 30, notes: 'ankle hops and squats' }),
    ]);
    const text = describeTissue(load);
    expect(text).toMatch(/Most of it through your \w+/);
    expect(text).toMatch(/least through your \w+/);
  });

  it('says which tissues it saw nothing for', () => {
    expect(describeTissue(build([climbing(TO)]))).toMatch(/nothing at all for/);
  });

  it('prescribes nothing', () => {
    // The training-state card is where the app gives advice, and a keyword
    // scan has not earned the right to.
    const load = build([climbing(TO), session(addDays(TO, -1), { notes: 'squats' })]);
    expect(describeTissue(load)).not.toMatch(/should|need to|rest|back off|careful|avoid/i);
  });

  it('admits when it read nothing at all', () => {
    expect(describeTissue(build([session(TO)]))).toMatch(/none of them describing/i);
  });
});
