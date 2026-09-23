/**
 * Which tissue a piece of training loads (PLAN.md §9.7, M8).
 *
 * Warmups carry a hand-tagged `loads` list, which is why injuries already
 * filter them. Nothing else in the catalog does: drills and exercises are
 * authored prose, across eleven programs and hundreds of lines, and tagging
 * every one of them by hand is a content project rather than a feature.
 *
 * So this reads them. **It is a keyword scan, not a taxonomy**, and that is
 * worth being blunt about: it will miss an exercise named something unusual
 * and it will over-flag a few that share a word. Both are acceptable because
 * of what the output is used for — a flag beside a line, saying "this loads
 * the thing you told us is hurt". Advisory, never blocking, never a refusal
 * to show you your own program. A missed flag costs a warning the climber
 * could have had; a false one costs a moment's irritation. Neither is worth
 * the alternative, which is no flags at all until every program is re-tagged.
 *
 * The table is the whole thing, deliberately: one place to argue with, one
 * place to fix, and every rule carries the words that trigger it.
 */

import type { BodyPart } from '@/content/bodyParts';
import type { Drill, DrillLoad, Equipment, Exercise, Metric, Protocol, SessionType } from '@/content/types';
import { CLIMBING_PARTS, onTheWall } from './climbing';

export interface LoadRule {
  /** The name a drill's `loads` refers to it by (PLAN.md M137). */
  id: DrillLoad;
  /** What the words say. */
  pattern: RegExp;
  parts: BodyPart[];
  /** Shown to the climber when this fires, so a flag is never mysterious. */
  because: string;
}

/**
 * Ordered by force through the tissue, hardest first, so the reason a
 * climber sees is the most serious one that applies.
 */
