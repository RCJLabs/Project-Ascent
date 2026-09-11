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
}

export const FIELDS: Record<FieldId, FieldSpec> = {
  hardestGradeAttempted: {
    id: 'hardestGradeAttempted',
    label: 'Hardest attempted',
    kind: 'grade',
    scale: 'boulder',
  },
  hardestGradeSent: { id: 'hardestGradeSent', label: 'Hardest sent', kind: 'grade', scale: 'boulder' },
  sessionVolume: { id: 'sessionVolume', label: 'Climbs done', kind: 'number' },
  routesCompleted: { id: 'routesCompleted', label: 'Routes completed', kind: 'number' },
  pitches: { id: 'pitches', label: 'Pitches', kind: 'number' },
  attemptsToday: { id: 'attemptsToday', label: 'Attempts', kind: 'number', unit: 'burns' },
  // Renamed from "High point" in M102. A projecting session renders this
  // beside the burn card, whose own high point is a *percentage* — so the
  // log page carried two controls called the same thing meaning different
  // measurements. This one names a feature; that one is how far up.
  highPoint: { id: 'highPoint', label: 'The move you reached', kind: 'text', placeholder: 'The move, bolt or hold' },
  projectName: { id: 'projectName', label: 'Project', kind: 'text', placeholder: 'What you were working' },
  routeName: { id: 'routeName', label: 'Route', kind: 'text', placeholder: 'What you climbed' },
  pumpLevel: { id: 'pumpLevel', label: 'Pump', kind: 'scale', ends: ['Fresh', 'Wrecked'] },
  location: { id: 'location', label: 'Where', kind: 'text', placeholder: 'The gym, the crag, the boulder' },
  sessionNumber: { id: 'sessionNumber', label: 'Day of the trip', kind: 'number' },
  clipStyle: { id: 'clipStyle', label: 'Style', kind: 'text', placeholder: 'Onsight, flash, redpoint, toprope' },
  waterDepth: { id: 'waterDepth', label: 'Water depth', kind: 'number', unit: 'ft' },
  gearNotes: { id: 'gearNotes', label: 'Gear', kind: 'text', placeholder: 'What the rack needed' },
  sessionDuration: { id: 'sessionDuration', label: 'Time on the wall', kind: 'number', unit: 'min' },
};

export function getField(id: FieldId): FieldSpec | undefined {
  return FIELDS[id];
}

/** The scale a 1-10 field runs over. */
export const SCALE_MAX = 10;
