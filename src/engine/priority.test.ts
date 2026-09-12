import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '@/content/programs';
import { proposePriority } from './priority';
import { sessionPriority, sessionsForDays } from './scheduler';
import type { Program } from '@/content/types';

/**
 * Which sessions survive a short week (PLAN.md M64).
 *
 * M55 built the machinery and set it on nothing, so every program still
 * dropped sessions in declaration order. These hold the two things that
 * matter: that the catalogue is now tuned at all, and that the tuning agrees
 * with what each program's own data says.
 */

const structured = PROGRAMS.filter((p) => p.kind !== 'mode');

describe('the catalogue is tuned', () => {
  it('gives every working session in every program a priority', () => {
    for (const program of structured) {
      for (const type of program.sessionTypes) {
        if (type.isRest) continue;
        expect(type.priority, `${program.id}/${type.id}`).toBeGreaterThan(0);
      }
    }
  });

  // Half a program is worse than none of it: an unset priority sorts after
  // every authored one, so authoring only some of a program's sessions puts
  // the untouched ones last however important they are.
  it('never leaves a program half-tuned', () => {
    for (const program of structured) {
      const work = program.sessionTypes.filter((t) => !t.isRest);
      const tuned = work.filter((t) => t.priority !== undefined).length;
      expect(tuned === 0 || tuned === work.length, program.id).toBe(true);
    }
  });

  it('uses each rank once per program', () => {
    for (const program of structured) {
      const ranks = program.sessionTypes.filter((t) => !t.isRest).map((t) => t.priority);
      expect(new Set(ranks).size, program.id).toBe(ranks.length);
    }
  });

  it('leaves rest days out of it — they are not a session to keep', () => {
    for (const program of structured) {
      for (const type of program.sessionTypes) {
        if (type.isRest) expect(type.priority, `${program.id}/${type.id}`).toBeUndefined();
      }
    }
  });
});

/**
 * Where the coach overruled the derivation, and why (PLAN.md, coaching
 * calls 2 and 10).
 *
 * `proposePriority` reads each program's own data and proposes an order
 * from it. Its own doc says it is a proposal; this is the file where that
 * stops being a figure of speech. Both overrides are the same disagreement
 * with the same weight — `onTheWall`, worth 2, which ranks a climbing day
 * above a training day. That is right for a program whose point is climbing
 * and wrong for one whose point is the training, and the derivation cannot
 * tell those apart because nothing in a program's data says which it is.
 *
 * Listed per program rather than allowed generally, so a *third* program
 * drifting away from its own evidence is still a failure rather than a
 * precedent.
 */
const OVERRULED: Record<string, string[]> = {
  // A two-day week that drops Session A is not a static power block.
  lockdown: ['sa', 'tech', 'sb'],
  // A one-day week that drops the finger protocol is not a finger-strength
  // program.
  iron_grip: ['fp', 'perf'],
};

describe('the tuning matches what the programs say', () => {
  it('agrees with the proposal derived from each program, bar the overrides', () => {
    for (const program of structured) {
      const authored = sessionPriority(program);
      const expected = OVERRULED[program.id] ?? proposePriority(program).map((p) => p.id);
      expect(authored, program.id).toEqual(expected);
    }
  });

  it('lists no override the derivation already agrees with', () => {
    // An override that matches the proposal is a no-op that reads as a
    // decision, and it would go on excusing the program after the reason
    // for it had gone away.
    for (const [id, order] of Object.entries(OVERRULED)) {
      const program = structured.find((p) => p.id === id)!;
      expect(proposePriority(program).map((p) => p.id), id).not.toEqual(order);
    }
  });

  // Overruled at the coaching review, and it used to read the other way.
  // The program protects the hangboard with a rule of its own — never hang
  // the day before hard climbing — and the derivation counted that
  // protection as evidence for keeping the *climbing*. One day of a program
  // called 12-Week Finger Strength keeps the fingers.
  it('keeps the hangboard over the climbing day in Iron Grip', () => {
    const ironGrip = structured.find((p) => p.id === 'iron_grip')!;
    expect(sessionsForDays(ironGrip, 1)).toEqual(['fp']);
  });

  it('keeps the strength day over the technique day in Lockdown', () => {
    const lockdown = structured.find((p) => p.id === 'lockdown')!;
    expect(sessionsForDays(lockdown, 1)).toEqual(['sa']);
  });

  it('drops the session a program calls optional first', () => {
    const cruiser = structured.find((p) => p.id === 'the_cruiser')!;
    const kept = sessionsForDays(cruiser, 4);
    expect(kept).not.toContain('hb');
  });

  it('keeps climbing over accessory work when the week is one day', () => {
    for (const id of ['base_camp', 'gravity_defied', 'the_long_game']) {
      const program = structured.find((p) => p.id === id)!;
      const [kept] = sessionsForDays(program, 1);
      const type = program.sessionTypes.find((t) => t.id === kept)!;
      expect(Object.keys(type.drillsByWeek ?? {}).length, `${id} kept ${kept}`).toBeGreaterThan(0);
    }
  });
});

describe('the proposal itself', () => {
  const fixture = (types: { id: string; name: string; drills?: boolean }[], constraints: Program['constraints'] = [], slots: Record<number, string> = {}): Program =>
    ({
      id: 'fixture',
      sessionTypes: types.map((t) => ({
        id: t.id,
        name: t.name,
        icon: '·',
        description: '',
        ...(t.drills ? { drillsByWeek: { 1: 'x' } } : {}),
      })),
      constraints,
      recommendedLayout: Object.keys(slots).length ? { name: 'R', description: '', slots } : undefined,
    }) as unknown as Program;

  it('ranks a session the prescribed week runs twice above one it runs once', () => {
    const program = fixture([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [], { 1: 'a', 3: 'b', 5: 'a' });
    expect(proposePriority(program).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('reports a tie rather than pretending the program chose', () => {
    const program = fixture([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], [], { 1: 'a', 3: 'b' });
    const out = proposePriority(program);
    expect(out.every((p) => p.tied)).toBe(true);
    // And a tie keeps declaration order, which is what happened before.
    expect(out.map((p) => p.id)).toEqual(['a', 'b']);
  });

  // No shipped program exercises these two yet — Iron Grip's climbing day
  // and the Cruiser's hangboard module both come out on top and bottom
  // anyway — so they are held on a fixture rather than left as rules nobody
  // checks.
  it('lifts a session the program protects with a rule of its own', () => {
    const program = fixture(
      [{ id: 'fp', name: 'Fingers' }, { id: 'perf', name: 'Climbing' }],
      [{ kind: 'not-day-before', sessionTypeId: 'fp', before: 'perf', note: '' }] as Program['constraints'],
      { 1: 'fp', 3: 'perf' },
    );
    expect(proposePriority(program).map((p) => p.id)).toEqual(['perf', 'fp']);
  });

  it('drops a session whose own name calls it optional, however well placed', () => {
    const program = fixture(
      [{ id: 'extra', name: 'Hangboard Module (optional)' }, { id: 'main', name: 'Climbing' }],
      [],
      { 1: 'extra', 3: 'extra', 5: 'main' },
    );
    expect(proposePriority(program).map((p) => p.id)).toEqual(['main', 'extra']);
  });

  it('attaches the evidence to every line', () => {
    const program = fixture([{ id: 'a', name: 'A', drills: true }], [], { 1: 'a' });
    expect(proposePriority(program)[0]!.why).toEqual([
      '+3 in the prescribed week once',
      '+2 is climbing, not accessory work',
    ]);
  });
});
