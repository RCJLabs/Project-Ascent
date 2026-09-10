import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROGRAMS } from '../programs';
import { guideFor } from './index';
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
   * The mechanism closes the gap for six of the nine. These three need a
   * week table written, which is authoring rather than plumbing: Lockdown
   * and Iron Grip have no week-by-week table at all, and The Long Game and
   * The Cruiser stop theirs partway through the block.
   */
  const NO_ROW_TO_MARK: Record<string, number[]> = {
    lockdown: [4, 8],
    iron_grip: [4, 8],
    the_long_game: [8],
    the_cruiser: [8, 12],
  };

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
 * The guide's armour blocks are marked non-negotiable and starred. If the
 * program does not carry them, the session screen will never hand one over
 * and the only place they exist is prose the climber has to remember.
 */
const EXERCISE_GAPS: Record<string, string[]> = {
  ground_zero: ['Band Face Pulls', 'Front Delt Raises', 'Side Delt Raises'],
  lockdown: ['Band Face Pulls', 'Hanging Windshield Wipers', 'Wide-Grip Pull-Ups'],
  the_long_game: ['Band Face Pulls'],
};

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
 * own words. Nine guides print an entry table; six of those programs declare
 * nothing, so the finder cannot rule the climber out and the standard is
 * exactly the prose the field was added to replace.
 */
const ENTRY_TABLE_WITHOUT_PREREQUISITES = [
  'base_camp',
  'ground_zero',
  'gravity_defied',
  'iron_grip',
  'the_cruiser',
  'the_long_game',
];

describe('entry standards', () => {
  const entryTables = (guide: Guide) =>
    tables(guide).filter((t) => /standard|requirement/i.test(t.head.join(' ')));

  it('are data where the program declares them, and prose everywhere else', () => {
    const prose = PAIRS.filter(
      ({ program, guide }) => entryTables(guide).length > 0 && program.prerequisites === undefined,
    ).map((p) => p.program.id);
    expect(prose.sort()).toEqual([...ENTRY_TABLE_WITHOUT_PREREQUISITES].sort());
  });

  it('are printed by every program guide', () => {
    const without = PAIRS.filter(({ guide }) => entryTables(guide).length === 0).map((p) => p.program.id);
    // The outdoor mode has no entry standard to state; it is not a block.
    expect(without).toEqual(['outdoor_climbing']);
  });
});
