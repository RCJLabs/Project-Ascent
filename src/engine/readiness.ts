/**
 * The check-in before a session (PLAN.md M72).
 *
 * Two questions — how the fingers feel, how the sleep was — and a set of
 * rules over the answers. Rules, said out loud: there is no model here, no
 * HRV, no wearable, and nothing that learns. The app can only know what the
 * climber tells it, so the honest form is a short question and a
 * deterministic answer the climber can argue with.
 *
 * **Why it is not in the coach.** `engine/coach.ts` writes "standing
 * observations about the training as a whole — things that stay true until
 * they are dealt with", and none of its rules stores anything, so a tip
 * cannot go stale. How you slept last night is the opposite of that on both
 * counts. It would be the first thing in there with a shelf life measured in
 * hours. So this lives with the session it is about, and the coach is left
 * alone.
 *
 * **Why two questions and not one.** A second question only earns its place
 * if it changes the answer by itself. Sore fingers on a good night's sleep
 * and fresh fingers on no sleep are different days and get different advice:
 * one takes the fingerboard away and leaves the volume, the other leaves the
 * fingerboard and takes the intensity. A test holds both apart.
 *
 * **Why it must be visible.** A check-in whose only output is a mood word is
 * superstition with a UI. Every answer that is not "fine" has to produce
 * something you can point at: a body part flagged on the lines that load it,
 * a ceiling on the effort, or a test told to wait.
 */

import type { BodyPart } from '@/content/warmups';
import { describeParts } from './bodyLoad';
import { STALE_DAYS } from './assessments';

export type FingerFeel = 'good' | 'tender' | 'sore';
export type SleepFeel = 'good' | 'short' | 'none';

/**
 * The same three answers, asked about a tissue that is not the fingers
 * (PLAN.md M103).
 *
 * An alias rather than a second union: "good, tender, sore" reads correctly
 * for an elbow or a shoulder, and two vocabularies for one idea is the
 * duplication M98, M99b and M102 each had to undo. What differs is the
 * *label*, which has to name the part — `FINGER_LABEL` is finger copy and
 * stays that way.
 */
export type TissueFeel = FingerFeel;

export interface CheckIn {
  fingers: FingerFeel;
  sleep: SleepFeel;
  /**
   * How each injured part felt, keyed by the injury vocabulary (PLAN.md
   * M103).
   *
   * Asked only about injuries that are open, and never about the fingers or
   * a pulley: those are what the fingers question is. An `Injury` records
   * where a part stands *now* and nothing about how it got there, so the one
   * question every physio asks — how has it been? — had no data in an app
   * holding both the injury and the sessions.
   *
   * Sparse: a part the climber did not answer is absent rather than "good",
   * because a question skipped is not a part that felt fine.
   */
  parts?: Partial<Record<BodyPart, TissueFeel>>;
}

/** Which injured parts get their own question. Fingers and pulleys do not:
 *  that is the fingers question, and asking twice is asking twice. */
export const ASKED_BY_FINGERS: BodyPart[] = ['fingers', 'pulley'];

export function tissueLabel(part: BodyPart, feel: TissueFeel): string {
  const word = feel === 'good' ? 'fine' : feel;
  return `${part.charAt(0).toUpperCase()}${part.slice(1)} ${word}`;
}


/** What to do with the session, not a colour and not a score. */
export type ReadinessCall = 'full' | 'adjusted' | 'easy';

export interface Readiness {
  call: ReadinessCall;
  headline: string;
  /** The answers that drove it, named. A rule nobody can see is a mood. */
  because: string;
  /** Concrete changes to today, each one a thing to do differently. */
  advice: string[];
  /** Parts to mark on the lines that load them — the injury vocabulary,
   *  reused, so one flag means one thing across the app. */
  flag: BodyPart[];
  /**
   * The answer that raised those flags, as the climber gave it.
   *
   * A flag on a line has to say which answer put it there, and `because`
   * is the wrong string for it: on a bad night with sore fingers that reads
   * "Fingers sore · Barely slept — it loads the fingers directly", and the
   * sleep had nothing to do with that line.
   */
  flagBecause: string | null;
  /** Suggested ceiling on RPE, or null when there is no reason for one. */
  cap: number | null;
  /** Why a test scheduled for today should wait, or null to go ahead. */
  deferTest: string | null;
}

