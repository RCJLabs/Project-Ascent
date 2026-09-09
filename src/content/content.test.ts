import { describe, expect, it } from 'vitest';
import { DRILLS, filterDrills, getDrill } from './drills';
import { METRICS } from './metrics';
import { PROTOCOLS } from './protocols';
import { IRON_GRIP, PROGRAMS } from './programs';
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
    expect(filterDrills({ category: 'recovery' })).toHaveLength(2);
    expect(filterDrills({ search: 'campus board' }).length).toBeGreaterThan(0);
  });
});
