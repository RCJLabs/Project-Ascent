import { beforeAll, describe, expect, it } from 'vitest';
import { DRILLS, getDrill, offWallDrills } from '@/content/drills';
import { loadPrograms } from '@/content/programs';
import { CATALOGUE } from '@/content/programs/catalogue';
import { drillConflict } from './bodyLoad';
import { addDays } from './dates';
import { restDayDrill, restDayDrills } from './restDrill';

/**
 * Twelve drills for the day you cannot train, prescribed by nothing
 * (PLAN.md M164).
 */

const DAY = '2026-05-04';

beforeAll(async () => {
  await loadPrograms();
});

describe('the finding, measured rather than read off the ids', () => {
  /**
   * The proposal said 144 of 156. `sources` is the link — it means "the
   * programs this drill was extracted from" — and a drill with an empty one
   * is a drill the library offers on its own.
   */
  it('is twelve of a hundred and fifty-six that no program claims', () => {
    expect(DRILLS.length).toBe(156);
    const orphans = DRILLS.filter((d) => (d.sources ?? []).length === 0);
    expect(orphans.length).toBe(12);
    expect(orphans.every((d) => d.id.startsWith('off_'))).toBe(true);
  });

  /**
   * And they are exactly the ones that need nothing, which is the point: the
   * two sets are computed independently and compared, so a drill that gains a
   * source or loses its `none` breaks this rather than drifting.
   */
  it('and they are exactly the ones that need no wall', () => {
    const noSource = DRILLS.filter((d) => (d.sources ?? []).length === 0).map((d) => d.id).sort();
    const noKit = offWallDrills().map((d) => d.id).sort();
    expect(noSource).toEqual(noKit);
  });

  it('and every program schedules the day they were written for', () => {
    const withRest = CATALOGUE.filter((p) => p.sessionTypes.some((t) => t.isRest === true));
    expect(withRest.length).toBe(CATALOGUE.length);
    expect(CATALOGUE.length).toBe(13);
  });
});

describe('which of them belongs on a rest day', () => {
  /**
   * `off_tension_holds` is twelve to fifteen minutes of hollow and arch
   * holds, filed under `power`. That is training, and offering it on a rest
   * day would be the app contradicting the plan it just rendered.
   */
  it('leaves out the one that is training', () => {
    expect(offWallDrills().map((d) => d.id)).toContain('off_tension_holds');
    expect(restDayDrills().map((d) => d.id)).not.toContain('off_tension_holds');
    expect(restDayDrills().every((d) => d.category !== 'power')).toBe(true);
  });

  /**
   * And keeps the aerobic one, which looks like the same call and is not:
   * the recovery checklist has *"Walking / Zone 1"* as one of its four
   * items, so zone-one work is already part of what this app means by a rest
   * day.
   */
  it('keeps the aerobic one, because the checklist already asks for it', () => {
    expect(restDayDrills().map((d) => d.id)).toContain('off_easy_aerobic');
  });

  it('keeps everything else', () => {
    expect(restDayDrills().length).toBe(offWallDrills().length - 1);
    expect(restDayDrills().every((d) => d.equipment.every((e) => e === 'none'))).toBe(true);
  });

  /**
   * Derived from the library rather than listed, so a thirteenth off-wall
   * drill is offered the day it is written.
   */
  it('is a reading of the library, not a copy of it', () => {
    const ids = new Set(offWallDrills().map((d) => d.id));
    expect(restDayDrills().every((d) => ids.has(d.id))).toBe(true);
  });
});