export const FINGER_LABEL: Record<FingerFeel, string> = {
  good: 'Fingers fine',
  tender: 'Fingers tender',
  sore: 'Fingers sore',
};

export const SLEEP_LABEL: Record<SleepFeel, string> = {
  good: 'Slept well',
  short: 'Slept short',
  none: 'Barely slept',
};

/**
 * The same answers, short enough for a chip.
 *
 * Written out rather than cut down from the labels above, which is what the
 * first version did — and `'Barely slept'.replace('Slept ', '')` is still
 * 'Barely slept', so one chip in six came out at twice the length of its
 * neighbours. A short label is a different string, not a substring.
 */
export const FINGER_CHIP: Record<FingerFeel, string> = {
  good: 'Fine',
  tender: 'Tender',
  sore: 'Sore',
};

export const SLEEP_CHIP: Record<SleepFeel, string> = {
  good: 'Well',
  short: 'Short',
  none: 'Barely',
};

/** The question, and the three answers, in the order they are asked. */
export const FINGER_ANSWERS: FingerFeel[] = ['good', 'tender', 'sore'];
export const SLEEP_ANSWERS: SleepFeel[] = ['good', 'short', 'none'];

/** The same chips and the same order, for an injured part (PLAN.md M103). */
export const TISSUE_CHIP: Record<TissueFeel, string> = FINGER_CHIP;
export const TISSUE_ANSWERS: TissueFeel[] = FINGER_ANSWERS;

/**
 * What each answer contributes.
 *
 * Split per question rather than written out as nine paragraphs, because
 * nine paragraphs is nine places for the advice to drift apart — and because
 * the property worth holding is that each question moves the result on its
 * own, which a combined table hides.
 *
 * `cost` is not a score shown to anyone. It decides the call and nothing
 * else: 0 is nothing to say, 1 is worth a change, 2 is worth a real one.
 */
interface Contribution {
  cost: number;
  /** The answer, as the climber gave it. */
  said?: string;
  advice?: string;
  /** Set when the advice only makes sense if today loads these parts. */
  needs?: BodyPart[];
  flag?: BodyPart[];
  deferTest?: string;
}

/**
 * How long a result stands before the app stops trusting it, in words.
 *
 * Read from `STALE_DAYS` rather than typed into the copy: the whole force of
 * the defer advice is the number, and a sentence quoting a figure the engine
 * no longer uses is worse than one quoting none.
 */
const STANDS_FOR = `${STALE_DAYS / 7} weeks`;

const FINGERS: Record<FingerFeel, Contribution> = {
  good: { cost: 0 },
  tender: {
    cost: 1,
    advice:
      'Halve the finger work and stop the moment it sharpens. Tender is the signal you still have a choice about.',
    needs: ['fingers'],
    flag: ['fingers'],
    deferTest: `A hang test on tender fingers reads low, and the low number is what the app compares against for the next ${STANDS_FOR}.`,
  },
  sore: {
    cost: 2,
    advice:
      'Leave the fingerboard and the campus rungs alone. Climb on jugs, or make it a movement session. Finger soreness is the one thing this app will not tell you to push through.',
    needs: ['fingers'],
    flag: ['fingers', 'pulley'],
    deferTest: 'Testing fingers that are already sore measures the soreness, not the strength.',
  },
};

const SLEEP: Record<SleepFeel, Contribution> = {
  good: { cost: 0 },
  short: {
    cost: 1,
    advice:
      'Keep the session. Expect it to feel a grade harder than it is, and do not read anything into that.',
  },
  none: {
    cost: 2,
    advice:
      'Drop the hardest block and keep the rest. Training on no sleep buys the fatigue without the adaptation.',
    deferTest: `A maximum effort on no sleep goes into the record as your strength, and stands there for ${STANDS_FOR}.`,
  },
};