export const LOAD_RULES: LoadRule[] = [
  {
    id: 'campus',
    // `bump` and `ladder` came out at M326. Neither had a true positive the
    // word `campus` did not already carry: the bumps were wall moves (a
    // paddle, "BUMP to the finish hold") and *"Bump to 3x20"* on wrist
    // curls; the ladders were a lead-fall drill, a hang ladder as a warm-up,
    // and Iron Grip's *Foot-On Laddering* — the no-board track's substitute,
    // which the program offers precisely because it is not campus work.
    pattern: /\bcampus|double dyno/i,
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'campus work is the highest-force protocol there is',
  },
  {
    id: 'one-arm',
    // On holds, not with a dumbbell (PLAN.md M167).
    //
    // This was `/one[- ]?arm|1[- ]?arm|unilateral hang/` and matched
    // "One-Arm Row (DB)", which it then claimed loads the fingers and the
    // pulley — so a climber with a pulley injury was warned off rows. The
    // first narrowing went too far the other way and lost "one-armed
    // pulling" on overhanging terrain, where the fingers really are the
    // thing under load.
    //
    // So the exclusion is the implement rather than the movement: a row, a
    // press, a carry, a curl and a raise are done holding a weight, and
    // every one of them still reads as elbow, shoulder and back through the
    // `pull` and `shoulder` rules, which is what they are. The lookahead
    // reaches a short way rather than one word, because "One-arm farmer
    // carry" puts the implement two words out.
    pattern: /(one|1)[- ]?arm(?:ed)?(?![^.]{0,20}?\b(rows?|press|carry|curl|raise)\b)|unilateral hang/i,
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'one-arm work doubles the load through a single side',
  },
  {
    id: 'contact',
    // Iron Grip's no-board track, named (PLAN.md M326). *Foot-On Laddering*
    // read as `campus` through the word `ladder`, so a climber on the track
    // the program offers *because* campus is its highest injury risk was
    // told the substitute was "the highest-force protocol there is". The
    // parts were right — fast contact on holds loads the fingers and the arm
    // together — and the reason was the one thing it is not. Recruitment
    // work is the same quality; its notes said so and its name did not.
    pattern: /\bladdering\b|recruitment (?:pull|hang)s?/i,
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'fast, hard contact on holds loads the fingers and the arm together',
  },
  {
    id: 'fingers',
    pattern: /max hang|repeater|dead ?hang|min(imum)? edge|density hang|hangboard|fingerboard|\bedge\b|crimp/i,
    parts: ['fingers', 'pulley'],
    because: 'it loads the fingers directly',
  },
  {
    id: 'lever',
    // Not a *long-lever* plank, which is a trunk exercise with a descriptor.
    pattern: /front lever|back lever|(?<!long[- ])\blever\b|muscle[- ]?up|typewriter/i,
    parts: ['elbow', 'shoulder', 'back'],
    because: 'it holds the elbow and shoulder under tension',
  },
  {
    id: 'pull',
    // Not "two ugly burns in a row" — and `rows`, which the singular missed:
    // *Inverted Rows* and *Archer Rows* read as nothing until M326.
    pattern: /lock[- ]?off|pull[- ]?up|chin[- ]?up|(?<!in a )\brows?\b|lat pull|\bpulldown\b/i,
    parts: ['elbow', 'shoulder', 'back'],
    because: 'pulling loads the elbow and shoulder',
  },
  {
    id: 'dynamic',
    // A box jump is a landing, not a catch: `legs` reads those.
    pattern: /dyno|dynamic|deadpoint|explosive|throw|pop\b|(?<!box |depth |broad )\bjump/i,
    parts: ['shoulder', 'elbow', 'knee'],
    because: 'catching a dynamic move is a shock load',
  },
  {
    // Sustained gripping is not a low-force activity for a healing tendon,
    // even though it feels like the easy end of training.
    id: 'sustained',
    //
    // Case-sensitive, which no other rule is, for one word: ARC the method
    // is written in capitals, and *"top arm tracing a slow arc"* is the
    // thoracic opener that a climber with a finger injury was never offered
    // on a rest day because this read it as sustained gripping (M326).
    pattern: /\bARC\b|[Ll]inked [Ll]aps?|\b[Ll]aps?\b|[Cc]ircuits?|\b[Pp]ump\b|4 ?[xX] ?4|[Cc]ontinuous|[Tt]raverse/,
    parts: ['fingers', 'pulley'],
    because: 'sustained gripping keeps the fingers under load for a long time',
  },
  {
    id: 'open-hand',
    pattern: /sloper|open hand|pinch|gaston/i,
    parts: ['fingers', 'shoulder'],
    because: 'it holds an open-handed position under load',
  },
  {
    id: 'shoulder',
    // `press` as a word, not inside *Compression* or *pressed*; and the
    // letters as an I-Y-T, not the `t` in *Don't* (M326).
    pattern:
      /overhead|\bpress(?:es)?\b|dip\b|push[- ]?up|shoulder|scapul|face pull|\b[IYTW](?:-[IYTW]){1,3}\b|\b[YTW][- ]raises?\b/i,
    parts: ['shoulder'],
    because: 'it works through the shoulder',
  },
  {
    id: 'forearm',
    pattern: /wrist|forearm|extensor|hammer curl|reverse curl|rice bucket/i,
    parts: ['wrist', 'elbow'],
    because: 'it loads the forearm and wrist',
  },
  {
    id: 'hook',
    pattern: /heel hook|toe hook|high[- ]?step|drop[- ]?knee|rock[- ]?over|flag\b/i,
    parts: ['knee', 'hip'],
    because: 'it torques the knee and hip',
  },
  {
    id: 'hip',
    // `forward fold` and `toe touch` added at M161: the Toe Touch assessment
    // is a straight-leg forward fold and named neither a hip nor a hamstring,
    // so the scan read nothing off the one flexibility test in the catalogue.
    pattern: /\bhips?\b|hamstring|adductor|frog|pigeon|\bsplits?\b|straddle|forward fold|toe touch/i,
    parts: ['hip'],
    because: 'it works through the hip',
  },
  {
    id: 'legs',
    // `drop` came out at M326: its only hits were *drop knee*, which is
    // `hook`, and *"Drop to 3x8"*. Box jumps and step-ups came in.
    pattern: /squat|lunge|calf|ankle|hop\b|landing|\b(?:box|depth|broad) jumps?|step[- ]?ups?\b/i,
    parts: ['ankle', 'knee'],
    because: 'it loads the ankle and knee',
  },
  {
    id: 'core',
    // `core` as a word: *"Self-scored"* was reading as trunk work (M326).
    pattern: /\bcore\b|plank|hollow|dead ?bug|leg raise|\bab\b|oblique|hanging knee|toes[- ]to[- ]bar/i,
    parts: ['back'],
    because: 'it works through the trunk',
  },
];