describe('one drill, for one day', () => {
  it('offers one', () => {
    expect(restDayDrill(DAY)).not.toBeNull();
    expect(restDayDrills().map((d) => d.id)).toContain(restDayDrill(DAY)!.id);
  });

  it('offers the same one every time the same day is opened', () => {
    expect(restDayDrill(DAY)!.id).toBe(restDayDrill(DAY)!.id);
    expect(restDayDrill(DAY, [])!.id).toBe(restDayDrill(DAY)!.id);
  });

  /**
   * Two rest days in a row are two different drills. Six mobility routines
   * are worth having because they are not the same routine, and a rotation
   * that repeated would make eleven of them decoration.
   */
  it('offers a different one the next day', () => {
    expect(restDayDrill(addDays(DAY, 1))!.id).not.toBe(restDayDrill(DAY)!.id);
  });

  it('walks the whole list rather than favouring a few', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i += 1) seen.add(restDayDrill(addDays(DAY, i))!.id);
    expect(seen.size).toBe(restDayDrills().length);
  });

  /**
   * `daysBetween` is signed and the rotation is a modulo, so a date before
   * the epoch produces a negative index — which in JavaScript stays negative
   * and reads off the front of the array as `undefined`. A log imported from
   * a spreadsheet can easily carry one.
   */
  it('handles a date before its own epoch', () => {
    for (const date of ['2025-12-31', '2024-06-01', '2019-01-01']) {
      expect(restDayDrill(date), date).not.toBeNull();
    }
  });
});

describe('and not the one that loads what hurts', () => {
  /**
   * `off_wrist_forearm_prep` loads `fingers` and `forearm` — it holds a
   * load in the hand, and its `shoulder` went at M326 as a word about
   * mantels rather than about the drill. A climber resting a hurt finger
   * should not meet it on the day they are resting it — the same reading
   * M153 put in the logger and M161 on the assessments, rather than a second
   * list of what is safe.
   */
  it('never offers a drill that loads a reported injury', () => {
    for (const injured of [['fingers'], ['shoulder'], ['hip'], ['fingers', 'shoulder']] as const) {
      for (let i = 0; i < 40; i += 1) {
        const drill = restDayDrill(addDays(DAY, i), injured);
        if (drill === null) continue;
        expect(drillConflict(drill, injured), `${drill.id} for ${injured.join('+')}`).toBeNull();
      }
    }
  });

  it('is the wrist one that a hurt finger rules out', () => {
    const offered = new Set<string>();
    for (let i = 0; i < 40; i += 1) offered.add(restDayDrill(addDays(DAY, i), ['fingers'])!.id);
    expect(offered).not.toContain('off_wrist_forearm_prep');
  });

  it('does not rule out a drill for a finger injury on a word about something else', () => {
    // Shoulder CARs was ruled out here until M326, and this test said it was
    // because the shoulder ones load the fingers too. They do not: its
    // paragraph ends *"a shoulder that complains on a high gaston"*, and the
    // scan read `gaston` as open-hand gripping. So was the thoracic opener,
    // whose *"top arm tracing a slow arc"* read as ARC.
    for (const id of ['off_shoulder_cars', 'off_thoracic_opening']) {
      expect(drillConflict(getDrill(id)!, ['fingers']), id).toBeNull();
    }
  });

  it('still has plenty left for a climber with one thing hurt', () => {
    const offered = new Set<string>();
    for (let i = 0; i < 40; i += 1) offered.add(restDayDrill(addDays(DAY, i), ['fingers'])!.id);
    expect(offered.size).toBeGreaterThan(3);
  });

  /**
   * The `| null` in the signature is currently unreachable, and this is the
   * measurement that says so rather than an assumption in a comment. Six of
   * the eleven declare `loads: []` and name no body part in their text, so a
   * climber reporting every part of themselves hurt still gets six.
   *
   * It fails the day an off-wall drill is written that loads something, which
   * is exactly when the null stops being theoretical.
   */
  it('still offers something to a climber who reported everything hurt', () => {
    const ALL = ['fingers', 'pulley', 'wrist', 'elbow', 'shoulder', 'back', 'hip', 'knee', 'ankle'] as const;
    const safe = restDayDrills().filter((d) => drillConflict(d, ALL) === null);
    expect(safe.length).toBe(6);
    expect(safe.every((d) => (d.loads ?? []).length === 0)).toBe(true);
    for (let i = 0; i < 20; i += 1) expect(restDayDrill(addDays(DAY, i), ALL)).not.toBeNull();
  });
});