const HEADLINE: Record<ReadinessCall, string> = {
  full: 'Good to go.',
  adjusted: 'Train, with changes.',
  easy: 'Today is not the day.',
};

/** RPE ceilings. Perceived effort self-adjusts on a bad day, which is why
 *  it is the instrument here and load is not: the same hang that was a 6
 *  last week is an 8 today, and the ceiling catches that without being told. */
const CAP: Record<ReadinessCall, number | null> = { full: null, adjusted: 7, easy: 5 };

export interface ReadinessContext {
  /**
   * The parts today's session actually loads, from `engine/bodyLoad`.
   *
   * Undefined means unknown — a climber with no program still gets the
   * advice. An empty array means known to load nothing relevant, and the
   * finger advice is left out: "leave the fingerboard alone" on a day with
   * no fingerboard in it is the sort of line that teaches people to stop
   * reading.
   */
  loads?: readonly BodyPart[];
  /** Whether a test is scheduled for today. */
  test?: boolean;
}

/**
 * What an injured part's answer costs today (PLAN.md M103).
 *
 * The same shape as the fingers table and deliberately gentler in its
 * wording: the fingers rules can be specific because there is one thing a
 * finger session is, and "leave the fingerboard alone" means something. An
 * elbow, a knee and a hip do not share a prescription, so the advice names
 * the part and the choice and stops there rather than inventing a protocol
 * per tissue.
 */
function tissueContribution(part: BodyPart, feel: TissueFeel): Contribution {
  if (feel === 'good') return { cost: 0 };
  const named = describeParts([part]);
  if (feel === 'tender') {
    return {
      cost: 1,
      advice: `Keep the load off ${named} where the session lets you. Tender is the signal you still have a choice about.`,
      needs: [part],
      flag: [part],
    };
  }
  return {
    cost: 2,
    advice: `Train around ${named} today rather than through it. You logged it as an injury, and this is the day it is telling you about.`,
    needs: [part],
    flag: [part],
    deferTest: `A test that loads ${named} while it is sore measures the soreness.`,
  };
}

export function readinessFor(checkIn: CheckIn, context: ReadinessContext = {}): Readiness {
  const parts: Contribution[] = [
    { ...FINGERS[checkIn.fingers], said: FINGER_LABEL[checkIn.fingers] },
    { ...SLEEP[checkIn.sleep], said: SLEEP_LABEL[checkIn.sleep] },
    ...Object.entries(checkIn.parts ?? {}).map(([part, feel]) => ({
      ...tissueContribution(part as BodyPart, feel),
      said: tissueLabel(part as BodyPart, feel),
    })),
  ];
  const cost = parts.reduce((n, p) => n + p.cost, 0);
  const call: ReadinessCall = cost === 0 ? 'full' : cost >= 3 ? 'easy' : 'adjusted';

  const relevant = (p: Contribution): boolean =>
    p.needs === undefined || context.loads === undefined || p.needs.some((part) => context.loads!.includes(part));

  const flagged = parts.filter((p) => p.cost > 0);
  const flagger = parts.find((p) => p.flag !== undefined);

  return {
    call,
    headline: HEADLINE[call],
    // Name only what is actually driving it. Listing "Fingers fine" as a
    // reason for an easy day is how a rules engine starts sounding like it
    // is hiding something.
    because: flagged.length === 0 ? 'Nothing flagged.' : flagged.map((p) => p.said!).join(' · '),
    advice: parts.filter((p) => p.advice !== undefined && relevant(p)).map((p) => p.advice!),
    flag: [...new Set(parts.flatMap((p) => p.flag ?? []))],
    flagBecause: flagger?.said ?? null,
    cap: CAP[call],
    deferTest: context.test !== true ? null : (parts.find((p) => p.deferTest)?.deferTest ?? null),
  };
}
