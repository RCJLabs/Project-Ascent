/**
 * The extra things a session type asks for (PLAN.md M70).
 *
 * Nine programs declare `fields` on their session types — twenty-four
 * declarations, sixteen distinct ids, sixty-two references — and until now
 * **nothing in the app read one of them**. Outdoor Climbing asks every
 * session where it happened, how many attempts, what the high point was;
 * the logger never put any of it on screen. A question the content asks and
 * the app never renders is a promise the content cannot keep.
 *
 * Declared here, as data, so a test can hold the two sides together: every
 * id the type union allows has an entry, and every id a program names
 * exists.
 */

import type { FieldId } from './types';

export type FieldKind = 'text' | 'number' | 'grade' | 'scale';

export interface FieldSpec {
  id: FieldId;
  /** What the climber is asked, in their words. */
  label: string;
  kind: FieldKind;
  /** A word after the input, for numbers that have a unit. */
  unit?: string;
  /** Shown inside an empty input, never as a value. */
  placeholder?: string;
  /** For `scale`: the ends of it, so a 1-10 row can be labelled. */
  ends?: [string, string];
  /** Which ladder a grade field reads from. */
  scale?: 'boulder' | 'route';
  /**
   * Answered by the session's own climbs rather than typed (PLAN.md M120).
   *
   * Three of the sixteen ask for something the climb list already says —
   * the hardest thing sent, the hardest thing touched, how many climbs —
   * and from M70 to M119 the logger asked anyway, so a climber who tallied
   * eight problems was then asked how many problems they did. Declared here
   * so `engine/sessionFields.ts` can answer per field, and the card can
   * show the answer instead of the question whenever there are climbs to
   * read it from. With no climbs logged the question stands, because a
   * session written as a note has nothing to derive from.
   */
  derived?: 'climbs';
  /**
   * Asked somewhere the app actually reads, so this one stops being asked
   * (PLAN.md M142).
   *
   * The same shape as `derived` one step further out: `derived` is a
   * question the session's own climbs answer, this is a question another
   * part of the session already asks and the engines already read. The
   * value is where that is, in the words a reader needs.
   *
   * **Kept rather than deleted.** Sessions already carry answers under
   * these ids, and the archive labels every answer through `getField` —
   * removing the entry would turn a readable *Time on the wall: 75* into
   * *sessionDuration: 75* in a climber's own spreadsheet. What changes is
   * that no session type may name one, which `content/validate.ts` holds.
   */
  retired?: string;
}

export const FIELDS: Record<FieldId, FieldSpec> = {
  hardestGradeAttempted: {
    id: 'hardestGradeAttempted',
    label: 'Hardest attempted',
    kind: 'grade',
    scale: 'boulder',
    derived: 'climbs',
  },
  hardestGradeSent: {
    id: 'hardestGradeSent',
    label: 'Hardest sent',
    kind: 'grade',
    scale: 'boulder',
    derived: 'climbs',
  },
  sessionVolume: { id: 'sessionVolume', label: 'Climbs done', kind: 'number', derived: 'climbs' },
  routesCompleted: { id: 'routesCompleted', label: 'Routes completed', kind: 'number' },
  pitches: { id: 'pitches', label: 'Pitches', kind: 'number' },
  attemptsToday: { id: 'attemptsToday', label: 'Attempts', kind: 'number', unit: 'burns' },
  // Renamed from "High point" in M102. A projecting session renders this
  // beside the burn card, whose own high point is a *percentage* — so the
  // log page carried two controls called the same thing meaning different
  // measurements. This one names a feature; that one is how far up.
  //
  // "this session" rather than nothing is a coaching call: a climber says
  // "my high point" out loud and means the move, so the word had to come
  // back; the qualifier is what keeps it from reading as the project's
  // all-time high point, which is the percentage on `/projects/:id`.
  highPoint: {
    id: 'highPoint',
    label: 'High point this session',
    kind: 'text',
    placeholder: 'The move, bolt or hold',
  },
  projectName: {
    id: 'projectName',
    label: 'Project',
    kind: 'text',
    placeholder: 'What you were working',
    retired: 'the project picked on the session, which links the burns to it',
  },
  routeName: {
    id: 'routeName',
    label: 'Route',
    kind: 'text',
    placeholder: 'What you climbed',
    retired: "the climb's own name, on every climb row since M130",
  },
  pumpLevel: { id: 'pumpLevel', label: 'Pump', kind: 'scale', ends: ['Fresh', 'Wrecked'] },
  location: { id: 'location', label: 'Where', kind: 'text', placeholder: 'The gym, the crag, the boulder' },
  sessionNumber: { id: 'sessionNumber', label: 'Day of the trip', kind: 'number' },
  /**
   * @deprecated Retired at M108 and asked by no session type.
   *
   * It requested "Onsight, flash, redpoint, toprope" as free text on one
   * session type of one program — three of which `Climb.style` has always
   * stored structurally, and the fourth of which is `Climb.ropeStyle` since
   * M108. Asking it again in prose was two places for one fact, and the
   * prose one was per *session*, so a day with four routes got one answer.
   *
   * The entry stays so answers already written keep a label and a shape;
   * nothing renders an input for it.
   *
   * **Carries `retired` since M169**, which is what it always was. The field
   * was retired at M108, three milestones before `retired` existed, so it sat
   * in the registry asked by nothing and marked as nothing — indistinguishable
   * from a field somebody forgot to wire up. The marker is how the guard tells
   * a decision from an omission.
   */
  clipStyle: {
    id: 'clipStyle',
    label: 'Style',
    kind: 'text',
    placeholder: 'Onsight, flash, redpoint, toprope',
    retired: "the climb's own style and rope style, which every climb row carries since M108",
  },
  waterDepth: { id: 'waterDepth', label: 'Water depth', kind: 'number', unit: 'ft' },
  gearNotes: { id: 'gearNotes', label: 'Gear', kind: 'text', placeholder: 'What the rack needed' },
  sessionDuration: {
    id: 'sessionDuration',
    label: 'Time on the wall',
    kind: 'number',
    unit: 'min',
    retired: "the logger's own Duration input, which load, the review, the career totals and the archive all read",
  },
};

export function getField(id: FieldId): FieldSpec | undefined {
  return FIELDS[id];
}

/** The scale a 1-10 field runs over. */
export const SCALE_MAX = 10;
