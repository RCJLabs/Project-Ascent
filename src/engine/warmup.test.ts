import { describe, expect, it } from 'vitest';
import { IRON_GRIP, THE_LONG_GAME } from '@/content/programs/catalogue';
import { WARMUP_EXERCISES } from '@/content/warmups';
import { DEFAULT_TARGET_SECONDS, focusFor, generateWarmup } from './warmup';

const ALL: Parameters<typeof generateWarmup>[0]['equipment'] = ['wall', 'hangboard', 'campus', 'gym'];

describe('generateWarmup', () => {
  it('reaches the target length', () => {
    const plan = generateWarmup({ equipment: ALL, seed: 1 });
    expect(plan.totalSeconds).toBeGreaterThanOrEqual(DEFAULT_TARGET_SECONDS);
    expect(plan.exercises.length).toBeGreaterThan(2);
  });

  it('always opens with a pulse raiser', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const plan = generateWarmup({ equipment: ALL, seed });
      expect(plan.exercises[0]!.category, `seed ${seed}`).toBe('pulse');
    }
  });

  it('never prescribes equipment you do not have', () => {
    const plan = generateWarmup({ equipment: [], seed: 3 });
    for (const e of plan.exercises) {
      expect(e.equipment.every((x) => x === 'none'), e.id).toBe(true);
    }
  });

  it('excludes exercises that load an injured part, and says which', () => {
    const plan = generateWarmup({ equipment: ALL, injuries: ['pulley'], seed: 5 });
    for (const e of plan.exercises) {
      expect(e.loads, e.id).not.toContain('pulley');
    }
    expect(plan.excluded.length).toBeGreaterThan(0);
    expect(plan.excluded.every((x) => x.part === 'pulley')).toBe(true);
    expect(plan.injuryFilterRelaxed).toBe(false);
  });

  it('handles several injuries at once', () => {
    const plan = generateWarmup({ equipment: ALL, injuries: ['shoulder', 'knee'], seed: 7 });
    for (const e of plan.exercises) {
      expect(e.loads).not.toContain('shoulder');
      expect(e.loads).not.toContain('knee');
    }
  });

  it('still produces a warmup when every body part is injured', () => {
    // The library deliberately contains work that loads no tissue, so the
    // filter is always satisfiable and no relaxation is needed.
    const everyPart = [...new Set(WARMUP_EXERCISES.flatMap((e) => e.loads))];
    const plan = generateWarmup({ equipment: ALL, injuries: everyPart, seed: 9 });
    expect(plan.exercises.length).toBeGreaterThan(0);
    expect(plan.injuryFilterRelaxed).toBe(false);
    for (const e of plan.exercises) expect(e.loads, e.id).toEqual([]);
  });

  it('keeps at least one off-wall warmup that loads nothing', () => {
    // The invariant the test above depends on.
    const harmless = WARMUP_EXERCISES.filter((e) => e.category !== 'climbing' && e.loads.length === 0);
    expect(harmless.length).toBeGreaterThan(0);
  });

  it('relaxes the filter rather than returning nothing', () => {
    // A library where everything loads something — the fallback path.
    const plan = generateWarmup({
      equipment: ALL,
      injuries: ['shoulder'],
      seed: 9,
      library: [
        {
          id: 'only_option',
          name: 'Only option',
          description: '',
          seconds: 120,
          category: 'pulse',
          equipment: ['none'],
          loads: ['shoulder'],
        },
      ],
    });
    expect(plan.exercises).toHaveLength(1);
    expect(plan.injuryFilterRelaxed).toBe(true);
  });

  it('prefers exercises not done recently', () => {
    const first = generateWarmup({ equipment: ALL, seed: 11 });
    const recent = first.exercises.map((e) => e.id);
    const second = generateWarmup({ equipment: ALL, recent, seed: 11 });
    const repeats = second.exercises.filter((e) => recent.includes(e.id)).length;
    expect(repeats).toBeLessThan(second.exercises.length);
  });

  it('adds wall work only for climbing sessions', () => {
    const climbing = generateWarmup({ equipment: ALL, climbing: true, seed: 13 });
    expect(climbing.exercises.some((e) => e.category === 'climbing')).toBe(true);
    const offWall = generateWarmup({ equipment: ALL, climbing: false, seed: 13 });
    expect(offWall.exercises.some((e) => e.category === 'climbing')).toBe(false);
  });

  it('biases toward the requested focus', () => {
    const plan = generateWarmup({ equipment: ALL, focus: 'fingers', seed: 17 });
    expect(plan.exercises.filter((e) => e.category === 'fingers').length).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const a = generateWarmup({ equipment: ALL, seed: 42 });
    const b = generateWarmup({ equipment: ALL, seed: 42 });
    expect(a.exercises.map((e) => e.id)).toEqual(b.exercises.map((e) => e.id));
  });
});

describe('focusFor', () => {
  it('reads the phase name before the session id', () => {
    const fp = IRON_GRIP.sessionTypes.find((t) => t.id === 'fp')!;
    expect(focusFor(fp, 'The Hammer (Max Hangs)')).toBe('fingers');
    // A climbing session inside a hangboard phase still warms the fingers.
    const perf = IRON_GRIP.sessionTypes.find((t) => t.id === 'perf')!;
    expect(focusFor(perf, 'The Anvil (Repeaters)')).toBe('fingers');
  });

  it('falls back to the session id', () => {
    const end = THE_LONG_GAME.sessionTypes.find((t) => t.id === 'end')!;
    expect(focusFor(end, 'The Base (ARC)')).toBe('pulse');
  });

  it('scans keywords for unknown session types', () => {
    expect(
      focusFor({ id: 'custom', name: 'Core & Tension', icon: '', description: 'body tension work' }),
    ).toBe('core');
    expect(focusFor({ id: 'x', name: 'Mystery', icon: '', description: '' })).toBeUndefined();
  });
});
