import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getMetric } from '../metrics';
import { PROGRAMS } from '../programs';
import { guideFor } from './index';
import type { Exercise } from '../types';
import type { Guide, GuideBlock } from './types';

/**
 * A program guide against the program it describes.
 *
 * `guides.test.ts` checks the *app* guide against the engines it quotes and
 * does it thoroughly. Nothing checked the nine **program** guides — 2,800
 * lines telling a climber how a block runs — against the programs the app
 * actually schedules. A guide that describes a week the app does not run is
 * the same failure as a guide describing a feature that does not exist, and
 * it is harder to notice because both halves look plausible on their own.
 *
 * ## The allow-lists below are debt, not decisions
 *
 * Where a guide and its program disagree today, the disagreement is named
 * here rather than silently tolerated. Every entry is an open question for
 * whoever owns the training content — *which one is right?* — and none of
 * them can be settled by reading the code. What this file does guarantee is
 * that the list cannot grow without someone editing it.
 */

const blocks = (g: Guide): GuideBlock[] => g.sections.flatMap((s) => s.content);
/** Everything authored in a guide, section titles included — they are prose
 *  a climber reads, and leaving them out is how "Baseline — Week 14" got
 *  past the first version of the week check. */
const authored = (g: Guide): string[] => [
  ...g.sections.map((s) => s.title),
  ...blocks(g).flatMap(strings),
];
const tables = (g: Guide) => blocks(g).flatMap((b) => (b.kind === 'table' ? [b] : []));

function strings(block: GuideBlock): string[] {
  switch (block.kind) {
    case 'p':
    case 'h':
    case 'quote':
    case 'note':
      return [block.text];
    case 'list':
      return block.items;
    case 'warn':
      return [block.title, ...block.items, ...(block.footer === undefined ? [] : [block.footer])];
    case 'exercises':
      return [block.name, ...block.items, ...(block.group === undefined ? [] : [block.group])];
    case 'table':
      return [...block.head, ...block.rows.flat()];
  }
}

/** Every program that has a guide, paired with it. */
const PAIRS = PROGRAMS.flatMap((program) => {
  const guide = guideFor(program.id);
  return guide ? [{ program, guide }] : [];
});

