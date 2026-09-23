/**
 * The finger rule, read against the catalogue it is about (PLAN.md M321).
 *
 * `fingerGap` read a session type's **name** and the exercises a climber
 * typed. Nine of the shipped session types prescribe a finger protocol and
 * five of them say nothing about it in their name, so a climber who tapped
 * *Finger Protocol + Engine*, did the max hangs and typed nothing into the
 * logger had done, as far as this rule could tell, no finger work at all.
 *
 * Swept over the catalogue rather than asserted about one program, because
 * the claim is about the content and the content is where it can go wrong.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { loadPrograms, PROGRAMS, getProgram } from '@/content/programs';
import { loadDrills, DRILLS } from '@/content/drills';
import type { SessionType } from '@/content/types';
import { newSession, type Session } from '@/db/sessions';
import { LOAD_RULES, rulesInText } from './bodyLoad';
import { directFingerWork, drillOnTheBoard, fingerGaps, loadsFingersDirectly } from './fingerGap';
import { demoClimber } from './demoClimber';
import { addDays } from './dates';

const TODAY = '2026-03-30';

const logged = (programId: string, sessionTypeId: string): Session => ({
  ...newSession(TODAY, 0),
  completed: true,
  rpe: 7,
  durationMin: 60,
  programId,
  sessionTypeId,
});

/** Every exercise name a type prescribes, across every phase it has. */
function prescribed(type: SessionType): string[] {
  const out: string[] = [];
  for (const block of type.blocks ?? []) {
    for (const prescription of Object.values(block.perPhase)) {
      for (const exercise of prescription.exercises) out.push(exercise.name);
    }
  }
  return out;
}

beforeAll(async () => {
  await loadPrograms();
  await loadDrills();
});

describe('the catalogue this reads', () => {
  it('is loaded, so the sweeps below mean something', () => {
    // M309's floor: a registry that failed to load makes every sweep pass.
    expect(PROGRAMS.length).toBeGreaterThan(10);
    expect(DRILLS.length).toBeGreaterThan(100);
  });

  /**
   * The five the name missed, named one by one rather than counted.
   *
   * A count would pass on a different five.
   */
  it.each([
    ['iron_grip', 'fp', 'Finger Protocol + Engine'],
    ['trip_prep', 'fp', 'Finger Primer'],
    ['two_day_week', 'climb', 'Climb & Apply'],
    ['lockdown', 'sa', 'Session A: Static Power'],
  ])('counts %s/%s — "%s" — off what it prescribes', (programId, typeId, name) => {
    const type = getProgram(programId)!.sessionTypes.find((t) => t.id === typeId)!;
    expect(type.name, 'the catalogue renamed this type').toBe(name);
    // The half that was missing: the name alone says nothing.
    expect(directFingerWork(type.name), `"${name}" matches by name after all`).toBe(false);
    expect(loadsFingersDirectly(logged(programId, typeId))).toBe(true);
  });

  it('still misses Ground Zero\'s structural day, on purpose', () => {
    // Its only matching line is `Dead Hang`, which the program's own
    // rationale calls "passive hanging tolerance — your first exposure to
    // finger-tendon load", at three sets of ten to fifteen seconds. Telling a
    // beginner they breached a forty-eight hour protocol rule for that is the
    // false positive this milestone removed rather than introduced.
    expect(loadsFingersDirectly(logged('ground_zero', 'str'))).toBe(false);
  });

  it('agrees with itself about every session type in the catalogue', () => {
    // The whole sweep, so a type added later lands in one of the two lists
    // rather than nowhere. Names, because a reader can check them.
    const counted: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        if (loadsFingersDirectly(logged(program.id, type.id))) counted.push(`${program.id}/${type.id}`);
      }
    }
    expect(counted.sort()).toEqual([
      'general_training/hb',
      'iron_grip/fp',
      'lockdown/sa',
      'peak_performance/fp',
      'the_cruiser/hb',
      'the_siege/fp',
      'trip_prep/fp',
      'two_day_week/climb',
    ]);
  });

  /**
   * The approximation, bounded.
   *
   * `words()` reads every phase's lines rather than working out which phase
   * the session's date falls in, because the date is not in its hands. That
   * is only harmless while no type prescribes finger work in some phases and
   * not others. None does — so for this catalogue the two readings are the
   * same reading, and if that stops being true this fails and the shortcut
   * has to be argued again rather than quietly becoming wrong.
   */
  it('has no session type that prescribes finger work in only some phases', () => {
    const mixed: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        const byPhase = program.phases.map((phase) =>
          (type.blocks ?? []).some((block) =>
            (block.perPhase[phase.id]?.exercises ?? []).some((e) => directFingerWork(e.name)),
          ),
        );
        if (byPhase.some(Boolean) && byPhase.some((v) => !v)) mixed.push(`${program.id}/${type.id}`);
      }
    }
    expect(mixed).toEqual([]);
  });
});

