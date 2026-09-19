import { getDrill } from '@/content/drills';
import { getMetric } from '@/content/metrics';
import type { DayOfWeek, Program, SessionType } from '@/content/types';
import { EQUIPMENT_LABELS } from './customProgram';
import { dosageLine } from './prescription';
import { sessionMinutes } from './sessionLength';

/**
 * A program as something an athlete can read (PLAN.md M288).
 *
 * `programFile.ts` exists so a coach can hand somebody a block, and the card
 * that offers it says who for in its own copy: *"Anyone with the app can
 * import it."* Which is the problem — **the athlete who does not have the app
 * is the common case**, and for them a coach has a JSON file and nothing else.
 *
 * ## Markdown, and why that is the honest format
 *
 * Not a PDF: a renderer is a dependency and an offline-first app should not
 * grow one to write a page of text. Not HTML: a coach pastes this into a
 * message, and markup is the wrong thing to paste. Markdown reads as plain
 * text where nothing renders it and as a document where something does, which
 * is the whole of what a handout needs.
 *
 * ## What it contains, and what it leaves out
 *
 * The athlete's questions, in the order they ask them: what is this, what does
 * a week look like, what happens in each session, and what gets tested. It
 * leaves out everything the app needs and a person does not — ids, tracks the
 * reader has not picked, the graduation graph, and the catalogue metadata that
 * only means something inside the app.
 *
 * **It never invents.** Every line is a field somebody wrote. A program with
 * no layout gets no week section rather than a guessed one, and a session type
 * with no prescription is named with its description and left there — which is
 * what a "menu" session type genuinely is.
 */

const DAY_NAMES: Record<DayOfWeek, string> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

/** A heading and its body, dropped entirely when the body is empty. */
function section(heading: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [heading, '', ...lines, ''];
}

/**
 * The facts under the title: how long, for whom, what it needs.
 *
 * Joined with a middot rather than listed, because three short facts on three
 * lines reads as a form and on one line reads as a sentence.
 */
function factLine(program: Program): string {
  const facts = [`${program.weeks} weeks`];
  /**
   * The label when the author wrote one, the range itself when they did not.
   * Iron Grip has no label and reads "V5-V8" everywhere else in the app, and
   * a handout that silently drops who a program is for is missing the fact an
   * athlete checks first.
   */
  const { label, min, max } = program.gradeRange;
  if (label) facts.push(label);
  else if (min && max) facts.push(min === max ? min : `${min}-${max}`);
  const kit = program.equipment.filter((e) => e !== 'none').map((e) => EQUIPMENT_LABELS[e]);
  if (kit.length > 0) facts.push(`Needs: ${kit.join(', ')}`);
  return facts.join(' · ');
}

/** The week, if the program recommends one. */
function weekLines(program: Program): string[] {
  const layout = program.recommendedLayout;
  if (!layout) return [];
  const byId = new Map(program.sessionTypes.map((t) => [t.id, t.name]));
  const days = (Object.keys(layout.slots) as unknown as DayOfWeek[])
    .map((d) => Number(d) as DayOfWeek)
    .sort((a, b) => a - b);
  return days.map((day) => {
    const id = layout.slots[day];
    return `- **${DAY_NAMES[day]}** — ${id ? (byId.get(id) ?? id) : 'Rest'}`;
  });
}

