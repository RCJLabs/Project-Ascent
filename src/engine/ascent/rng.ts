/**
 * Seeded RNG for The Ascent.
 *
 * mulberry32: one 32-bit word of state, uniform enough for spawn tables and
 * fast enough to call a few hundred times a second. The point is not
 * cryptographic quality — it is that a seed and a sequence of inputs
 * reproduce a run exactly, which is what makes the daily wall the same wall
 * for everyone with no backend involved.
 */

export interface Rng {
  seed: number;
}

export function createRng(seed: number): Rng {
  // Keep it in 32-bit unsigned space, and never start at zero.
  return { seed: (seed >>> 0) || 0x9e3779b9 };
}

/** Next float in [0, 1). Advances the state. */
export function next(rng: Rng): number {
  rng.seed = (rng.seed + 0x6d2b79f5) >>> 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, max). */
export function nextInt(rng: Rng, max: number): number {
  return Math.floor(next(rng) * max);
}

/** One item from a weighted table. */
export function pickWeighted<T>(rng: Rng, entries: readonly [T, number][]): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = next(rng) * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1]![0];
}

/**
 * The seed for a given day, from the date alone.
 *
 * Everyone playing on the same date gets the same wall, which is the whole
 * trick — a shared daily challenge with nothing on a server.
 */
export function dailySeed(dateKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < dateKey.length; i++) {
    h ^= dateKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
