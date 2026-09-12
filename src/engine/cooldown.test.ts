import { describe, expect, it } from 'vitest';
import { COOLDOWN_EXERCISES, type CooldownExercise } from '@/content/cooldowns';
import { DEFAULT_COOLDOWN_SECONDS, describeCooldown, generateCooldown } from './cooldown';

/**
 * M112. The warmup's counterpart, and a smaller machine than the warmup —
 * the milestone is as much what this refuses to do as what it does.
 */

const ex = (id: string, targets: CooldownExercise['targets'], seconds = 60): CooldownExercise => ({
  id,
  name: id,
  description: id,
  seconds,
  targets,
});

describe('filling the time', () => {
  it('reaches the length the guide asks for', () => {
    const plan = generateCooldown();
    expect(plan.totalSeconds).toBeGreaterThanOrEqual(DEFAULT_COOLDOWN_SECONDS);
  });

  it('stops rather than running the whole library', () => {
    // Three minutes, not twelve stretches. A cooldown that overshoots is one
    // a tired climber abandons halfway.
    const plan = generateCooldown();
    expect(plan.exercises.length).toBeLessThan(COOLDOWN_EXERCISES.length);
  });

  it('takes a longer one when asked', () => {
    const short = generateCooldown({ targetSeconds: 120 });
    const long = generateCooldown({ targetSeconds: 300 });
    expect(long.totalSeconds).toBeGreaterThan(short.totalSeconds);
  });

  it('counts the seconds it actually chose', () => {
    const plan = generateCooldown();
    const summed = plan.exercises.reduce((n, e) => n + e.seconds, 0);
    expect(plan.totalSeconds).toBe(summed);
  });

  it('hands back nothing from an empty library rather than looping', () => {
    const plan = generateCooldown({ library: [] });
    expect(plan.exercises).toEqual([]);
    expect(plan.totalSeconds).toBe(0);
    expect(plan.injuryFilterRelaxed).toBe(false);
  });
});

describe('weighted by what the session loaded', () => {
  const library = [
    ex('hip-a', ['hip']),
    ex('hip-b', ['hip']),
    ex('ankle', ['ankle']),
    ex('shoulder', ['shoulder']),
    ex('fingers', ['fingers']),
  ];

  it('puts what the session worked first', () => {
    const plan = generateCooldown({ loaded: ['fingers'], library, targetSeconds: 60 });
    expect(plan.exercises[0]?.id).toBe('fingers');
  });

  it('prefers one that reaches more of what was loaded', () => {
    const wide = ex('wide', ['fingers', 'shoulder']);
    const plan = generateCooldown({
      loaded: ['fingers', 'shoulder'],
      library: [...library, wide],
      targetSeconds: 60,
    });
    expect(plan.exercises[0]?.id).toBe('wide');
  });

  it('still produces a cooldown when the session loaded nothing readable', () => {
    // Most sessions carry no prose. A cooldown that needed one would be a
    // cooldown almost nobody ever sees.
    const plan = generateCooldown({ loaded: [], library });
    expect(plan.exercises.length).toBeGreaterThan(0);
  });

  it('reports which loaded parts it actually reached', () => {
    const plan = generateCooldown({ loaded: ['fingers'], library, targetSeconds: 60 });
    expect(plan.covered).toEqual(['fingers']);
  });

  it('does not claim to cover a part nothing in it works', () => {
    // `pulley` is in the tissue scan and nothing stretches one. Saying the
    // cooldown covered it would be the card lying about its own contents.
    const plan = generateCooldown({ loaded: ['pulley'], library, targetSeconds: 60 });
    expect(plan.covered).toEqual([]);
  });

  it('does not claim a part it left in the library', () => {
    // The harder case: something for it existed, the fill stage stopped
    // before reaching it. Reading the pool rather than the chosen set makes
    // the card name a stretch the climber was never given.
    const plan = generateCooldown({
      loaded: ['fingers', 'ankle'],
      library: [ex('fingers', ['fingers']), ex('ankle', ['ankle'])],
      targetSeconds: 30,
    });
    expect(plan.exercises).toHaveLength(1);
    expect(plan.covered).toEqual(plan.exercises.flatMap((e) => e.targets));
  });
});

describe('an injured part is left alone, never treated', () => {
  const library = [ex('hip', ['hip']), ex('shoulder', ['shoulder']), ex('ankle', ['ankle'])];

  it('leaves out anything that works it', () => {
    const plan = generateCooldown({ injuries: ['shoulder'], library });
    expect(plan.exercises.map((e) => e.id)).not.toContain('shoulder');
  });

  it('names what it left out and why', () => {
    const plan = generateCooldown({ injuries: ['shoulder'], library });
    expect(plan.excluded).toHaveLength(1);
    expect(plan.excluded[0]?.part).toBe('shoulder');
    expect(plan.excluded[0]?.exercise.id).toBe('shoulder');
  });

  it('does not weight toward an injured part even when the session loaded it', () => {
    // The trap this milestone exists to avoid: a session that hammered an
    // injured shoulder is exactly when a naive "weight toward what was
    // loaded" would prescribe shoulder work. Injury wins over relevance.
    const plan = generateCooldown({ loaded: ['shoulder'], injuries: ['shoulder'], library });
    expect(plan.exercises.map((e) => e.id)).not.toContain('shoulder');
  });

  it('relaxes rather than returning nothing when everything is out', () => {
    const plan = generateCooldown({ injuries: ['hip', 'shoulder', 'ankle'], library });
    expect(plan.injuryFilterRelaxed).toBe(true);
    expect(plan.exercises.length).toBeGreaterThan(0);
  });

  it('does not claim to have relaxed when it did not need to', () => {
    expect(generateCooldown({ library }).injuryFilterRelaxed).toBe(false);
    expect(generateCooldown({ injuries: ['hip'], library }).injuryFilterRelaxed).toBe(false);
  });

  it('does not relax an empty library into something', () => {
    expect(generateCooldown({ injuries: ['hip'], library: [] }).injuryFilterRelaxed).toBe(false);
  });
});

