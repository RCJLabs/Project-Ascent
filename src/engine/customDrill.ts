import type { Discipline, Drill, DrillCategory, DrillId, Equipment } from '@/content/types';

/**
 * Writing your own drill (PLAN.md M286).
 *
 * The library ships 156 and **not one of them can be the climber's own**.
 * Programs are authorable since M7 and session types with them; drills are
 * content only. For a coach that is backwards — the drill is the thing they
 * would most want to write, because it is where their own coaching lives.
 * The shipped ones are somebody else's session plans; the one they have been
 * giving athletes for ten years has nowhere to go.
 *
 * ## A drill like any other, which is `customProgram.ts`'s rule
 *
 * That module states it and it holds here for the same reason: *"the moment a
 * written program is a second-class shape, every consumer needs a branch, and
 * the branches are where the prototype rotted."* A written drill is a `Drill`.
 * It goes in the same registry, answers `getDrill`, appears in the same
 * filters, and can be put on today from the same page.
 *
 * ## Where its words live
 *
 * The shipped drills keep their prose in `DRILL_TEXT`, a lazily-fetched map
 * keyed by id — 156 paragraphs that would otherwise sit in front of every
 * cold start. A written drill cannot be in that map, so it carries its own
 * `text`, and `drillText` falls back to it. One optional field on the type,
 * rather than a second lookup every reader has to know about.
 */

export const CUSTOM_DRILL_PREFIX = 'own_';

export function isCustomDrill(id: string): boolean {
  return id.startsWith(CUSTOM_DRILL_PREFIX);
}

export function newDrillId(): DrillId {
  // `customProgram.ts`'s id, for its reason: the timestamp keeps them
  // readable in a database inspector and `randomUUID` is what makes them
  // unique — four base-36 characters collided about 1.2% of the time.
  return `${CUSTOM_DRILL_PREFIX}${Date.now().toString(36)}-${crypto.randomUUID()}` as DrillId;
}

/** A skeleton that is coherent from the first render. */
export function blankDrill(): Drill {
  return {
    id: newDrillId(),
    name: '',
    duration: '',
    focus: '',
    loads: [],
    category: 'technique',
    discipline: 'both',
    level: '',
    equipment: ['wall'],
    sources: [],
    text: '',
  };
}

export interface DrillIssue {
  field: 'name' | 'focus' | 'text';
  message: string;
}

/**
 * What is still missing, worst first.
 *
 * Three fields, and only three. `customProgram.ts` validates at length
 * because a program that is half-written breaks the scheduler; a drill is
 * read by people, not walked by an engine, so the bar is whether a climber
 * opening it in six months knows what to do. A name, what it trains, and the
 * thing itself.
 *
 * Everything else has a working default: a category, a discipline and a kit
 * list are all pre-filled, and a blank duration or level reads as "not said"
 * rather than as broken.
 */
export function drillIssues(drill: Drill): DrillIssue[] {
  const out: DrillIssue[] = [];
  if (drill.name.trim() === '') out.push({ field: 'name', message: 'Give it a name.' });
  if ((drill.text ?? '').trim() === '') {
    out.push({ field: 'text', message: 'Say what the drill is — what you would tell someone doing it.' });
  }
  if (drill.focus.trim() === '') {
    out.push({ field: 'focus', message: 'Say what it trains, in a few words.' });
  }
  return out;
}

/** Trimmed, and with the fields that are lists left alone. */
export function tidyDrill(drill: Drill): Drill {
  return {
    ...drill,
    name: drill.name.trim().replace(/\s+/g, ' '),
    focus: drill.focus.trim().replace(/\s+/g, ' '),
    duration: drill.duration.trim(),
    level: drill.level.trim(),
    text: (drill.text ?? '').trim(),
  };
}

export const DRILL_DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'boulder', label: 'Bouldering' },
  { value: 'sport', label: 'Routes' },
];

/**
 * No kit list here.
 *
 * `customProgram.ts` exports `EQUIPMENT_LABELS` over every `Equipment`, and
 * the drill page already imports it. A second list would have been the shape
 * M169 named — and a first draft of this file wrote one with four values the
 * type does not have, which is how the drift starts.
 */

export type { DrillCategory, Equipment };