/** What a piece of equipment loads by simply being used. */
export const EQUIPMENT_LOADS: Partial<Record<Equipment, { parts: BodyPart[]; because: string }>> = {
  hangboard: { parts: ['fingers', 'pulley'], because: 'hangboarding loads the fingers directly' },
  campus: {
    parts: ['fingers', 'pulley', 'elbow', 'shoulder'],
    because: 'campus work is the highest-force protocol there is',
  },
};

export interface LoadFinding {
  parts: BodyPart[];
  because: string;
}

/** Every rule that matches some text, hardest first. Empty when none do. */
export function scanText(text: string): LoadFinding[] {
  return rulesFor(rulesInText(text));
}

/**
 * A word the sentence says is not being done (PLAN.md M326).
 *
 * *"No hangboard this week"*, *"no crimp focus"*, *"with no dynamic moves"* —
 * a drill paragraph or a test's definition naming the thing it rules out.
 * Only the word straight before the match: "not a max hang but a repeater"
 * still reads the repeater.
 */
const NEGATED = /\b(?:no|not|without|never)\s+$/i;

function saysItDoes(rule: LoadRule, text: string): boolean {
  const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
  for (const match of text.matchAll(new RegExp(rule.pattern.source, flags))) {
    if (!NEGATED.test(text.slice(Math.max(0, (match.index ?? 0) - 12), match.index))) return true;
  }
  return false;
}

/** The rules some text matches, by name, hardest first (PLAN.md M137). */
export function rulesInText(text: string): DrillLoad[] {
  return LOAD_RULES.filter((rule) => saysItDoes(rule, text)).map((rule) => rule.id);
}

/** The findings for a set of rule names, in the rules' own order. */
function rulesFor(ids: Iterable<DrillLoad>): LoadFinding[] {
  const wanted = new Set(ids);
  return LOAD_RULES.filter((rule) => wanted.has(rule.id)).map(({ parts, because }) => ({ parts, because }));
}

/** The parts a text loads, deduplicated. */
export function partsInText(text: string): BodyPart[] {
  return [...new Set(scanText(text).flatMap((f) => f.parts))];
}

/**
 * What a line is called and what it is done on — never its notes (PLAN.md
 * M326).
 *
 * `Exercise.notes` is *"Form cue or caveat — never dosage"* by its own type,
 * and a caveat names what not to do: *"Skip entirely if sore from campus"*
 * made push-ups campus work, *"Bump to 3x20 if elbows feel tight"* told an
 * injured elbow its rehab was *"the highest-force protocol there is"*, and
 * *"Drop to 3x5 if shoulders feel beat up"* loaded the legs. Swept over the
 * catalogue's 231 distinct lines: fourteen gained a rule from their notes,
 * eight of them false; of the true ones, three said something the name did
 * not, and the table names those three now instead.
 *
 * The load stays: *"Jug or 20mm edge"* is what the line is done on.
 */
function joinExercise(exercise: Exercise): string {
  return [exercise.name, exercise.load].filter(Boolean).join(' ');
}

/** Every part an exercise loads, by its own words. Empty when none match. */
export function exerciseLoads(exercise: Exercise): BodyPart[] {
  return partsInText(joinExercise(exercise));
}

/**
 * Whether an exercise loads any of the injured parts, and why.
 *
 * Returns null rather than an empty finding so a caller can render nothing
 * without checking a length.
 */
export function exerciseConflict(exercise: Exercise, injured: readonly BodyPart[]): LoadFinding | null {
  return firstConflict(scanText(joinExercise(exercise)), injured);
}

function joinMetric(metric: Pick<Metric, 'label' | 'description'>): string {
  return [metric.label, metric.description].filter(Boolean).join(' ');
}

/** Every part an assessment loads, by its own words (PLAN.md M161). */
export function metricLoads(metric: Pick<Metric, 'label' | 'description'>): BodyPart[] {
  return partsInText(joinMetric(metric));
}

/**
 * Whether taking a test would load something the climber says is hurt.
 *
 * The same shape as `exerciseConflict` and `drillConflict`, and deliberately
 * so — an assessment *is* a prescription, and the most maximal one the app
 * ever asks for. `max_hang_20mm_7s` is added weight on a 7-second half-crimp
 * hang; `min_edge` is the smallest edge you can hold. Those are the sessions
 * people get hurt in, because a test is a maximal effort taken on purpose.
 *
 * Null when nothing collides, so a caller renders nothing without checking a
 * length. A metric that is a *record* rather than a test — a redpoint grade,
 * a count of outdoor days — names no movement, so it reads as no parts and
 * warns about nothing, which is the right answer without a taxonomy to
 * maintain.
 */