describe('the same seed is the same cooldown', () => {
  it('repeats exactly', () => {
    const a = generateCooldown({ seed: 7 });
    const b = generateCooldown({ seed: 7 });
    expect(a.exercises.map((e) => e.id)).toEqual(b.exercises.map((e) => e.id));
  });

  it('re-rolls on a different one', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
      generateCooldown({ seed }).exercises.map((e) => e.id).join(),
    );
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });

  it('re-rolls ties without dislodging what the session loaded', () => {
    // The seed is allowed to change the order inside a rank and nothing
    // else: a swap that stopped stretching what you just worked would be
    // the feature quietly switching itself off.
    const library = [ex('hip-a', ['hip']), ex('hip-b', ['hip']), ex('ankle', ['ankle'])];
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const plan = generateCooldown({ loaded: ['ankle'], library, targetSeconds: 60, seed });
      expect(plan.exercises[0]?.id).toBe('ankle');
    }
  });
});

describe('what the card says', () => {
  it('names the parts it is weighted toward', () => {
    const library = [ex('fingers', ['fingers']), ex('hip', ['hip'])];
    const line = describeCooldown(generateCooldown({ loaded: ['fingers'], library, targetSeconds: 60 }));
    expect(line).toContain('fingers');
  });

  it('says nothing rather than saying something empty', () => {
    // A card that always has a sentence is a card the climber stops reading.
    const library = [ex('hip', ['hip'])];
    expect(describeCooldown(generateCooldown({ loaded: [], library }))).toBe(null);
    expect(describeCooldown(generateCooldown({ library: [] }))).toBe(null);
  });

  it('reads as a list when there is more than one', () => {
    const library = [ex('wide', ['fingers', 'shoulder', 'hip'])];
    const line = describeCooldown(
      generateCooldown({ loaded: ['fingers', 'shoulder', 'hip'], library, targetSeconds: 30 }),
    );
    expect(line).toContain('fingers, shoulder and hip');
  });

  it('claims nothing about what it does to you', () => {
    // The milestone's own "never". Not prevention, not recovery, not repair.
    const line = describeCooldown(generateCooldown({ loaded: ['hip'] })) ?? '';
    expect(line).not.toMatch(/prevent|recover|repair|heal|protect|reduce|avoid/i);
  });
});

describe('the library itself', () => {
  // The signal is dose and named lifts, not any word that also appears in a
  // stretch. "Gently press the back of the hand" is an instruction;
  // "Overhead Press, 3x12" is a training block wearing a cooldown's hat.
  const readsAsPrehab = (text: string) =>
    /\b\d+\s*(sets?|reps?|rounds?)\b|\b\d+\s*[x\u00d7]\s*\d+\b/i.test(text) ||
    /\b(overhead|bench|shoulder|floor)\s+press\b|\b(bicep|hammer|wrist|reverse)\s+curls?\b|\bface\s+pulls?\b|\b(pull|chin)-?ups?\b|\bdips?\b|\brows?\b|\bexternal\s+rotations?\b/i.test(
      text,
    );

  it('would notice prehab if any arrived', () => {
    // Without this the guard below passes on an empty regex just as happily.
    // These are the programs' own words, from Lockdown's Antagonist block and
    // Two Days a Week's prehab dose.
    expect(readsAsPrehab('Dips if you have rings or parallel bars; Overhead Press with dumbbells')).toBe(true);
    expect(readsAsPrehab('Hammer Curls specifically build the brachioradialis')).toBe(true);
    expect(readsAsPrehab('Light weight, high rep, controlled tempo. 3 sets')).toBe(true);
    expect(readsAsPrehab('2x15 with a band')).toBe(true);
    // And does not fire on the stretch instruction that made it too broad.
    expect(readsAsPrehab('gently press the back of the hand toward you')).toBe(false);
  });

  it('is all stretches, not prehab', () => {
    // Nine programs prescribe antagonist and armor work in thirteen real
    // blocks. A cooldown that generated a second set of it would be
    // competing with the program the climber is running.
    const offenders = COOLDOWN_EXERCISES.filter((e) => readsAsPrehab(`${e.name} ${e.description}`));
    expect(offenders.map((e) => e.name)).toEqual([]);
  });

  it('is not ballistic, which the guide names', () => {
    const offenders = COOLDOWN_EXERCISES.filter((e) =>
      /\b(bounce|bouncing|ballistic|swing|jerk|pulse)\b/i.test(`${e.name} ${e.description}`),
    );
    expect(offenders.map((e) => e.name)).toEqual([]);
  });

  it('covers the three areas the guide promises', () => {
    const all = new Set(COOLDOWN_EXERCISES.flatMap((e) => e.targets));
    // "Light stretches for shoulders, forearms, and hips" — the forearm is
    // wrist, elbow and fingers in the body-part vocabulary.
    expect(all.has('shoulder')).toBe(true);
    expect(all.has('hip')).toBe(true);
    expect(all.has('wrist') || all.has('fingers') || all.has('elbow')).toBe(true);
  });

  it('gives every exercise something to target', () => {
    // An exercise targeting nothing can never be chosen for a reason and
    // can never be excluded for one either.
    expect(COOLDOWN_EXERCISES.filter((e) => e.targets.length === 0)).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = COOLDOWN_EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('holds enough to fill the guide\'s upper range', () => {
    const total = COOLDOWN_EXERCISES.reduce((n, e) => n + e.seconds, 0);
    expect(total).toBeGreaterThanOrEqual(300);
  });
});
