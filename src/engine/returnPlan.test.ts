import { describe, expect, it } from 'vitest';
import {
  GENERAL_STEPS,
  PART_STEPS,
  RETURN_DISCLAIMER,
  defaultSteps,
} from '@/content/returnToClimbing';
import type { Injury } from '@/store/profile';
import { addStep, progress, removeStep, stepsFor, toggleStep } from './returnPlan';

const injury = (patch: Partial<Injury> = {}): Injury => ({
  id: 'i1', part: 'pulley', since: '2026-01-01', severity: 'managing', status: 'active', ...patch,
});

/**
 * The content rules, asserted rather than trusted. These are the lines that
 * would turn a memory aid into medical advice, so they are tested like any
 * other invariant.
 */
describe('the checklist must not read as medical advice', () => {
  const everyStep = [
    ...GENERAL_STEPS,
    ...Object.values(PART_STEPS).flat(),
  ].filter((s): s is { id: string; text: string } => s !== undefined);

  it('has steps for every part that has any', () => {
    expect(everyStep.length).toBeGreaterThan(15);
  });

  // "Three sets of fifteen" is medical advice whatever disclaimer sits above it.
  it('prescribes no exercise, dose or load', () => {
    for (const step of everyStep) {
      expect(step.text).not.toMatch(/\b\d+\s*(x|×|sets?|reps?|kg|lb|minutes?|mins?|seconds?|secs?)\b/i);
      expect(step.text).not.toMatch(/\b(perform|do|repeat|complete|apply|ice|stretch|strengthen|massage)\b/i);
    }
  });

  // "Six weeks for a pulley" is the most medical-shaped claim this app
  // could make, and it is wrong often enough to hurt someone.
  it('promises no timeline', () => {
    for (const step of everyStep) {
      // A duration, not the word: "the day after" claims nothing.
      expect(step.text).not.toMatch(/\b(\d+|one|two|three|four|five|six|eight|ten|twelve)\s+(day|week|month)s?\b/i);
      expect(step.text).not.toMatch(/\b(after|within|for)\s+\w+\s+(day|week|month)s?\b/i);
    }
  });

  // Nothing in this app can know whether someone is ready to climb.
  it('never tells the climber they are ready or healed', () => {
    for (const step of everyStep) {
      expect(step.text).not.toMatch(/\b(ready|healed|cured|safe to|cleared|you can now)\b/i);
    }
  });

  it('says out loud what it is not', () => {
    expect(RETURN_DISCLAIMER).toMatch(/not medical advice/i);
    expect(RETURN_DISCLAIMER).toMatch(/doctor|physio/i);
  });

  it('gives every step a stable id', () => {
    const ids = everyStep.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('assembling a list', () => {
  it('is the general prompts plus anything for that part', () => {
    const steps = defaultSteps('pulley');
    expect(steps.length).toBe(GENERAL_STEPS.length + PART_STEPS.pulley!.length);
    expect(stepsFor(injury())).toHaveLength(steps.length);
  });

  it('falls back to the general prompts for a part with none of its own', () => {
    expect(defaultSteps('back').length).toBeGreaterThanOrEqual(GENERAL_STEPS.length);
  });

  it('marks what has been ticked', () => {
    const ticked = injury({ checklist: { rest: true } });
    expect(stepsFor(ticked).find((s) => s.id === 'rest')!.done).toBe(true);
    expect(stepsFor(ticked).find((s) => s.id === 'daily')!.done).toBe(false);
  });
});

describe('making it the climber’s own', () => {
  it('adds a step they wrote', () => {
    const patch = addStep(injury(), '  Physio said: no crimping yet  ');
    expect(patch.ownSteps).toHaveLength(1);
    expect(patch.ownSteps![0]!.text).toBe('Physio said: no crimping yet');
  });

  it('ignores an empty one', () => {
    expect(addStep(injury(), '   ')).toEqual({});
  });

  // A default is hidden rather than deleted, so it does not reappear the
  // next time the app's list changes.
  it('hides a default rather than forgetting it', () => {
    const patch = removeStep(injury(), 'range');
    expect(patch.hiddenSteps).toEqual(['range']);
    expect(stepsFor(injury(patch)).some((s) => s.id === 'range')).toBe(false);
  });

  it('deletes one they wrote outright', () => {
    const withOwn = injury(addStep(injury(), 'Mine'));
    const id = withOwn.ownSteps![0]!.id;
    const patch = removeStep(withOwn, id);
    expect(patch.ownSteps).toEqual([]);
  });

  // A step nobody can see must not still count toward a total.
  it('drops the tick when a step goes', () => {
    const ticked = injury({ checklist: { range: true, rest: true } });
    const patch = removeStep(ticked, 'range');
    expect(patch.checklist).toEqual({ rest: true });
  });

  it('does not hide the same default twice', () => {
    const once = injury(removeStep(injury(), 'range'));
    expect(removeStep(once, 'range').hiddenSteps).toEqual(['range']);
  });
});

describe('ticking', () => {
  it('toggles both ways', () => {
    const on = toggleStep(injury(), 'rest');
    expect(on.checklist).toEqual({ rest: true });
    expect(toggleStep(injury(on), 'rest').checklist).toEqual({});
  });

  it('counts what is done out of what is listed', () => {
    const some = injury({ checklist: { rest: true, daily: true } });
    const p = progress(some);
    expect(p.done).toBe(2);
    expect(p.total).toBe(stepsFor(some).length);
  });

  it('counts a hidden step out of the total, not merely out of the ticks', () => {
    const before = progress(injury()).total;
    expect(progress(injury(removeStep(injury(), 'range'))).total).toBe(before - 1);
  });

  // An app that paid climbers to tick boxes about their own body would be
  // teaching them to lie to it. There is no threshold here on purpose.
  it('reports a count and nothing that reads as a verdict', () => {
    const all = stepsFor(injury()).reduce<Record<string, boolean>>((acc, s) => ({ ...acc, [s.id]: true }), {});
    const complete = progress(injury({ checklist: all }));
    expect(complete.done).toBe(complete.total);
    expect(Object.keys(complete)).toEqual(['done', 'total']);
  });
});