export function metricConflict(
  metric: Pick<Metric, 'label' | 'description'>,
  injured: readonly BodyPart[],
): LoadFinding | null {
  return firstConflict(scanText(joinMetric(metric)), injured);
}

/**
 * Everything a drill loads: its kit, its name and focus read now, and what
 * its text said when `loads` was derived from it (PLAN.md M137). The text
 * itself is out of the entry chunk; for 67 drills it was the only place the
 * words this scan looks for appeared, which is why they travel as data.
 */
export function drillFindings(drill: Pick<Drill, 'name' | 'focus' | 'loads' | 'equipment'>): LoadFinding[] {
  const byEquipment = drill.equipment
    .map((e) => EQUIPMENT_LOADS[e])
    .filter((v): v is { parts: BodyPart[]; because: string } => v !== undefined);
  return [...byEquipment, ...rulesFor([...rulesInText(`${drill.name} ${drill.focus}`), ...drill.loads])];
}

/** Every part a drill loads, deduplicated. */
export function drillLoads(drill: Pick<Drill, 'name' | 'focus' | 'loads' | 'equipment'>): BodyPart[] {
  return [...new Set(drillFindings(drill).flatMap((f) => f.parts))];
}

/** A drill's own words: its kit, its name, its focus and what its text loads. */
export function drillConflict(drill: Pick<Drill, 'name' | 'focus' | 'loads' | 'equipment'>, injured: readonly BodyPart[]): LoadFinding | null {
  return firstConflict(drillFindings(drill), injured);
}

function firstConflict(findings: LoadFinding[], injured: readonly BodyPart[]): LoadFinding | null {
  if (injured.length === 0) return null;
  for (const finding of findings) {
    const hit = finding.parts.filter((p) => injured.includes(p));
    if (hit.length > 0) return { parts: hit, because: finding.because };
  }
  return null;
}

export interface SessionConflict {
  /**
   * Which part of the day this is. The drill is not an exercise and does
   * not sit in a block, so a sentence that counts them together has to be
   * able to tell them apart.
   */
  kind: 'exercise' | 'drill' | 'climbing';
  /** Block name, or undefined for the session type itself. */
  block?: string;
  exercise: string;
  finding: LoadFinding;
}

/**
 * Everything in a session type that loads an injured part, in the phase
 * given. A program-wide count is what makes the warning worth reading:
 * "four exercises here load your elbow" is a decision, "this one does" is a
 * shrug.
 */
export function sessionConflicts(
  type: SessionType,
  phaseId: string,
  injured: readonly BodyPart[],
): SessionConflict[] {
  if (injured.length === 0) return [];
  const out: SessionConflict[] = [];
  for (const block of type.blocks ?? []) {
    const prescription = block.perPhase[phaseId];
    if (!prescription) continue;
    for (const exercise of prescription.exercises) {
      const finding = exerciseConflict(exercise, injured);
      if (finding) out.push({ kind: 'exercise', block: block.name, exercise: exercise.name, finding });
    }
  }
  return out;
}

// ── Rules the author wrote down (PLAN.md M153) ────────────────────────────

/**
 * The words a body part is called by, for reading a sentence about one.
 *
 * A second table in this file and not a second file, because the one above
 * answers a different question: `LOAD_RULES` matches an **activity** and
 * says what it loads — *"campus"* means fingers, pulley, elbow and shoulder
 * whether or not those words appear. This matches the **part itself**, for
 * text that names one: *"Never campus with any existing finger or elbow
 * symptom"* is about the elbow because it says elbow.
 *
 * Running `LOAD_RULES` over that sentence would answer the wrong question
 * and answer it confidently — it matches `campus` and reports four parts,
 * three of which the author never mentioned.
 *
 * A finger rule covers the pulley, because a pulley strain is a finger
 * injury and nothing authored says "pulley".
 */