describe('what a climber typed still wins nothing it should not', () => {
  it('does not need the climber to have typed anything', () => {
    const session = logged('iron_grip', 'fp');
    expect(session.exercises).toBeUndefined();
    expect(loadsFingersDirectly(session)).toBe(true);
  });

  it('reads a typed exercise on a type that prescribes none', () => {
    // The path that already worked, kept: a climber doing max hangs on a
    // session type that never asked for them has still done max hangs.
    const session = { ...logged('ground_zero', 'str'), exercises: [{ name: 'Max Hangs' }] as never };
    expect(loadsFingersDirectly(session)).toBe(true);
  });

  it('leaves a session with no type and no exercises alone', () => {
    expect(loadsFingersDirectly({ ...newSession(TODAY, 0), completed: true })).toBe(false);
  });

  it('never counts a rest day, however the plan describes it', () => {
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        if (type.isRest !== true) continue;
        const rest = { ...logged(program.id, type.id), restChecklist: { slept: true } as never };
        expect(loadsFingersDirectly(rest), `${program.id}/${type.id}`).toBe(false);
      }
    }
  });
});

describe('the narrowing, against the content it was measured on', () => {
  it('moves nothing in the catalogue but the two dead hangs', () => {
    // The sweep that decided it: every authored name the rule can see, with
    // the borrowed rule's answer beside this one. Stated as the two strings
    // rather than a count, because a count would pass on a different two.
    //
    // `bodyLoad`'s own `fingers` rule, read live rather than restated — this
    // is the question *"how does the narrowing differ from what it narrowed"*,
    // and a copy of the pattern here would answer a question about a copy.
    // The first draft of this restated only that pattern and forgot the two
    // rules still borrowed beside it, so `Campus Skips`, `Foot-On Laddering`
    // and `One-Arm Negatives` all read as moved when nothing had moved.
    const fingersRule = LOAD_RULES.find((rule) => rule.id === 'fingers')!;
    const before = (text: string) =>
      fingersRule.pattern.test(text) ||
      rulesInText(text).some((id) => id === 'campus' || id === 'one-arm');
    const moved: string[] = [];
    const names = new Set<string>();
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        names.add(type.name);
        for (const name of prescribed(type)) names.add(name);
      }
    }
    for (const drill of DRILLS) names.add(`${drill.name} ${drill.focus}`);
    expect(names.size, 'the sweep read almost nothing').toBeGreaterThan(300);
    for (const text of names) {
      if (before(text) !== directFingerWork(text)) moved.push(text);
    }
    expect(moved.sort()).toEqual(['Dead Hang', 'Passive Dead Hangs']);
  });
});

describe('what a drill is, to the forty-eight hours (PLAN.md M324)', () => {
  it('counts the library’s hangboard drills and nothing else', () => {
    // Named, not counted. Before M324 this list was seven wall drills —
    // crimp bouldering, a pull-power drill and a lead-fall ladder — and none
    // of the three below.
    expect(DRILLS.filter(drillOnTheBoard).map((d) => d.id).sort()).toEqual([
      'graduation_retest_fingers',
      'graduation_retest_static',
      'pp_graduation_retest',
    ]);
  });

  it('never counts a climbing drill, however hard it is on the fingers', () => {
    const crimps = getDrillOrThrow('limit_boulders_on_the_crimps');
    expect(crimps.equipment).toEqual(['wall']);
    expect(drillOnTheBoard(crimps)).toBe(false);
    const session = { ...logged('iron_grip', 'perf'), drillId: crimps.id };
    expect(loadsFingersDirectly(session)).toBe(false);
  });

  it('counts a board drill whatever it is called', () => {
    expect(drillOnTheBoard({ name: 'Sunday thing', focus: 'Whatever', equipment: ['hangboard'] })).toBe(true);
    expect(drillOnTheBoard({ name: 'Sunday thing', focus: 'Whatever', equipment: ['campus'] })).toBe(true);
  });

  it('reads the words of a drill written for no kit at all', () => {
    // A custom drill with nothing ticked is somewhere this app cannot see,
    // and its name is all there is. The wall is never that case.
    expect(drillOnTheBoard({ name: 'Max hangs at home', focus: 'Fingers', equipment: [] })).toBe(true);
    expect(drillOnTheBoard({ name: 'Stretching', focus: 'Hips', equipment: [] })).toBe(false);
    expect(drillOnTheBoard({ name: 'Max hangs', focus: 'Fingers', equipment: ['wall'] })).toBe(false);
  });

  it('lets a climber run Iron Grip as written without being told they broke it', () => {
    // The finding. Iron Grip puts a crimp drill on the Wednesday before a
    // Thursday finger day in weeks 1-3, and `PreSession` stamps that drill on
    // every perf session a climber starts. The rule read the drill's words,
    // counted the Wednesday as a finger session, and found the program's own
    // layout inside its own gap. Swept over a week of days, because which
    // sessions have happened turns on the weekday.
    for (let i = 0; i < 7; i += 1) {
      const today = addDays('2026-09-20', i);
      expect(fingerGaps(demoClimber(today).sessions, today), today).toBeNull();
    }
  });
});

function getDrillOrThrow(id: string) {
  const drill = DRILLS.find((d) => d.id === id);
  if (!drill) throw new Error(`no drill ${id}`);
  return drill;
}
