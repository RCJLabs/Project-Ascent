/**
 * The answers the logger asks for, read back (PLAN.md M88).
 *
 * M70 gave session types extra questions and rendered the inputs. Sixteen
 * field ids are declared, twenty-two session types name them, and
 * `session.fields` was written by the logger and read by **the same screen,
 * the same day, and nowhere else** — the shape M82 found in `checkIn`, one
 * layer down and larger. `content/fields.ts` opens by saying a question the
 * content asks and the app never renders is a promise the content cannot
 * keep; rendering the input kept half of it.
 *
 * ## Only the ones that are quantities
 *
 * Of the sixteen, six are `number` and one is a `scale` — those are the ones
 * a series can be drawn from. The `text` fields (`highPoint`, `projectName`,
 * `location`, `gearNotes`, `routeName`, `clipStyle`) are notes, and the two
 * `grade` fields are handled separately and for a different reason: the app
 * already derives the hardest grade of a session from the climbs logged in
 * it, so those two are not a missing reading but a duplicate one. See
 * `gradeDisagreement` below.
 *
 * ## Sparse by construction
 *
 * A field is only asked on the session types that declare it, and only
 * answered if the climber bothers. Every series here is therefore a
 * scattering of points, and every reading of one says how many sessions it
 * came from — the rule M82 and M83 both settled on.
 */

import type { FieldId } from '@/content/types';
import { FIELDS, type FieldSpec } from '@/content/fields';
import type { Session } from '@/db/sessions';
import { addDays } from './dates';
import { canonicalGrade, gradeOrdinal, type GradeScale } from './grades';

/** Ninety days, to match the other series on the Progress page. */
export const FIELD_DAYS = 90;

/** Below this a series is a handful of dots, and says so. */
export const ENOUGH_POINTS = 4;

export interface FieldPoint {
  date: string;
  sessionId: string;
  value: number;
}

export interface FieldSeries {
  spec: FieldSpec;
  /** Oldest first. */
  points: FieldPoint[];
  min: number;
  max: number;
  /** Mean, for the reading beneath the chart. */
  mean: number;
  /** Whether there are enough points to say anything about a direction. */
  solid: boolean;
}

export interface FieldsInput {
  sessions: readonly Session[];
  to: string;
  days?: number;
}

/** Numeric kinds only — see the note above. */
function isQuantity(spec: FieldSpec): boolean {
  return spec.kind === 'number' || spec.kind === 'scale';
}

/**
 * Every quantity a climber has actually answered, as a series.
 *
 * Ordered by how much there is to look at: a field answered twenty times
 * is worth more of the page than one answered twice, and no ordering at all
 * would put "Water depth" above "Climbs done" on alphabet alone.
 */
export function fieldSeries(input: FieldsInput): FieldSeries[] {
  const days = input.days ?? FIELD_DAYS;
  const from = addDays(input.to, -(days - 1));

  const byField = new Map<FieldId, FieldPoint[]>();
  const inWindow = [...input.sessions]
    .filter((s) => s.completed && s.date >= from && s.date <= input.to)
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1));

  for (const session of inWindow) {
    for (const [id, raw] of Object.entries(session.fields ?? {})) {
      const spec = FIELDS[id as FieldId];
      if (spec === undefined || !isQuantity(spec)) continue;
      // The logger stores what the input produced; a restored backup can
      // hold a string where a number belongs.
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(value)) continue;
      const points = byField.get(id as FieldId) ?? [];
      points.push({ date: session.date, sessionId: session.id, value });
      byField.set(id as FieldId, points);
    }
  }

  const out: FieldSeries[] = [];
  for (const [id, points] of byField) {
    const values = points.map((p) => p.value);
    out.push({
      spec: FIELDS[id]!,
      points,
      min: Math.min(...values),
      max: Math.max(...values),
      mean: values.reduce((n, v) => n + v, 0) / values.length,
      solid: points.length >= ENOUGH_POINTS,
    });
  }
  return out.sort((a, b) =>
    b.points.length === a.points.length
      ? a.spec.label.localeCompare(b.spec.label)
      : b.points.length - a.points.length,
  );
}

/**
 * The hardest grade a session's own climbs record.
 *
 * Null when nothing of that kind was logged, which is not the same as
 * "nothing was climbed": a session logged as a note with no climbs has no
 * hardest anything.
 */
export function hardestLogged(
  session: Session,
  result: 'send' | 'attempt' | 'either',
): { grade: string; scale: GradeScale } | null {
  let best: { grade: string; scale: GradeScale; ordinal: number } | null = null;
  for (const climb of session.climbs) {
    if (result !== 'either' && climb.result !== result) continue;
    const ordinal = gradeOrdinal(climb.scale, climb.grade);
    if (ordinal < 0) continue;
    // Compared inside a ladder only. A V-grade and a YDS grade have no
    // order between them, so the hardest of a mixed session is answered
    // per scale and the caller asks for the one the field is about.
    if (best === null || (climb.scale === best.scale && ordinal > best.ordinal)) {
      best = { grade: climb.grade, scale: climb.scale, ordinal };
    }
  }
  return best === null ? null : { grade: best.grade, scale: best.scale };
}

export interface GradeDisagreement {
  spec: FieldSpec;
  /** What the climber typed. */
  said: string;
  /** The hardest of that kind among the session's own climbs. */
  logged: string;
  scale: GradeScale;
  /** Ladder steps between them, signed: positive means the answer is harder. */
  steps: number;
}

/**
 * Where a typed grade and the session's own climbs disagree (PLAN.md M88).
 *
 * Six of the eleven programs ask a session type for "Hardest attempted" or
 * "Hardest sent" — and the app derives exactly that from the climbs logged
 * in the same session, for the pyramid, the progression chart and the
 * personal records. The typed answer feeds none of them. So the question is
 * not a missing reading, it is a second one, and nothing has ever checked
 * that the two agree.
 *
 * **Reported, never corrected.** The two can differ honestly — the hardest
 * thing you touched is not always a climb you counted — so this says what
 * it sees and leaves the climber to decide. Silently overwriting either
 * side would be the app choosing which of the climber's own answers to
 * believe.
 */
export function gradeDisagreements(session: Session): GradeDisagreement[] {
  const out: GradeDisagreement[] = [];
  for (const [id, kind] of [
    ['hardestGradeSent', 'send'],
    ['hardestGradeAttempted', 'either'],
  ] as const) {
    const raw = session.fields?.[id];
    // No blank check: `canonicalGrade` places nothing for '' or '  ', and
    // the null below catches it. An explicit one was there first and no
    // mutation could kill it.
    if (typeof raw !== 'string') continue;
    const spec = FIELDS[id];
    const scale: GradeScale = spec.scale === 'route' ? 'YDS' : 'V';
    const said = canonicalGrade(scale, raw);
    if (said === null) continue;

    const logged = hardestLogged(session, kind);
    // Nothing logged of that kind is not a disagreement. A session can be a
    // typed note with no climbs in it at all.
    if (logged === null || logged.scale !== scale) continue;

    const steps = gradeOrdinal(scale, said) - gradeOrdinal(scale, logged.grade);
    if (steps === 0) continue;
    out.push({ spec, said, logged: logged.grade, scale, steps });
  }
  return out;
}