export const PART_WORDS: Record<BodyPart, RegExp> = {
  fingers: /\bfingers?\b|\bpulley\b|\btendons?\b/i,
  pulley: /\bfingers?\b|\bpulley\b/i,
  // A hand rule covers the thumb and the knuckles, which is what a climber
  // means by it, and *not* the fingers — a finger rule already exists and
  // an author who wrote "finger" did not write "hand" (PLAN.md M223).
  hand: /\bhands?\b|\bthumbs?\b|\bknuckles?\b|\bpalms?\b/i,
  forearm: /\bforearms?\b|\bflexors?\b|\bextensors?\b/i,
  wrist: /\bwrists?\b/i,
  elbow: /\belbows?\b/i,
  shoulder: /\bshoulders?\b|\brotator cuff\b/i,
  lat: /\blats?\b|\blatissimus\b/i,
  neck: /\bneck\b|\bcervical\b/i,
  back: /\bback\b|\bspine\b|\blower back\b/i,
  rib: /\bribs?\b|\bintercostals?\b/i,
  hip: /\bhips?\b/i,
  // Its own rule now. The hip rule used to answer for the groin, which
  // reported a hip injury on a sentence about adductors and no groin injury
  // on one about hips.
  groin: /\bgroin\b|\badductors?\b/i,
  hamstring: /\bhamstrings?\b/i,
  knee: /\bknees?\b|\bmeniscus\b/i,
  ankle: /\bankles?\b/i,
  achilles: /\bachilles\b|\bheel\b/i,
  foot: /\bfeet\b|\bfoot\b|\btoes?\b/i,
};

/** The parts a sentence names outright. Empty when it names none. */
export function partsNamedIn(text: string): BodyPart[] {
  return (Object.keys(PART_WORDS) as BodyPart[]).filter((part) => PART_WORDS[part].test(text));
}

export interface ProtocolSafety {
  /**
   * Rules that name a part the climber has flagged. The author's own words
   * about the injury the app already knows about.
   */
  urgent: string[];
  /** Everything else the author wrote, which is true every session. */
  standing: string[];
}

/**
 * A protocol's safety rules, split by whether they are about this climber.
 *
 * **An authored rule is not the same kind of statement as a derived one.**
 * `LOAD_RULES` is a keyword scan that says so in its own header — advisory,
 * over-flags, never blocking. `Protocol.safety` is the person who wrote the
 * program saying *"Skip entirely with any elbow symptom"*. Where both apply
 * to the same line the authored one is the one to show, which is why this
 * is separate from `exerciseConflict` rather than folded into it.
 *
 * The `standing` half is the reason this exists at all: three of the seven
 * rules in the catalogue name no body part — *"The highest injury-risk
 * protocol in any program here"*, *"Miss a rung twice in a row and the
 * session is over"*, *"If you pump out, you went too hard"* — so no injury
 * path could ever have reached them, however the ranking was written.
 */
export function protocolSafety(
  protocol: Pick<Protocol, 'safety'> | undefined,
  injured: readonly BodyPart[] = [],
): ProtocolSafety {
  const rules = protocol?.safety ?? [];
  if (injured.length === 0) return { urgent: [], standing: [...rules] };
  const urgent: string[] = [];
  const standing: string[] = [];
  for (const rule of rules) {
    const named = partsNamedIn(rule);
    (named.some((p) => injured.includes(p)) ? urgent : standing).push(rule);
  }
  return { urgent, standing };
}

/**
 * The hurt parts the program's author has **not** already spoken about
 * (PLAN.md M267).
 *
 * The logger silences its keyword scan on a line whose protocol carries an
 * authored rule about the climber's injury, because the author's own words
 * are the stronger statement and a guess repeated under them is noise. That
 * is right about the part the rule names and wrong about every other part,
 * and the two are not the same set: Max Hangs is authored *"Warm up
 * thoroughly: never load near-max fingers cold"* and scans as fingers,
 * pulley, elbow **and shoulder**. A climber carrying a finger injury and a
 * shoulder injury was told to warm up and told nothing at all about the
 * shoulder, because one matching rule silenced the whole line.
 *
 * Nine of the twenty-two exercises in the catalogue that carry a
 * safety-bearing protocol name fewer parts than their own text loads;
 * Campus Double Dynos silences a knee.
 *
 * So the scan is asked about what is left rather than skipped outright.
 * Where the rules cover everything this returns nothing, `firstConflict`
 * reads an empty list as no conflict, and the behaviour is exactly what it
 * was.
 */
