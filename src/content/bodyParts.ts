/**
 * What can hurt, in one list (PLAN.md M223).
 *
 * ## Why this is a table and not a union
 *
 * `BodyPart` was nine strings in `warmups.ts` and the list of them was
 * written out by hand in two places — the injuries card and the finder's
 * "what hurts" chips. **They already disagreed**: the finder offered seven
 * and the card nine, so a climber with a bad hip could say so on one screen
 * and not the other, and nothing failed. Adding a part meant touching five
 * files and hoping.
 *
 * So the parts are data. Both pickers read this, `bodyParts.test.ts` fails
 * if a part has no return-to-climbing steps or nothing that loads it, and
 * the label stops being the id — which is what kept every part to a single
 * lowercase word that `capitalize` could render.
 *
 * ## Why eighteen
 *
 * The nine were the obvious ones, and they left out most of what actually
 * ends a climber's season. Heel hooks tear hamstrings and Achilles tendons;
 * hard crimping and lock-offs pull intercostals; toe hooks and tight shoes
 * ruin feet; belaying wrecks necks. And a climber who shuts their **hand**
 * in a car door has an injury the app could not name at all, which is the
 * complaint this milestone started from.
 *
 * ## What a region is for
 *
 * Eighteen chips in a row is a wall. Grouped, it is four short rows a
 * climber reads by pointing at themselves. The order runs hands outward and
 * then down, because that is the order people look.
 */

export type BodyPart =
  | 'fingers'
  | 'pulley'
  | 'hand'
  | 'forearm'
  | 'wrist'
  | 'elbow'
  | 'shoulder'
  | 'lat'
  | 'neck'
  | 'back'
  | 'rib'
  | 'hip'
  | 'groin'
  | 'hamstring'
  | 'knee'
  | 'ankle'
  | 'achilles'
  | 'foot';

export type BodyRegion = 'hands' | 'arms' | 'trunk' | 'legs';

export const REGION_LABEL: Record<BodyRegion, string> = {
  hands: 'Hands and fingers',
  arms: 'Arms',
  trunk: 'Shoulders and trunk',
  legs: 'Legs',
};

/** Regions in the order a climber points at themselves. */
export const REGIONS: BodyRegion[] = ['hands', 'arms', 'trunk', 'legs'];

export interface BodyPartInfo {
  id: BodyPart;
  label: string;
  region: BodyRegion;
  /**
   * Whether left and right mean anything here.
   *
   * False for the two down the middle. Before this it was
   * `injury.part !== 'back'` written into the card, which is a list of one
   * kept in a condition.
   */
  sides: boolean;
  /** What a climber would recognise it by, when the label is not obvious. */
  hint?: string;
}

export const BODY_PARTS: BodyPartInfo[] = [
  { id: 'fingers', label: 'Fingers', region: 'hands', sides: true },
  { id: 'pulley', label: 'Pulley', region: 'hands', sides: true, hint: 'A2 or A4 — the pop' },
  { id: 'hand', label: 'Hand', region: 'hands', sides: true, hint: 'Palm, thumb, knuckles' },
  { id: 'forearm', label: 'Forearm', region: 'arms', sides: true, hint: 'Flexor or extensor' },
  { id: 'wrist', label: 'Wrist', region: 'arms', sides: true },
  { id: 'elbow', label: 'Elbow', region: 'arms', sides: true, hint: "Climber's or tennis" },
  { id: 'shoulder', label: 'Shoulder', region: 'trunk', sides: true },
  { id: 'lat', label: 'Lat', region: 'trunk', sides: true, hint: 'Under the armpit, down the side' },
  { id: 'neck', label: 'Neck', region: 'trunk', sides: false, hint: 'Belaying, mostly' },
  { id: 'back', label: 'Back', region: 'trunk', sides: false },
  { id: 'rib', label: 'Ribs', region: 'trunk', sides: true, hint: 'Intercostal — deep crimping' },
  { id: 'hip', label: 'Hip', region: 'legs', sides: true },
  { id: 'groin', label: 'Groin', region: 'legs', sides: true, hint: 'Adductor — drop knees' },
  { id: 'hamstring', label: 'Hamstring', region: 'legs', sides: true, hint: 'Heel hooks' },
  { id: 'knee', label: 'Knee', region: 'legs', sides: true },
  { id: 'ankle', label: 'Ankle', region: 'legs', sides: true },
  { id: 'achilles', label: 'Achilles', region: 'legs', sides: true, hint: 'Heel hooks, and landings' },
  { id: 'foot', label: 'Foot', region: 'legs', sides: true, hint: 'Toes, arch, shoe damage' },
];

const BY_ID: Record<string, BodyPartInfo> = Object.fromEntries(
  BODY_PARTS.map((part) => [part.id, part]),
);

export function bodyPart(id: BodyPart): BodyPartInfo {
  return BY_ID[id]!;
}

/** What to call it on screen. Never the id — see the module note. */
export function partLabel(id: BodyPart): string {
  return BY_ID[id]?.label ?? id;
}

/** Whether left and right mean anything for this one. */
export function hasSides(id: BodyPart): boolean {
  return BY_ID[id]?.sides ?? true;
}

export function partsIn(region: BodyRegion): BodyPartInfo[] {
  return BODY_PARTS.filter((part) => part.region === region);
}

/**
 * The three sides, with labels rather than capitalised ids.
 *
 * `className="capitalize"` over the lowercase value made the *visible* text
 * differ from the accessible name, so anything querying by what is on
 * screen — a screen reader, a test — asked for "Right" and found "right"
 * (PLAN.md M223).
 */
export const SIDES: { value: 'left' | 'right' | 'both'; label: string }[] = [
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
  { value: 'both', label: 'Both' },
];
