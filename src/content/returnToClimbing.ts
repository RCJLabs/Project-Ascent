/**
 * Return-to-climbing checklists (PLAN.md §9.7, M8).
 *
 * ## What this is not
 *
 * It is not a rehabilitation protocol, and it must never read like one. This
 * app cannot see your injury, does not know what it is, and has no business
 * telling anyone how to treat one. So there are three hard rules about every
 * line below, and they are the reason the content looks the way it does:
 *
 * 1. **No treatment.** Nothing here prescribes an exercise, a dose, a load
 *    or a stretch. The moment a checklist says "three sets of fifteen finger
 *    extensions" it is giving medical advice, whatever disclaimer sits above
 *    it.
 * 2. **No timelines.** "Six weeks for a pulley" is the most medical-shaped
 *    claim a training app could make, and it is wrong often enough to hurt
 *    someone. Tissue heals at its own pace and nothing here guesses at it.
 * 3. **Observations, not permissions.** Every line is something a climber
 *    notices about their own body, phrased as a question they answer. None
 *    of them says you are ready, because nothing in this app can know that.
 *
 * ## Why it exists anyway
 *
 * Because coming back from an injury takes months and the useful thing —
 * "has this actually been painless for a week, or did I just want it to
 * be?" — is a memory problem, and memory is what a log is for. The list is a
 * place to be honest with yourself over time, and a place to write down what
 * an actual clinician told you so it does not get lost.
 *
 * Every step is editable and removable for that reason. If a physio gives
 * you real criteria, theirs should replace ours.
 *
 * ## What ticking them does
 *
 * Nothing. No XP, no vitality, no status change, no unlock. An app that
 * rewarded ticking boxes about your own body would be teaching climbers to
 * lie to it, and the one place that must never happen is here.
 */

import type { BodyPart } from './warmups';

export interface ReturnStep {
  id: string;
  /** Phrased as something the climber observes, never as an instruction. */
  text: string;
}

export const RETURN_DISCLAIMER =
  'This is a place to keep your own notes, not medical advice. This app cannot see your injury or tell you when it is better — a doctor or physiotherapist can. If something hurts, that is a reason to ask one, not a reason to tick a box.';

/**
 * The prompts that apply whatever is hurt.
 *
 * Deliberately generic. Part-specific detail below stays at the level of
 * "can you do this without symptoms", never "do this".
 */
export const GENERAL_STEPS: ReturnStep[] = [
  { id: 'seen', text: 'Someone qualified has looked at it, and I have written down what they said.' },
  { id: 'rest', text: 'It has been quiet at rest — no ache sitting still — for long enough that I trust it.' },
  { id: 'daily', text: 'Ordinary life does not aggravate it: carrying, opening things, sleeping on it.' },
  { id: 'range', text: 'It moves as far as the other side does, without guarding it.' },
  { id: 'next-day', text: 'The day after easy climbing feels the same as the day before it.' },
  { id: 'honest', text: 'I am judging this on what it does, not on how much I want to be back.' },
];

/**
 * Extra prompts per tissue.
 *
 * These are questions, not steps in a plan. Nothing here implies an order,
 * a schedule, or a threshold that means anything clinically.
 */
export const PART_STEPS: Partial<Record<BodyPart, ReturnStep[]>> = {
  fingers: [
    { id: 'grip', text: 'I can take my weight on it in the grip positions I actually use, without symptoms.' },
    { id: 'small', text: 'Smaller holds feel like small holds, not like a warning.' },
  ],
  pulley: [
    { id: 'crimp', text: 'Closed crimping does not produce the sensation that started this.' },
    { id: 'noise', text: 'No clicking, catching or bowstringing that was not there before.' },
  ],
  wrist: [
    { id: 'press', text: 'I can put weight through a flat hand — mantels, pressing — without symptoms.' },
    { id: 'rotate', text: 'Turning the hand over and back is symmetrical and quiet.' },
  ],
  elbow: [
    { id: 'straighten', text: 'It straightens fully and does not complain when I hang from it.' },
    { id: 'grip-load', text: 'Gripping hard does not send anything into the elbow.' },
  ],
  shoulder: [
    { id: 'overhead', text: 'Reaching overhead feels the same on both sides.' },
    { id: 'catch', text: 'Taking sudden load on that arm does not make me flinch or brace for it.' },
  ],
  back: [
    { id: 'trunk', text: 'Bending and twisting through the day is unremarkable.' },
    { id: 'tension', text: 'Holding body tension on steep ground does not set it off.' },
  ],
  hip: [
    { id: 'range-hip', text: 'High steps and wide positions reach as far as the other side.' },
    { id: 'load-hip', text: 'Pushing through that leg does not produce symptoms.' },
  ],
  knee: [
    { id: 'heel', text: 'Heel hooking and drop knees are symptom-free, not just tolerable.' },
    { id: 'stairs', text: 'Stairs, squatting and getting up off the floor are unremarkable.' },
  ],
  ankle: [
    { id: 'hop', text: 'I can take my weight on it on one leg without hesitating.' },
    { id: 'ground', text: 'Landing and stepping down feel steady rather than careful.' },
  ],
};

/** The default prompts for a part: the general ones, then anything specific. */
export function defaultSteps(part: BodyPart): ReturnStep[] {
  return [...GENERAL_STEPS, ...(PART_STEPS[part] ?? [])];
}