export function unspokenFor(
  protocol: Pick<Protocol, 'safety'> | undefined,
  injured: readonly BodyPart[],
): BodyPart[] {
  const spoken = new Set(protocolSafety(protocol, injured).urgent.flatMap((rule) => partsNamedIn(rule)));
  return injured.filter((part) => !spoken.has(part));
}

/** "your elbow", "your left pulley and your elbow". */
export function describeParts(parts: readonly BodyPart[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return `your ${parts[0]}`;
  return `your ${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export interface DayLoad {
  /** Every piece of the day that loads an injured part. */
  conflicts: SessionConflict[];
  /** The injured parts those pieces load, without repeats. */
  parts: BodyPart[];
}

/**
 * What a whole planned day loads, counted (PLAN.md M89).
 *
 * `sessionConflicts` reads a session type's blocks and stops there, which
 * leaves out the one piece of a day that is not in a block: the drill. A
 * day-level count that quietly missed it would be the wrong number in the
 * one place where the number is the entire point.
 *
 * Takes the shape of a planned day rather than importing one, so this
 * module stays clear of `plan.ts` and the week arithmetic that belongs
 * there. A rest day resolves to nothing on its own — every rest session
 * type in the catalog carries no blocks and no drill — so there is no
 * special case for one here.
 */
export function dayLoad(
  day: { sessionType?: SessionType; phase?: { id: string }; drill?: Drill },
  injured: readonly BodyPart[],
): DayLoad {
  const conflicts: SessionConflict[] = [];
  const climbing = day.sessionType ? climbingConflict(day.sessionType, injured) : null;
  if (climbing) conflicts.push(climbing);
  if (day.sessionType && day.phase) {
    conflicts.push(...sessionConflicts(day.sessionType, day.phase.id, injured));
  }
  if (day.drill) {
    const finding = drillConflict(day.drill, injured);
    if (finding) conflicts.push({ kind: 'drill', exercise: day.drill.name, finding });
  }
  return { conflicts, parts: [...new Set(conflicts.flatMap((c) => c.finding.parts))] };
}

/**
 * The climbing itself, on a day that is climbing (PLAN.md M327).
 *
 * Everything above reads a day's *words* — its exercises, its drill — and a
 * climbing session type prescribes neither: Max Intensity Bouldering is
 * burns, rests and a grade. So on 224 of the catalogue's 308 climbing
 * session-weeks a climber who had reported a hurt finger was told nothing
 * about the day, while `tissueLoad`, reading the same session afterwards,
 * counted it against the finger by definition. One question, two answers,
 * and the silent one was the one read before the session.
 *
 * All four of `CLIMBING_PARTS`, not only the fingers: the chart already says
 * a climbing session loads the elbow and the shoulder, and the day card
 * saying otherwise would be the disagreement this exists to end. That was
 * the climber's call to make, and it was made knowing it flags a returning
 * elbow on every climbing day.
 */
const CLIMBING_BECAUSE = 'climbing loads the fingers, the elbow and the shoulder';

function climbingConflict(type: SessionType, injured: readonly BodyPart[]): SessionConflict | null {
  if (!onTheWall(type)) return null;
  const hit = CLIMBING_PARTS.filter((part) => injured.includes(part));
  if (hit.length === 0) return null;
  return { kind: 'climbing', exercise: type.name, finding: { parts: hit, because: CLIMBING_BECAUSE } };
}

/**
 * "3 exercises load your elbow", "the drill loads your knee".
 *
 * Null when nothing conflicts, so a caller renders nothing without checking
 * a length. The count is the whole sentence: a climber deciding whether
 * today is worth the drive needs a number, not a reason — the reasons are
 * already beside each line once they are there.
 */
export function describeDayLoad(load: DayLoad): string | null {
  if (load.conflicts.length === 0) return null;
  const climbing = load.conflicts.some((c) => c.kind === 'climbing');
  const exercises = load.conflicts.filter((c) => c.kind === 'exercise').length;
  const drill = load.conflicts.some((c) => c.kind === 'drill');
  const pieces: string[] = [];
  if (climbing) pieces.push('Climbing');
  if (exercises > 0) pieces.push(`${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`);
  if (drill) pieces.push('the drill');
  const plural = pieces.length > 1 || exercises > 1;
  const listed = pieces.length > 2 ? `${pieces.slice(0, -1).join(', ')} and ${pieces.at(-1)}` : pieces.join(' and ');
  return `${listed} ${plural ? 'load' : 'loads'} ${describeParts(load.parts)}`;
}
