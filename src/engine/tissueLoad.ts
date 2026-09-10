import type { Session } from '@/db/sessions';
import type { BodyPart } from '@/content/warmups';
import { addDays, daysBetween } from './dates';
import { partsInText } from './bodyLoad';
import { sessionLoad } from './derive';

/**
 * Which tissue has been taking the work (PLAN.md M27).
 *
 * `bodyLoad.ts` is a real engine and it was used in exactly one place: a
 * warning beside a line in the logger, when a climber has told the app
 * something is hurt. The same table answers a question a climber asks far
 * more often — *what have I actually been loading?* — and it is the honest
 * input to a deload decision, or to coming back from a niggle.
 *
 * **Three things to be blunt about.**
 *
 * It is a keyword scan, as `bodyLoad.ts` says at length. It misses an
 * exercise named something unusual and over-flags a few that share a word.
 * That is tolerable for a relative picture and not tolerable for a number
 * with a unit, which is why nothing here is presented as a measurement.
 *
 * Load is attributed **whole to each tissue a session touched**, not divided
 * between them. Dividing would say a session loads your fingers less because
 * it also loaded your shoulder, which is not how a body works. The
 * consequence is that the parts do not sum to the session total, so there is
 * no total here to mislead anyone — shares are relative to the busiest
 * tissue, never to a sum.
 *
 * A quiet tissue is ambiguous: it may be untrained, or it may be trained
 * with words the scan does not know. `daysSinceLoaded` is reported next to
 * every part so the difference between "nothing for three weeks" and "never
 * seen" is visible rather than averaged away.
 */

export const ALL_PARTS: BodyPart[] = [
  'fingers',
  'pulley',
  'wrist',
  'elbow',
  'shoulder',
  'back',
  'hip',
  'knee',
  'ankle',
];

/**
 * What climbing loads, whatever the session notes say.
 *
 * A bouldering session loads fingers whether or not anyone wrote the word
 * down, and most logged sessions carry no prose at all. Without this the
 * chart would report a climber who logs grades and nothing else as having
 * trained no tissue whatsoever.
 */
export const CLIMBING_PARTS: BodyPart[] = ['fingers', 'pulley', 'shoulder', 'elbow'];

export interface TissueShare {
  part: BodyPart;
  /** Load attributed to this tissue, in the usual RPE × hours units. */
  load: number;
  /** Against the busiest tissue, 0–1. Never against a sum: see the note. */
  share: number;
  /** Sessions in the window that touched it. */
  sessions: number;
  /** Days since the last one, or null if nothing in the window touched it. */
  daysSinceLoaded: number | null;
}

export interface TissueLoad {
  parts: TissueShare[];
  from: string;
  to: string;
  /** Completed sessions in the window. */
  sessionCount: number;
  /** Sessions the scan could attribute to nothing at all. */
  unreadSessions: number;
}

export interface TissueInput {
  sessions: readonly Session[];
  /**
   * Extra words for a session — the drill it ran, the exercises its program
   * prescribed — which live in the content catalogue rather than on the
   * record. Kept as a callback so this module stays pure.
   */
  textFor?: (session: Session) => string;
  to: string;
  days?: number;
}

/** Four weeks: the same window the training-load model uses. */
export const TISSUE_DAYS = 28;

/** Everything on the record itself that the scan can read. */
function sessionText(session: Session): string {
  return [
    ...(session.completedExercises ?? []),
    session.notes ?? '',
    ...session.climbs.map((climb) => climb.name ?? ''),
  ]
    .filter(Boolean)
    .join(' ');
}

export function tissueLoad(input: TissueInput): TissueLoad {
  const days = input.days ?? TISSUE_DAYS;
  const from = addDays(input.to, -(days - 1));

  const load = new Map<BodyPart, number>();
  const counts = new Map<BodyPart, number>();
  const lastDate = new Map<BodyPart, string>();
  let sessionCount = 0;
  let unreadSessions = 0;

  for (const session of input.sessions) {
    if (!session.completed) continue;
    if (session.date < from || session.date > input.to) continue;
    sessionCount += 1;

    const words = `${sessionText(session)} ${input.textFor?.(session) ?? ''}`;
    const scanned = partsInText(words);
    // Climbing counts even when nothing was written down.
    const climbed = session.climbs.length > 0 ? CLIMBING_PARTS : [];
    const parts = [...new Set([...scanned, ...climbed])];

    if (parts.length === 0) {
      unreadSessions += 1;
      continue;
    }

    // The session's own load, whole, to each tissue it touched.
    const amount = sessionLoad(session);
    for (const part of parts) {
      load.set(part, (load.get(part) ?? 0) + amount);
      counts.set(part, (counts.get(part) ?? 0) + 1);
      const seen = lastDate.get(part);
      if (seen === undefined || session.date > seen) lastDate.set(part, session.date);
    }
  }

  const busiest = Math.max(0, ...load.values());
  const parts: TissueShare[] = ALL_PARTS.map((part) => {
    const seen = lastDate.get(part);
    return {
      part,
      load: load.get(part) ?? 0,
      share: busiest <= 0 ? 0 : (load.get(part) ?? 0) / busiest,
      sessions: counts.get(part) ?? 0,
      daysSinceLoaded: seen === undefined ? null : daysBetween(seen, input.to),
    };
  });

  // Heaviest first; ties keep the anatomical order above so the list does
  // not reshuffle between renders.
  parts.sort((a, b) => b.load - a.load);
  return { parts, from, to: input.to, sessionCount, unreadSessions };
}

/**
 * Above this share of the busiest, a tissue is not meaningfully quieter.
 *
 * A climber who logs grades and no prose loads exactly the four climbing
 * tissues, equally, every session — so the "quietest" of them is whichever
 * the sort happened to put last. Naming it would be the chart inventing a
 * weak point out of a tie.
 */
export const TIE_SHARE = 0.95;

/**
 * The tissue that has taken work but least of it, when there is one.
 *
 * Deliberately not "the lowest number". A part nothing touched is not the
 * quietest — it is unknown, and telling a climber their ankles are their
 * weak point because the word never appears in their log would be the scan
 * pretending to be an assessment. Nor is a tie: see `TIE_SHARE`.
 */
export function quietestLoaded(load: TissueLoad): TissueShare | null {
  const seen = load.parts.filter((p) => p.sessions > 0);
  const quiet = seen[seen.length - 1];
  if (!quiet || quiet.share >= TIE_SHARE) return null;
  return quiet;
}

/** Parts nothing in the window mentioned at all. */
export function untouched(load: TissueLoad): TissueShare[] {
  return load.parts.filter((p) => p.sessions === 0);
}

/**
 * One sentence, and no advice.
 *
 * The training-state card is where the app tells a climber what to do. This
 * says what the log contains, which is a different job, and a keyword scan
 * has not earned the right to prescribe anything.
 */
export function describeTissue(load: TissueLoad): string {
  if (load.sessionCount === 0) return 'Nothing logged in the last four weeks.';
  const busiest = load.parts[0];
  if (!busiest || busiest.sessions === 0) {
    return `${load.sessionCount} sessions logged, none of them describing what they loaded.`;
  }
  const quiet = quietestLoaded(load);
  const parts = [`Most of it through your ${busiest.part}`];
  if (quiet && quiet.part !== busiest.part) parts.push(`least through your ${quiet.part}`);
  const never = untouched(load);
  if (never.length > 0) {
    parts.push(`nothing at all for ${never.map((p) => p.part).join(', ')}`);
  }
  return `${parts.join(', ')}.`;
}
