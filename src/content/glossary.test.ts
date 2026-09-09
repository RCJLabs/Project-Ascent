import { describe, expect, it } from 'vitest';
import { PROTOCOLS } from './protocols';
import { PROGRAMS } from './programs';
import type { Program } from './types';
import { displayGrade } from '@/engine/grades';
import {
  CATEGORY_BLURB,
  CATEGORY_ORDER,
  GLOSSARY,
  groupByCategory,
  hasTerm,
  lookup,
  searchGlossary,
  type GlossaryEntry,
} from './glossary';

describe('glossary data', () => {
  it('defines every term exactly once', () => {
    const seen = new Map<string, number>();
    for (const entry of GLOSSARY) {
      const key = entry.term.trim().toLowerCase();
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    expect([...seen.entries()].filter(([, n]) => n > 1)).toEqual([]);
  });

  it('has a term, a category and a definition on every entry', () => {
    const broken = GLOSSARY.filter(
      (e) => e.term.trim() === '' || e.definition.trim() === '' || !CATEGORY_ORDER.includes(e.category),
    );
    expect(broken).toEqual([]);
  });

  it('gives every category a display order and a blurb', () => {
    const used = new Set(GLOSSARY.map((e) => e.category));
    for (const category of used) {
      expect(CATEGORY_ORDER).toContain(category);
      expect(CATEGORY_BLURB[category]).toBeTruthy();
    }
  });

  it('keeps every category populated — an empty filter chip is a dead end', () => {
    for (const category of CATEGORY_ORDER) {
      expect(GLOSSARY.filter((e) => e.category === category).length).toBeGreaterThan(0);
    }
  });

  it('writes definitions, not stubs', () => {
    const thin = GLOSSARY.filter((e) => e.definition.length < 30);
    expect(thin).toEqual([]);
  });
});

/**
 * The glossary and the grade toggle must tell the same story. These parse
 * the conversions out of the prose so the check cannot drift from what a
 * climber actually reads.
 */
describe('grade conversions agree with engine/grades', () => {
  const definitionOf = (term: string): string => {
    const entry = lookup(term);
    expect(entry, `missing glossary entry: ${term}`).toBeDefined();
    return (entry as GlossaryEntry).definition;
  };

  /** Pull `Font 6A ≈ V3` / `French 7a ≈ 5.11c` pairs out of a definition. */
  const pairs = (definition: string): [string, string][] =>
    [...definition.matchAll(/(?:Font|French)\s+(\S+?)\s+≈\s+(?:YDS\s+)?([^,\s]+)/g)].map(
      // The dot belongs to a YDS grade, so it is captured and any sentence
      // full stop trimmed afterwards rather than excluded up front.
      (m) => [m[1]!, m[2]!.replace(/\.$/, '')],
    );

  it('states Font conversions that match the V ladder', () => {
    const found = pairs(definitionOf('Font Grade (Fontainebleau)'));
    expect(found.length).toBeGreaterThan(0);
    for (const [font, v] of found) {
      expect(displayGrade('V', v, { boulder: 'Font', route: 'YDS' })).toBe(font);
    }
  });

  it('states French conversions that match the YDS ladder', () => {
    const found = pairs(definitionOf('French Grade'));
    expect(found.length).toBeGreaterThan(0);
    for (const [french, yds] of found) {
      expect(displayGrade('YDS', yds, { boulder: 'V', route: 'French' })).toBe(french);
    }
  });
});

describe('lookup', () => {
  it('finds a term regardless of case and surrounding space', () => {
    expect(lookup('  half crimp  ')?.term).toBe('Half Crimp');
    expect(lookup('BETA')?.term).toBe('Beta');
  });

  it('does not guess', () => {
    // The whole reason the match is exact: a fuzzy one offers "Deadlift"
    // for "Deadhang" and teaches the wrong thing.
    expect(lookup('Dead')).toBeUndefined();
    expect(lookup('crimping technique')).toBeUndefined();
  });

  it('reports whether a term exists without returning it', () => {
    expect(hasTerm('Beta')).toBe(true);
    expect(hasTerm('Not A Real Term')).toBe(false);
  });
});

describe('search', () => {
  it('matches on the definition as well as the term', () => {
    const hits = searchGlossary('forearm');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((e) => !e.term.toLowerCase().includes('forearm'))).toBe(true);
  });

  it('narrows to a category', () => {
    const hits = searchGlossary('', 'Grade');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((e) => e.category === 'Grade')).toBe(true);
  });

  it('returns everything for an empty query', () => {
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
    expect(searchGlossary('   ')).toHaveLength(GLOSSARY.length);
  });

  it('finds nothing rather than everything for nonsense', () => {
    expect(searchGlossary('qwertyuiop')).toEqual([]);
  });
});

describe('grouping', () => {
  it('follows the display order and drops empty groups', () => {
    const groups = groupByCategory(searchGlossary('', 'Grade'));
    expect(groups).toHaveLength(1);
    expect(groups[0]?.category).toBe('Grade');
  });

  it('loses nothing', () => {
    const total = groupByCategory(GLOSSARY).reduce((n, g) => n + g.entries.length, 0);
    expect(total).toBe(GLOSSARY.length);
  });
});

/**
 * The inline matcher's real job: resolving names the programs and drills
 * actually use. A rename that quietly breaks the lookup shows up here
 * rather than as a definition silently vanishing from the logger.
 */
describe('coverage of authored content names', () => {
  const exerciseNames = (program: Program): string[] =>
    program.sessionTypes.flatMap((type) =>
      (type.blocks ?? []).flatMap((block) =>
        Object.values(block.perPhase).flatMap((phase) => phase.exercises.map((e) => e.name)),
      ),
    );

  const allNames = [...new Set(PROGRAMS.flatMap(exerciseNames))];

  it('defines a meaningful share of the exercise names the programs prescribe', () => {
    const covered = allNames.filter((name) => hasTerm(name));
    // 60 is a floor, not a target: it is well under today's coverage, so a
    // handful of renames is fine and a wholesale break is not.
    expect(covered.length).toBeGreaterThanOrEqual(60);
  });

  it('defines every protocol the logger can open a timer for', () => {
    // Not a floor but a contract: a climber shown a protocol by name, with
    // cues and a countdown, must be able to find out what it actually is.
    const missing = Object.values(PROTOCOLS)
      .map((protocol) => protocol.name)
      .filter((name) => !hasTerm(name));
    expect(missing).toEqual([]);
  });
});
