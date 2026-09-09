import { describe, expect, it } from 'vitest';
import { DRILLS, filterDrills, getDrill } from './drills';
import { getMetric, METRICS } from './metrics';
import { PROTOCOLS } from './protocols';
import { BASE_CAMP, GRAVITY_DEFIED, GROUND_ZERO, IRON_GRIP, LOCKDOWN, PROGRAMS } from './programs';
import { parseCount, phaseForWeek } from './types';
import { validateCatalog, validateProgram } from './validate';

describe('catalog integrity', () => {
  it('every ported program validates', () => {
    expect(validateCatalog(PROGRAMS)).toEqual([]);
  });

  it('drill ids are unique', () => {
    const ids = DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('registry entries are keyed by their own id', () => {
    for (const [key, metric] of Object.entries(METRICS)) expect(metric.id).toBe(key);
    for (const [key, protocol] of Object.entries(PROTOCOLS)) expect(protocol.id).toBe(key);
  });

  it('catches a broken drill reference', () => {
    const broken = structuredClone(IRON_GRIP);
    broken.sessionTypes[1]!.drillsByWeek![3] = 'does_not_exist';
    expect(validateProgram(broken).join(' ')).toMatch(/unknown drill 'does_not_exist'/);
  });

  it('catches a phase gap', () => {
    const broken = structuredClone(IRON_GRIP);
    broken.phases[1]!.weekStart = 6;
    expect(validateProgram(broken).join(' ')).toMatch(/starts at week 6, expected 5/);
  });

  it('catches a block missing a phase', () => {
    const broken = structuredClone(IRON_GRIP);
    delete broken.sessionTypes[0]!.blocks![0]!.perPhase['spark'];
    expect(validateProgram(broken).join(' ')).toMatch(/missing phase 'spark'/);
  });
});

describe('Iron Grip', () => {
  it('is a 12-week program in three phases', () => {
    expect(IRON_GRIP.weeks).toBe(12);
    expect(IRON_GRIP.phases.map((p) => p.name)).toEqual([
      'The Anvil (Repeaters)',
      'The Hammer (Max Hangs)',
      'The Spark (Campus)',
    ]);
  });

  it('maps every week to a phase', () => {
    for (let week = 1; week <= 12; week++) {
      expect(phaseForWeek(IRON_GRIP, week), `week ${week}`).toBeDefined();
    }
    expect(phaseForWeek(IRON_GRIP, 13)).toBeUndefined();
    expect(phaseForWeek(IRON_GRIP, 4)!.id).toBe('anvil');
    expect(phaseForWeek(IRON_GRIP, 5)!.id).toBe('hammer');
  });

  it('prescribes the phase-appropriate finger protocol', () => {
    const block = IRON_GRIP.sessionTypes[0]!.blocks!.find((b) => b.id === 'finger_protocol')!;
    expect(block.perPhase['anvil']!.exercises[0]!.protocolId).toBe('repeaters_7_3');
    expect(block.perPhase['hammer']!.exercises[0]!.protocolId).toBe('max_hangs_10s');
    expect(block.perPhase['spark']!.exercises.map((e) => e.name)).toEqual([
      'Campus Laddering',
      'Campus Skips',
      'Campus Double Dynos',
    ]);
  });

  it('separates dosage from the exercise name', () => {
    const maxHang = IRON_GRIP.sessionTypes[0]!.blocks![0]!.perPhase['hammer']!.exercises[0]!;
    expect(maxHang.name).toBe('Max Hangs');
    expect(maxHang.hold).toBe('10s');
    expect(maxHang.sets).toBe('5');
    expect(maxHang.load).toBe('85-90% max added weight');
    expect(maxHang.rest).toBe('3-5 min');
  });

  it('carries the scheduling rules as data, not only prose', () => {
    const kinds = IRON_GRIP.constraints.map((c) => c.kind);
    expect(kinds).toContain('min-gap-hours');
    expect(kinds).toContain('not-before');
    const gap = IRON_GRIP.constraints.find((c) => c.kind === 'min-gap-hours')!;
    expect(gap).toMatchObject({ between: ['fp'], hours: 48 });
  });

  it('has a recommended layout that respects the finger-session gap', () => {
    const slots = IRON_GRIP.recommendedLayout!.slots;
    const fingerDays = Object.entries(slots)
      .filter(([, type]) => type === 'fp')
      .map(([day]) => Number(day));
    expect(fingerDays).toHaveLength(2);
    const gapHours = (fingerDays[1]! - fingerDays[0]!) * 24;
    expect(gapHours).toBeGreaterThanOrEqual(48);
  });

  it('resolves all twelve weekly drills', () => {
    const byWeek = IRON_GRIP.sessionTypes.find((t) => t.id === 'perf')!.drillsByWeek!;
    expect(Object.keys(byWeek)).toHaveLength(12);
    for (let week = 1; week <= 12; week++) {
      expect(getDrill(byWeek[week]!), `week ${week}`).toBeDefined();
    }
    expect(getDrill(byWeek[4]!)!.category).toBe('recovery');
    expect(getDrill(byWeek[12]!)!.category).toBe('assessment');
  });
});

describe('Ground Zero', () => {
  it('is a blocks-only program with no drills', () => {
    expect(GROUND_ZERO.weeks).toBe(12);
    for (const type of GROUND_ZERO.sessionTypes) {
      expect(type.drillsByWeek).toBeUndefined();
    }
    expect(GROUND_ZERO.sessionTypes.filter((t) => t.blocks).length).toBe(2);
  });

  it('keeps structural days apart', () => {
    const gap = GROUND_ZERO.constraints.find((c) => c.kind === 'min-gap-hours');
    expect(gap).toMatchObject({ between: ['str'], hours: 48 });
    const slots = GROUND_ZERO.recommendedLayout!.slots;
    const strDays = Object.entries(slots)
      .filter(([, t]) => t === 'str')
      .map(([d]) => Number(d));
    for (let i = 1; i < strDays.length; i++) {
      expect(strDays[i]! - strDays[i - 1]!).toBeGreaterThanOrEqual(2);
    }
  });

  it('runs its core work as timed rounds', () => {
    const core = GROUND_ZERO.sessionTypes
      .find((t) => t.id === 'mob')!
      .blocks!.find((b) => b.id === 'core_pillar')!;
    expect(core.perPhase['alignment']!.circuit).toMatchObject({ rounds: '3', restBetweenRounds: '60s' });
    // All exercises prescribed — not a pick-from-pool circuit.
    expect(core.perPhase['alignment']!.circuit!.pick).toBeUndefined();
  });

  it('tracks a metric where lower is better', () => {
    expect(GROUND_ZERO.assessments).toContain('toe_touch');
    expect(getMetric('toe_touch')!.higherIsBetter).toBe(false);
  });
});

describe('Base Camp', () => {
  it('declares two tracks and tags every Engine Room strength line', () => {
    expect(BASE_CAMP.tracks!.map((t) => t.id)).toEqual(['A', 'B']);
    const engine = BASE_CAMP.sessionTypes.find((t) => t.id === 'eng')!;
    for (const block of engine.blocks!) {
      if (block.id === 'core_circuit') continue; // core is shared across tracks
      for (const [phaseId, entry] of Object.entries(block.perPhase)) {
        if (entry.mergedInto) continue;
        const tracks = entry.exercises.map((e) => e.track);
        expect(tracks, `${block.id}/${phaseId}`).toEqual(['A', 'B']);
      }
    }
  });

  it('models the core circuit as a pool with a selection rule', () => {
    const core = BASE_CAMP.sessionTypes
      .find((t) => t.id === 'eng')!
      .blocks!.find((b) => b.id === 'core_circuit')!;
    expect(core.perPhase['foundation']!.exercises).toHaveLength(9);
    expect(core.perPhase['foundation']!.circuit).toMatchObject({ pick: 5, rounds: '2' });
    // Phase 3 trims the selection, not the pool.
    expect(core.perPhase['headspace']!.circuit!.pick).toBe(3);
    expect(core.perPhase['headspace']!.exercises).toHaveLength(9);
  });

  it('merges Pull into Push for the final phase', () => {
    const pull = BASE_CAMP.sessionTypes
      .find((t) => t.id === 'eng')!
      .blocks!.find((b) => b.id === 'pull')!;
    expect(pull.perPhase['headspace']!.mergedInto).toBe('push');
    expect(pull.perPhase['headspace']!.exercises).toHaveLength(0);
    expect(pull.perPhase['foundation']!.exercises.length).toBeGreaterThan(0);
  });

  it('rejects a track that is not declared', () => {
    const broken = structuredClone(BASE_CAMP);
    broken.sessionTypes.find((t) => t.id === 'eng')!.blocks![0]!.perPhase['foundation']!.exercises[0]!.track =
      'Z';
    expect(validateProgram(broken).join(' ')).toMatch(/undeclared track 'Z'/);
  });

  it('rejects a circuit asking for more exercises than the pool holds', () => {
    const broken = structuredClone(BASE_CAMP);
    const core = broken.sessionTypes.find((t) => t.id === 'eng')!.blocks!.find((b) => b.id === 'core_circuit')!;
    core.perPhase['foundation']!.circuit!.pick = 99;
    expect(validateProgram(broken).join(' ')).toMatch(/asks for 99 of 9 exercises/);
  });

  it('rejects a merge into a block that does not exist', () => {
    const broken = structuredClone(BASE_CAMP);
    const pull = broken.sessionTypes.find((t) => t.id === 'eng')!.blocks!.find((b) => b.id === 'pull')!;
    pull.perPhase['headspace']!.mergedInto = 'nope';
    expect(validateProgram(broken).join(' ')).toMatch(/merges into unknown block 'nope'/);
  });
});

describe('Gravity Defied', () => {
  it('drives two separate session types from the drill library', () => {
    const drillDriven = GRAVITY_DEFIED.sessionTypes.filter((t) => t.drillsByWeek);
    expect(drillDriven.map((t) => t.id)).toEqual(['tech', 'perf']);
    // The two tracks of drills must not collide on any week.
    for (let week = 1; week <= 12; week++) {
      const ids = drillDriven.map((t) => t.drillsByWeek![week]);
      expect(new Set(ids).size, `week ${week}`).toBe(2);
    }
  });

  it('shares one armor prescription across all phases', () => {
    const armor = GRAVITY_DEFIED.sessionTypes
      .find((t) => t.id === 'eng')!
      .blocks!.find((b) => b.id === 'armor')!;
    const names = Object.values(armor.perPhase).map((p) => p.exercises.map((e) => e.name).join());
    expect(new Set(names).size).toBe(1);
    // ...while the coaching differs every phase.
    const rationales = Object.values(armor.perPhase).map((p) => p.rationale);
    expect(new Set(rationales).size).toBe(3);
  });
});

describe('Lockdown', () => {
  it('states its entry requirement as checkable data', () => {
    expect(LOCKDOWN.prerequisites!.metrics).toEqual([{ metricId: 'max_boulder_grade', atLeast: 3 }]);
    expect(LOCKDOWN.prerequisites!.note).toMatch(/V3/);
  });

  it('wires the static-strength protocols into its lock-off progression', () => {
    const lockOff = LOCKDOWN.sessionTypes
      .find((t) => t.id === 'sa')!
      .blocks!.find((b) => b.id === 'lock_off')!;
    expect(Object.values(lockOff.perPhase).map((p) => p.exercises[0]!.protocolId)).toEqual([
      'frenchies',
      'offset_lock_offs',
      'one_arm_negatives',
    ]);
  });

  it('caps and spaces the heavy session', () => {
    const cap = LOCKDOWN.constraints.find((c) => c.kind === 'max-per-week');
    expect(cap).toMatchObject({ sessionTypeId: 'sa', count: 2 });
    const gap = LOCKDOWN.constraints.find((c) => c.kind === 'min-gap-hours');
    expect(gap).toMatchObject({ between: ['sa'], hours: 48 });
  });
});

describe('library coverage', () => {
  it('every drill is used by at least one program', () => {
    const referenced = new Set<string>();
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const id of Object.values(type.drillsByWeek ?? {})) referenced.add(id);
      }
    }
    const orphans = DRILLS.filter((d) => !referenced.has(d.id)).map((d) => d.id);
    expect(orphans).toEqual([]);
  });

  it('every protocol is used by at least one program', () => {
    const referenced = new Set<string>();
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const block of type.blocks ?? []) {
          for (const entry of Object.values(block.perPhase)) {
            for (const ex of entry.exercises) if (ex.protocolId) referenced.add(ex.protocolId);
          }
        }
      }
    }
    expect(Object.keys(PROTOCOLS).filter((id) => !referenced.has(id))).toEqual([]);
  });
});

describe('helpers', () => {
  it('parses the leading count out of a dosage string', () => {
    expect(parseCount('3')).toBe(3);
    expect(parseCount('3-5')).toBe(3);
    expect(parseCount('12 per arm')).toBe(12);
    expect(parseCount('1-2-3-4-5 matched')).toBe(1);
    expect(parseCount(undefined)).toBeNull();
    expect(parseCount('as many as possible')).toBeNull();
  });

  it('filters drills by equipment availability', () => {
    const noGear = filterDrills({ equipment: [] }).map((d) => d.id);
    expect(noGear).toContain('the_crimp_project');
    expect(noGear).not.toContain('contact_strength_projecting');

    const withCampus = filterDrills({ equipment: ['campus'] }).map((d) => d.id);
    expect(withCampus).toContain('contact_strength_projecting');
  });

  it('filters drills by category and search', () => {
    const recovery = filterDrills({ category: 'recovery' });
    expect(recovery.length).toBeGreaterThan(0);
    expect(recovery.every((d) => d.category === 'recovery')).toBe(true);
    expect(filterDrills({ search: 'campus board' }).length).toBeGreaterThan(0);
    expect(filterDrills({ search: 'no drill mentions this' })).toHaveLength(0);
  });
});