/** The blocks, and how they run in each phase that prescribes them. */
function sessionLines(program: Program, type: SessionType): string[] {
  const out: string[] = [];
  /**
   * The authored duration if there is one, otherwise the estimate the app
   * reads off the prescription. `sessionLength.ts` owns that rule and states
   * it: an authored number is allowed only where the dose cannot say.
   */
  const estimate = sessionMinutes({ type, program });
  const howLong =
    type.duration ||
    (estimate === null
      ? ''
      : estimate.low === estimate.high
        ? `about ${estimate.low} min`
        : `about ${estimate.low}-${estimate.high} min`);
  const heading = [type.name, howLong].filter(Boolean).join(' — ');
  out.push(`### ${heading}`, '');
  if (type.description) out.push(type.description, '');

  const trackName = new Map((program.tracks ?? []).map((t) => [t.id, t.name]));
  const beforeBlocks = out.length;

  for (const block of type.blocks ?? []) {
    // A block is listed once per distinct dose, not once per phase: twelve
    // identical rows is a table nobody reads, and `flatAcrossPhases` exists
    // because a flat block is a real thing rather than an oversight.
    const seen = new Set<string>();
    for (const phase of program.phases) {
      const prescription = block.perPhase[phase.id];
      if (!prescription || prescription.exercises.length === 0) continue;
      const lines = prescription.exercises.map((ex) => {
        const dose = dosageLine(ex);
        /**
         * The track, named on the line (PLAN.md M288).
         *
         * Reading the first draft's output for Iron Grip found this: the
         * Spark phase listed six campus exercises with nothing to say they
         * are **alternatives**, so a handout told an athlete to do all six.
         * `Program.tracks` is the field the app uses to show one path at a
         * time, and a document that drops it is not a simplification, it is
         * a different program.
         */
        const track = ex.track ? trackName.get(ex.track) ?? ex.track : null;
        return `  - ${ex.name}${dose ? ` — ${dose}` : ''}${track ? ` *(${track})*` : ''}`;
      });
      const key = lines.join('\n');
      if (seen.has(key)) continue;
      seen.add(key);
      // An em-dash, not brackets: half the phase names have brackets of their
      // own and "(The Anvil (Repeaters))" is what nesting them reads like.
      const when = seen.size === 1 && program.phases.length === 1 ? '' : ` — ${phase.name}`;
      // "Pick two of these" is part of the prescription, not a detail.
      const pick = prescription.selection
        ? ` — pick ${prescription.selection.pick}${prescription.selection.note ? `. ${prescription.selection.note}` : ''}`
        : '';
      out.push(`- **${block.name}**${when}${pick}`, ...lines);
    }
  }

  const drills = Object.entries(type.drillsByWeek ?? {});
  if (drills.length > 0) {
    out.push('', 'Drills, by week:');
    for (const [week, id] of drills) {
      const drill = getDrill(id);
      out.push(`  - Week ${week} — ${drill?.name ?? id}`);
    }
  }
  /**
   * A session with nothing under it says so.
   *
   * `section` above refuses to leave an empty heading behind, and this is
   * the same rule one level down. The browser found it: the sample
   * climber's own program carries two named session types and no blocks at
   * all, which is what a program written in the builder looks like until
   * somebody fills it in — and the handout gave the athlete a heading, a
   * sentence of description, and a void.
   */
  if (out.length === beforeBlocks) out.push('*Nothing written down for this one yet.*');
  out.push('');
  return out;
}

/**
 * The whole handout.
 *
 * `today` is passed rather than read, for the reason every engine here gives:
 * a test that depends on when it runs is a test that fails one morning.
 */
export function programHandout(program: Program, today: string): string {
  const out: string[] = [`# ${program.name}`, ''];
  if (program.subtitle) out.push(`*${program.subtitle}*`, '');
  out.push(factLine(program), '');
  if (program.intro?.pitch) out.push(program.intro.pitch, '');

  out.push(...section('## The week', weekLines(program)));

  out.push(
    ...section(
      '## The blocks',
      program.phases.map((phase) => {
        const weeks =
          phase.weekStart === phase.weekEnd
            ? `week ${phase.weekStart}`
            : `weeks ${phase.weekStart}–${phase.weekEnd}`;
        return `- **${phase.name}** (${weeks})${phase.description ? ` — ${phase.description}` : ''}`;
      }),
    ),
  );

  /**
   * What a track is, said once (PLAN.md M288).
   *
   * The lines below are tagged with theirs, and a tag nobody explained is
   * noise. The app asks a climber to pick a track when they start; a handout
   * has to ask the same thing in words.
   */
  out.push(
    ...section(
      '## Pick a track',
      (program.tracks ?? []).map(
        (track) => `- **${track.name}**${track.description ? ` — ${track.description}` : ''}`,
      ),
    ),
  );
  if ((program.tracks ?? []).length > 0) {
    out.push('Lines below are marked with the track they belong to. Pick one and stay on it.', '');
  }

  const sessions = program.sessionTypes.flatMap((type) => sessionLines(program, type));
  if (sessions.length > 0) out.push('## The sessions', '', ...sessions);

  out.push(
    ...section(
      '## What gets tested',
      // The metric's name, not its id. A handout that says
      // `max_hang_20mm_7s` is a handout written for the database.
      (program.assessments ?? []).map((id) => `- ${getMetric(id)?.label ?? id}`),
    ),
  );

  // Where it came from, so an athlete holding a printout knows what it is and
  // a coach reading it back knows which version they sent.
  out.push('---', '', `${program.name} · written in Project Ascent · ${today}`);
  return out.join('\n');
}

/** What the file is called, matching `programFile.ts`'s own naming. */
export function handoutName(program: Program): string {
  const slug = program.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug || 'program'}.md`;
}