describe('a program guide and its program', () => {
  it('covers every program but the one with no guide', () => {
    expect(PAIRS.length).toBeGreaterThan(0);
    const uncovered = PROGRAMS.filter((p) => guideFor(p.id) === undefined).map((p) => p.id);
    expect(uncovered).toEqual(['general_training']);
  });

  it('agrees on how many weeks the block runs', () => {
    const wrong: string[] = [];
    for (const { program, guide } of PAIRS) {
      const claimed = /(\d+)[-\s]?Week/i.exec(guide.subtitle ?? '')?.[1];
      if (claimed !== undefined && Number(claimed) !== program.weeks) {
        wrong.push(`${program.id}: guide says ${claimed} weeks, program runs ${program.weeks}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('never sends a climber to a week the program does not have', () => {
    const over: string[] = [];
    for (const { program, guide } of PAIRS) {
      const referenced = new Set<number>();
      for (const text of authored(guide)) {
        for (const match of text.matchAll(/\bWeeks?\s*(\d+)\s*(?:[–—-]\s*(\d+))?/gi)) {
          referenced.add(Number(match[1]));
          if (match[2] !== undefined) referenced.add(Number(match[2]));
        }
      }
      for (const week of referenced) {
        // Week 0 is the baseline session several guides prescribe before
        // week 1, which the program models as its own thing.
        if (week > program.weeks) over.push(`${program.id}: week ${week} of ${program.weeks}`);
      }
    }
    expect(over.sort()).toEqual([]);
  });
});

/**
 * Which weeks are deloads.
 *
 * `deloadWeeks` is what the app acts on: the calendar marks the week, the
 * session carries a `deload` flag, and the training-state card uses it to
 * explain a dip in load rather than call it detraining.
 *
 * **A guide can no longer state one.** Eight of the nine used to write
 * "DELOAD" into a week row by hand and eight of the nine disagreed with
 * their program — two outright, one describing a deload week the program did
 * not have at all. `GuideBody` now derives the mark from the program, so the
 * only thing left to check is that the guide's own prose has not drifted
 * back into contradicting it (PLAN.md M34).
 */
/**
 * A cell *labels* a week a deload, rather than using the word in a sentence.
 *
 * Peak Performance's week 12 reads "Deload volume. All energy toward
 * project." — a SEND week that tapers, not a deload week. Matching the bare
 * word flagged it, which would have made the check demand a program change
 * that would have been wrong.
 */
const claimsDeload = (cell: string): boolean =>
  /\bDELOAD\b/.test(cell) || /\bDeload\b(?!\s+[a-z])/.test(cell);

describe('which weeks are deloads', () => {
  const labelled = (guide: Guide): number[] => {
    const weeks = new Set<number>();
    for (const table of tables(guide)) {
      for (const row of table.rows) {
        // Same rule the renderer uses: a single week, never a range.
        const week = Number(/^(\d+)(?!\s*[–—-]\s*\d)/.exec(row[0]?.trim() ?? '')?.[1]);
        if (!Number.isFinite(week)) continue;
        if (row.some(claimsDeload)) weeks.add(week);
      }
    }
    return [...weeks].sort((a, b) => a - b);
  };

  it('is never a week the program does not schedule', () => {
    // The guide may still *name* a deload phase in a phase column — Peak
    // Performance's weeks really are called "Deload 1" and "Deload 2". It
    // may not name one on a week the app treats as ordinary.
    const wrong: string[] = [];
    for (const { program, guide } of PAIRS) {
      const scheduled = new Set(program.deloadWeeks ?? []);
      for (const week of labelled(guide)) {
        if (!scheduled.has(week)) {
          wrong.push(`${program.id}: guide calls week ${week} a deload; program schedules [${[...scheduled].join(',')}]`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  /** Weeks a guide's own week tables have a row for. */
  const weekRows = (guide: Guide): Set<number> => {
    const weeks = new Set<number>();
    for (const table of tables(guide)) {
      if (!/^weeks?$/i.test((table.head[0] ?? '').trim())) continue;
      for (const row of table.rows) {
        const match = /^(\d+)(?!\s*[–—-]\s*\d)/.exec(row[0]?.trim() ?? '');
        if (match !== null) weeks.add(Number(match[1]));
      }
    }
    return weeks;
  };

  /**
   * Deload weeks the guide has no row for, so the derived mark has nowhere
   * to land and the reader is never told.
   *
   * Empty, and it stays empty (PLAN.md M77). It used to carry seven weeks
   * across four guides — Lockdown and Iron Grip had no week table at all,
   * The Long Game and The Cruiser stopped theirs partway — and each of those
   * guides now has a row for every week the program runs.
   */
  const NO_ROW_TO_MARK: Record<string, number[]> = {};

  it('reaches the reader wherever the guide has a week to put it on', () => {
    const gaps: Record<string, number[]> = {};
    for (const { program, guide } of PAIRS) {
      const rows = weekRows(guide);
      const missing = (program.deloadWeeks ?? []).filter((week) => !rows.has(week));
      if (missing.length > 0) gaps[program.id] = missing;
    }
    expect(gaps).toEqual(NO_ROW_TO_MARK);
  });

  it('is rendered from the program rather than authored', () => {
    const body = readFileSync('src/features/guides/GuideBody.tsx', 'utf8');
    expect(body).toContain('deloadWeeks');
    // The rules themselves live in `weekMarks.ts`, where they can be tested.
    expect(body).toMatch(/marksDeload\(block\.head, row, deloadWeeks\)/);
    const page = readFileSync('src/features/guides/GuidePage.tsx', 'utf8');
    expect(page).toMatch(/deloadWeeks: program\.deloadWeeks/);
  });
});

/**
 * Exercises a guide prescribes that its program never schedules.
 *
 * Empty, and it stays empty (PLAN.md M77). The seven it used to list were
 * not missing from their programs — every one was there under another
 * spelling: the guide's "Band Face Pulls" was the program's "Face Pulls
 * (Band)", "Wide-Grip Pull-Ups" was "Wide Pull-Ups", "Hanging Windshield
 * Wipers" was "Wipers (bent-knee)". The programs now use one name per
 * movement, and `RETIRED_NAMES` below keeps the old spellings from coming
 * back.
 */
const EXERCISE_GAPS: Record<string, string[]> = {};

/**
 * One movement, one name, across every program and guide.
 *
 * The catalogue had "Face Pulls" in four programs, "Band Face Pulls" in
 * four and "Face Pulls (Band)" in one — and every guide said "Band Face
 * Pulls", so the gap check reported three programs missing an exercise all
 * three had. A general rule cannot be written for this ("Wide Pull-Ups" and
 * "Wide-Grip Pull-Ups" share no normal form a machine would trust), so it is
 * a list: the spellings that were retired, and what replaced each. The
 * glossary was the tie-breaker wherever it had an entry.
 */
const RETIRED_NAMES: Record<string, string> = {
  'Face Pulls': 'Band Face Pulls',
  'Wide Pull-Ups': 'Wide-Grip Pull-Ups',
  'Windshield Wipers': 'Hanging Windshield Wipers',
  Wipers: 'Hanging Windshield Wipers',
  'Side Delt Raises': 'Side/Front Delt Raises',
  'Front Delt Raises': 'Side/Front Delt Raises',
};

describe('one movement, one name', () => {
  /** "Wipers (bent-knee)" is a variant of "Wipers"; the qualifier is kit or progression. */
  const bare = (name: string) => name.replace(/\([^)]*\)/g, '').trim();

  it('uses no retired spelling in any program', () => {
    const found: string[] = [];
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const block of type.blocks ?? []) {
          for (const phase of Object.values(block.perPhase ?? {})) {
            for (const exercise of phase.exercises ?? []) {
              const retired = RETIRED_NAMES[bare(exercise.name)];
              if (retired) found.push(`${program.id}: "${exercise.name}" → ${retired}`);
            }
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('uses no retired spelling in any guide', () => {
    const found: string[] = [];
    for (const { program, guide } of PAIRS) {
      for (const block of blocks(guide)) {
        if (block.kind !== 'exercises') continue;
        for (const item of block.items) {
          const head = bare(item.split(':')[0] ?? '');
          const retired = RETIRED_NAMES[head];
          if (retired) found.push(`${program.id}: "${head}" → ${retired}`);
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('retires nothing the catalogue still needs', () => {
    // Every replacement is a name some program actually prescribes, so the
    // list points at real movements rather than at spellings nobody uses.
    const names = new Set<string>();
    for (const program of PROGRAMS) {
      for (const type of program.sessionTypes) {
        for (const block of type.blocks ?? []) {
          for (const phase of Object.values(block.perPhase ?? {})) {
            for (const exercise of phase.exercises ?? []) names.add(bare(exercise.name));
          }
        }
      }
    }
    for (const canonical of new Set(Object.values(RETIRED_NAMES))) {
      expect(names.has(canonical), canonical).toBe(true);
    }
  });
});

describe('exercises the guide prescribes', () => {
  /** "Weighted Pull-Ups: 3×8" → "Weighted Pull-Ups". Prose lines give ''. */
  const prescribed = (item: string): string => {
    const head = item.split(':')[0]?.trim() ?? '';
    if (head === '' || head === item.trim() || head.length > 45) return '';
    if (/[.!?★]/.test(head)) return '';
    if (/^(pick|track|pool|grip|progression|option|same)\b/i.test(head)) return '';
    return head;
  };
  // A parenthetical names the kit, not a different exercise: the guide's
  // "Finger Extensions (Rubber Band)" is the program's "Finger Extensions".
  const norm = (s: string) => s.replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

  const programExercises = (programId: string): Set<string> => {
    const program = PROGRAMS.find((p) => p.id === programId)!;
    const out = new Set<string>();
    for (const type of program.sessionTypes) {
      for (const block of type.blocks ?? []) {
        for (const phase of Object.values(block.perPhase ?? {})) {
          for (const exercise of phase.exercises ?? []) out.add(exercise.name);
        }
      }
    }
    return out;
  };

  it('exist in the program, or are on the list of known gaps', () => {
    const surprises: string[] = [];
    for (const { program, guide } of PAIRS) {
      const real = new Set([...programExercises(program.id)].map(norm));
      const named = blocks(guide).flatMap((b) =>
        b.kind === 'exercises' ? b.items.map(prescribed).filter((n) => n !== '') : [],
      );
      const gaps = [...new Set(named.filter((n) => !real.has(norm(n))))].sort();
      const known = (EXERCISE_GAPS[program.id] ?? []).slice().sort();
      if (gaps.join('|') !== known.join('|')) {
        surprises.push(`${program.id}: [${gaps.join(', ')}] against listed [${known.join(', ')}]`);
      }
    }
    expect(surprises).toEqual([]);
  });

  it('is a check with something to check', () => {
    // Base Camp and The Siege write their exercises as prose rather than
    // "Name: prescription", so this test says nothing about them at all —
    // which is worth knowing, because it looks like a pass.
    const unchecked = PAIRS.filter(({ guide }) =>
      blocks(guide)
        .flatMap((b) => (b.kind === 'exercises' ? b.items.map(prescribed) : []))
        .every((n) => n === ''),
    ).map((p) => p.program.id);
    expect(unchecked.sort()).toEqual(['base_camp', 'outdoor_climbing', 'the_siege']);
  });
});

/**
 * Entry requirements a climber can be measured against.
 *
 * `Program.prerequisites` exists so entry standards are "checkable against
 * the user's own data instead of living in prose the app can't read" — its
 * own words (PLAN.md M35).
 *
 * **An entry table is found by the heading above it, not by its columns.**
 * Matching `Standard | Minimum` in a header also matches a *Graduation
 * Standards* table, which is the opposite thing: Ground Zero's only such
 * table is what you should be able to do at the *end*, and counting it as an
 * entry requirement is how the audit came to report six programs where there
 * are five — and how wiring it would have blocked every beginner from the
 * beginner program.
 */
describe('entry standards', () => {
  const entryTables = (guide: Guide) =>
    guide.sections.flatMap((section) => {
      let entry = false;
      const found = [];
      for (const block of section.content) {
        if (block.kind === 'h') entry = /entry|prerequisite/i.test(block.text);
        if (block.kind === 'table' && entry) found.push(block);
      }
      return found;
    });

  it('does not mistake a graduation table for an entry table', () => {
    const groundZero = PAIRS.find((p) => p.program.id === 'ground_zero')!;
    expect(entryTables(groundZero.guide)).toEqual([]);
    expect(
      tables(groundZero.guide).some((t) => /standard/i.test(t.head.join(' '))),
      'the table this is guarding against has gone',
    ).toBe(true);
  });

  it('are data wherever a guide prints an entry table', () => {
    const prose = PAIRS.filter(
      ({ program, guide }) => entryTables(guide).length > 0 && program.prerequisites === undefined,
    ).map((p) => p.program.id);
    expect(prose).toEqual([]);
  });

  it('is a check with something to check', () => {
    const printing = PAIRS.filter(({ guide }) => entryTables(guide).length > 0).map((p) => p.program.id);
    expect(printing.length).toBeGreaterThan(4);
  });

  it('never sets a standard on a benchmark where lower is better', () => {
    // `atLeast` on `min_edge` or `toe_touch` would read the wrong way round.
    for (const { program } of PAIRS) {
      for (const prereq of program.prerequisites?.metrics ?? []) {
        expect(getMetric(prereq.metricId)?.higherIsBetter, `${program.id}/${prereq.metricId}`).toBe(true);
      }
    }
  });
  /**
   * A dose a guide prints must be a dose the program prescribes (PLAN.md M33).
   *
   * Making the phase progressions real meant several blocks now carry two or
   * three different doses across twelve weeks, and every one of those numbers
   * is also written out in prose in the guide. Nothing checked the two
   * against each other, and the measurement found two that had already
   * drifted before this milestone touched anything: Lockdown's guide printed
   * its dip at 3x8-10 against a program that says 3x10-12 — and whose own
   * rationale says "add load if 12 reps is easy" — and its Hammer Curls at
   * 2x10 against 2x12 everywhere else in the catalogue.
   *
   * The rule is deliberately loose in one direction: a guide line may state
   * any *one* phase's dose, because that is how these guides are written —
   * the entry number, then the progression after an arrow. It is strict in
   * the other: every number on the line has to be a real one.
   */
  describe('printed doses', () => {
    /** '3×15', '3x10-12', '2×12/arm', '3×10–12' — every one on the line. */
    const doses = (text: string): [string, string][] =>
      [...text.matchAll(/(\d+)\s*[x×]\s*(\d+(?:\s*[–—-]\s*\d+)?)/g)].map(
        (m) => [m[1]!, m[2]!.replace(/\s*[–—-]\s*/, '-')] as [string, string],
      );

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    /** The exercise a guide line is about, minus the ways guides dress it up. */
    const named = (item: string) =>
      item
        .replace(/^Track [AB]:\s*/i, '')
        .replace(/\([^)]*\)/g, '')
        .split(/[:0-9]/)[0]!
        .trim();

    function audit() {
      const wrong: string[] = [];
      let seen = 0;
      let skipped = 0;
      for (const program of PROGRAMS) {
        const guide = guideFor(program.id);
        if (!guide) continue;
        const byName = new Map<string, Exercise[]>();
        for (const session of program.sessionTypes) {
          for (const block of session.blocks ?? []) {
            for (const prescription of Object.values(block.perPhase)) {
              for (const exercise of prescription.exercises) {
                const key = norm(exercise.name);
                byName.set(key, [...(byName.get(key) ?? []), exercise]);
              }
            }
          }
        }
        for (const block of blocks(guide)) {
          if (block.kind !== 'exercises') continue;
          for (const item of block.items) {
            const stated = doses(item);
            if (stated.length === 0) continue;
            const name = named(item);
            // A guide names plenty the program does not prescribe as a block
            // — warm-up movements, menu pools, "X 3x8 or Y 3x10" written as
            // one line. Those are out of range here, not failures.
            const hits = byName.get(norm(name)) ?? byName.get(norm(name.replace(/^Band /i, '')));
            if (!hits) { skipped += stated.length; continue; }
            for (const [sets, amount] of stated) {
              seen += 1;
              const bare = amount.replace(/s$/, '');
              const ok = hits.some((e) => {
                if ((e.sets ?? '') !== sets) return false;
                const reps = (e.reps ?? '').replace(/\s.*/, '');
                const hold = (e.hold ?? '').replace(/s$/, '');
                return reps === amount || reps === bare || hold === bare || hold === amount;
              });
              if (!ok) {
                wrong.push(
                  `${program.id}: "${item.slice(0, 60)}" says ${sets}x${amount}; the program prescribes ` +
                    hits.map((e) => `${e.sets ?? '-'}x${e.reps ?? e.hold ?? '-'}`).join(' / '),
                );
              }
            }
          }
        }
      }
      return { wrong, seen, skipped };
    }

    it('never prints a dose the program does not prescribe', () => {
      expect(audit().wrong).toEqual([]);
    });

    it('actually reaches the doses it claims to check', () => {
      // Without this the check passes just as well when the name matching
      // silently stops resolving anything — the failure mode that let an
      // accessibility sweep here drop from 25 pages to 4 (PLAN.md M40).
      const { seen, skipped } = audit();
      expect(seen).toBeGreaterThan(90);
      expect(seen).toBeGreaterThan(skipped * 2);
    });
  });
});
