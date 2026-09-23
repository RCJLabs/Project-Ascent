/**
 * The sample climber, written the way the app writes a climber (PLAN.md M324).
 *
 * Measured before this: of the thirty fields on `Session`, the fixture every
 * browser check, layout run and screenshot uses had never filled nine. Two of
 * those it never should — `completedExercises` is deprecated and never
 * written, and `imported` marks a spreadsheet row — which leaves seven it was
 * simply missing: `exercises`, `drillId`, `drillDone`, `trackId`, `deload`,
 * `startedAt` and `endedAt`. Between them they have well over a hundred file
 * reads, none of which had ever seen one filled.
 *
 * The last four bugs this audit found were each found the moment the fixture
 * reached a state it never had. This file is the rule that keeps that list
 * from growing back: every field on `Session` is filled by the sample climber
 * or named below with the reason it is not.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { getProgram } from '@/content/programs';
import { code } from '@/test/source';
import { LATE_HOUR } from './coach';
import { DEMO_TRACK, demoClimber } from './demoClimber';
import { plannedDay } from './plan';
import { planVsLog } from './planVsLog';

const TODAY = '2026-09-22';

/** Fields the sample climber must never fill, and why. */
const NEVER_FROM_THE_DEMO: Record<string, string> = {
  completedExercises: 'deprecated: folded into `exercises` on read, and never written by anything',
  imported: 'marks a row built from a spreadsheet, and nothing the sample climber has came from one',
};

/** The fields `Session` declares, read from its source rather than restated. */
function sessionFields(): string[] {
  const src = code(readFileSync('src/db/sessions.ts', 'utf8'));
  const body = /export interface Session \{([\s\S]*?)\n\}/.exec(src)?.[1] ?? '';
  return [...body.matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]!);
}

describe('what the sample climber fills', () => {
  it('reads the field list it is holding to', () => {
    // M309's floor: a scan that matched nothing would pass every line below.
    expect(sessionFields().length).toBeGreaterThan(25);
    expect(sessionFields()).toContain('exercises');
  });

  it('fills every field on a session, or says why not', () => {
    const made = demoClimber(TODAY);
    const filled = new Set<string>();
    for (const session of made.sessions) {
      for (const [key, value] of Object.entries(session)) {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
        filled.add(key);
      }
    }
    const missing = sessionFields().filter((f) => !filled.has(f) && !(f in NEVER_FROM_THE_DEMO));
    expect(missing, 'a Session field no fixture ever fills — fill it, or name it below with a reason').toEqual([]);
    // And the other half: the exemptions stay true.
    for (const field of Object.keys(NEVER_FROM_THE_DEMO)) expect(filled.has(field), field).toBe(false);
  });
});

describe('the running block, as the start button stamps it', () => {
  const made = demoClimber(TODAY);
  const program = getProgram('iron_grip')!;
  const inBlock = made.sessions.filter((s) => s.date >= made.startDate);
  const training = inBlock.filter((s) => s.restChecklist === undefined);
  const dayOf = (date: string) => plannedDay(program, made.startDate, made.plan, date);

  it('runs a track the program declares, and hands it to the profile', () => {
    expect(program.tracks?.map((t) => t.id)).toContain(DEMO_TRACK);
    expect(made.trackId).toBe(DEMO_TRACK);
  });

  it('keeps an injured elbow off the campus board', () => {
    // The reason, not the constant: a battery mutant that switched the
    // sample climber to the board track survived a test that only compared
    // `DEMO_TRACK` with itself. The program calls the board *"the highest
    // injury risk in the program"*, and this climber is carrying an elbow.
    expect(made.injuries.map((i) => i.part)).toContain('elbow');
    // By what the program says about it, not by its name: the first draft
    // matched `/campus/i` on the name and found *"No campus board"* first.
    const board = program.tracks?.find((t) => /highest injury risk/i.test(t.description))?.id;
    expect(board, 'Iron Grip no longer has a campus track to avoid').toBeDefined();
    expect(made.trackId).not.toBe(board);
  });

  it('carries the block and the track on everything started inside it', () => {
    expect(inBlock.length).toBeGreaterThan(15);
    for (const session of inBlock) {
      expect(session.programId, session.date).toBe('iron_grip');
      expect(session.trackId, session.date).toBe(DEMO_TRACK);
    }
  });

  it('carries the week’s drill on every climbing day the plan placed', () => {
    const placed = training.filter((s) => s.sessionTypeId === 'perf' && s.planned);
    expect(placed.length).toBeGreaterThan(5);
    for (const session of placed) {
      expect(session.drillId, session.date).toBe(dayOf(session.date).drill?.id);
    }
  });

  it('marks the deload week and nothing else', () => {
    const flagged = inBlock.filter((s) => s.deload === true).map((s) => s.date);
    const deloadDays = inBlock.filter((s) => dayOf(s.date).isDeload && s.restChecklist === undefined).map((s) => s.date);
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.sort()).toEqual(deloadDays.sort());
  });

  it('takes the deload as a lighter week, so the plan has nothing to say about it', () => {
    // M319 measured the sample climber's week four at 1.34× the weeks before
    // it — a deload heavier than training. The flag and the effort now agree.
    const findings = planVsLog({ program, startDate: made.startDate, sessions: made.sessions, trackId: made.trackId, today: TODAY });
    expect(findings.map((f) => f.kind)).not.toContain('deload');
  });
});

