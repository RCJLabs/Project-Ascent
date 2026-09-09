/**
 * Assembling one climber's return-to-climbing list (M8).
 *
 * The content module owns what the prompts say and why they are shaped that
 * way; this owns whose list it is. Defaults can be removed and replaced,
 * because the moment a physiotherapist gives real criteria, theirs should
 * be the ones on the screen.
 */

import { defaultSteps, type ReturnStep } from '@/content/returnToClimbing';
import type { Injury } from '@/store/profile';

export interface ListedStep extends ReturnStep {
  /** True for a step the climber wrote, which can be edited and deleted. */
  own: boolean;
  done: boolean;
}

export const OWN_STEP_PREFIX = 'own-';

export function newStepId(): string {
  return `${OWN_STEP_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** The climber's list: the defaults they kept, then the ones they wrote. */
export function stepsFor(injury: Injury): ListedStep[] {
  const hidden = new Set(injury.hiddenSteps ?? []);
  const ticked = injury.checklist ?? {};
  const defaults = defaultSteps(injury.part)
    .filter((step) => !hidden.has(step.id))
    .map((step) => ({ ...step, own: false, done: ticked[step.id] === true }));
  const own = (injury.ownSteps ?? []).map((step) => ({
    ...step,
    own: true,
    done: ticked[step.id] === true,
  }));
  return [...defaults, ...own];
}

export interface ReturnProgress {
  done: number;
  total: number;
}

/**
 * How much of the list is ticked.
 *
 * A count and nothing else. There is deliberately no "ready" threshold, no
 * percentage rendered as a verdict, and nothing anywhere that reads this to
 * grant, unlock or reward — an app that paid climbers to tick boxes about
 * their own body would be teaching them to lie to it.
 */
export function progress(injury: Injury): ReturnProgress {
  const steps = stepsFor(injury);
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

export function toggleStep(injury: Injury, stepId: string): Partial<Injury> {
  const checklist = { ...(injury.checklist ?? {}) };
  if (checklist[stepId]) delete checklist[stepId];
  else checklist[stepId] = true;
  return { checklist };
}

export function addStep(injury: Injury, text: string): Partial<Injury> {
  const trimmed = text.trim().slice(0, 240);
  if (!trimmed) return {};
  return { ownSteps: [...(injury.ownSteps ?? []), { id: newStepId(), text: trimmed }] };
}

/**
 * Remove a step.
 *
 * A default is hidden rather than deleted, so it does not reappear the next
 * time the app updates its list; one the climber wrote is simply gone. The
 * tick is dropped either way — leaving it behind would mean a step nobody
 * can see still counting toward a total.
 */
export function removeStep(injury: Injury, stepId: string): Partial<Injury> {
  const checklist = { ...(injury.checklist ?? {}) };
  delete checklist[stepId];

  if (stepId.startsWith(OWN_STEP_PREFIX)) {
    return { checklist, ownSteps: (injury.ownSteps ?? []).filter((s) => s.id !== stepId) };
  }
  return { checklist, hiddenSteps: [...new Set([...(injury.hiddenSteps ?? []), stepId])] };
}