describe('the clock', () => {
  const made = demoClimber(TODAY);
  const timed = made.sessions.filter((s) => s.startedAt !== undefined);

  it('starts in the evening wherever the log is loaded', () => {
    // Local, deliberately: `lateSessions` reads `getHours()`, and a fixed-UTC
    // evening would make this a late trainer in Tokyo and not in London.
    // This assertion holds in any timezone the suite runs in.
    expect(timed.length).toBeGreaterThan(15);
    for (const session of timed) {
      const hour = new Date(session.startedAt!).getHours();
      expect(hour, session.date).toBeGreaterThanOrEqual(17);
      expect(hour, session.date).toBeLessThan(LATE_HOUR);
    }
  });

  it('ends when the duration says it did', () => {
    for (const session of timed) {
      const minutes = (Date.parse(session.endedAt!) - Date.parse(session.startedAt!)) / 60_000;
      expect(minutes, session.date).toBe(session.durationMin);
    }
  });

  it('puts no clock on today, which it cannot know the time of', () => {
    const today = made.sessions.filter((s) => s.date === TODAY);
    expect(today.length, 'nothing dated today to check').toBeGreaterThan(0);
    for (const session of today) expect(session.startedAt, session.id).toBeUndefined();
  });

  it('starts on the day the session is dated', () => {
    for (const session of timed) {
      const at = new Date(session.startedAt!);
      const local = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
      expect(local, session.id).toBe(session.date);
    }
  });
});

describe('what the logger kept', () => {
  const made = demoClimber(TODAY);
  const fingerDays = made.sessions.filter((s) => s.sessionTypeId === 'fp').sort((a, b) => a.date.localeCompare(b.date));

  it('logs the finger protocol with its numbers on every hangboard day', () => {
    expect(fingerDays.length).toBeGreaterThan(8);
    for (const session of fingerDays) {
      const protocol = (session.exercises ?? []).find((e) => /Repeaters|Max Hangs/.test(e.name));
      expect(protocol, session.date).toBeDefined();
      expect(protocol!.sets, session.date).toBeGreaterThan(0);
      expect(protocol!.load, session.date).toBeGreaterThan(0);
    }
  });

  it('loads it off the climber’s own max hang', () => {
    // A percentage of the last benchmark, from the prescription's own words,
    // plus a notch a week — not a number chosen to look plausible.
    const maxHang = made.metrics
      .filter((m) => m.metricId === 'max_hang_20mm_7s' && m.date < made.startDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1)!.value;
    for (const session of fingerDays) {
      const protocol = session.exercises!.find((e) => /Repeaters|Max Hangs/.test(e.name))!;
      expect(protocol.load!, session.date).toBeGreaterThan(maxHang * 0.55);
      expect(protocol.load!, session.date).toBeLessThan(maxHang * 1.1);
    }
  });

  it('takes a set and a step of load off on the deload week, as Iron Grip says to', () => {
    // The program's own week-four step: "Three sets on the same edge, a step
    // lighter than you have been hanging". The first draft of this test held
    // the load — following the generic default for programs that wrote no
    // deload — and the logger printed Iron Grip's sentence over a load that
    // contradicted it. Found reading the screen, not the code.
    const program = getProgram('iron_grip')!;
    const deload = fingerDays.find((s) => s.deload === true)!;
    const step = plannedDay(program, made.startDate, made.plan, deload.date);
    expect(step.isDeload).toBe(true);
    const before = fingerDays.filter((s) => s.date < deload.date && s.deload !== true).at(-1)!;
    const line = (s: typeof deload) => s.exercises!.find((e) => e.name === '7/3 Repeaters')!;
    expect(line(deload).sets!).toBeLessThan(line(before).sets!);
    expect(line(deload).load!).toBe(line(before).load! - 2.5);
  });

  it('adds a notch a week through the phase', () => {
    // Iron Grip's Anvil says *"Easy? Add 2.5 lbs"*. Held as a rise rather
    // than as "never lighter", which a flat line passes: a mutant that
    // dropped the weekly notch survived exactly that.
    const repeaters = fingerDays
      .filter((s) => s.deload !== true)
      .map((s) => s.exercises!.find((e) => e.name === '7/3 Repeaters')?.load)
      .filter((load): load is number => load !== undefined);
    expect(repeaters.length).toBeGreaterThan(2);
    expect(repeaters.at(-1)!).toBeGreaterThan(repeaters[0]!);
  });

  it('never loads a protocol lighter than the week before it, bar the deload', () => {
    const byName = new Map<string, number[]>();
    for (const session of fingerDays.filter((s) => s.deload !== true)) {
      for (const e of session.exercises ?? []) {
        if (e.load === undefined) continue;
        byName.set(e.name, [...(byName.get(e.name) ?? []), e.load]);
      }
    }
    expect(byName.size).toBeGreaterThan(0);
    for (const [name, loads] of byName) {
      for (let i = 1; i < loads.length; i += 1) expect(loads[i]!, name).toBeGreaterThanOrEqual(loads[i - 1]!);
    }
  });
});
