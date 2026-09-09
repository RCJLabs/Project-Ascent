import { describe, expect, it } from 'vitest';
import { ACWR_BOUNDS } from '@/engine/derive';
import { PROGRAMS, getProgram } from '../programs';
import { GUIDES, getGuide, guideFor, guideLength } from './index';
import type { Guide, GuideBlock } from './types';

const blocks = (guide: Guide): GuideBlock[] => guide.sections.flatMap((s) => s.content);
const ALL_BLOCKS = GUIDES.flatMap(blocks);

/** Every authored string in a guide, wherever it lives on a block. */
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

const ALL_STRINGS = ALL_BLOCKS.flatMap(strings);

describe('guide structure', () => {
  it('gives every guide an id, a name and sections', () => {
    for (const guide of GUIDES) {
      expect(guide.id).toBeTruthy();
      expect(guide.name).toBeTruthy();
      expect(guide.sections.length).toBeGreaterThan(0);
    }
  });

  it('uses each id once', () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every section a title and something in it', () => {
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        expect(section.title, `${guide.id} has an untitled section`).toBeTruthy();
        expect(section.content.length, `${guide.id} / ${section.title} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it('writes no empty strings, bar the corner of a labelled grid', () => {
    // A weekly-template table has a blank top-left cell above its row
    // labels; that is correct markup, and the only blank allowed.
    const offences: string[] = [];
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        for (const block of section.content) {
          const cells =
            block.kind === 'table'
              ? [...block.head.slice(1), ...block.rows.flat()]
              : strings(block);
          for (const cell of cells) {
            if (cell.trim() === '') offences.push(`${guide.id} / ${section.title}`);
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('keeps every table rectangular', () => {
    for (const guide of GUIDES) {
      for (const section of guide.sections) {
        for (const block of section.content) {
          if (block.kind !== 'table') continue;
          const width = block.head.length;
          expect(width, `${guide.id} / ${section.title}: headerless table`).toBeGreaterThan(0);
          for (const row of block.rows) {
            expect(row.length, `${guide.id} / ${section.title}: ragged row`).toBe(width);
          }
        }
      }
    }
  });

  it('counts its own length', () => {
    const total = GUIDES.reduce((n, g) => n + guideLength(g).blocks, 0);
    expect(total).toBe(ALL_BLOCKS.length);
  });
});

/**
 * The port's real risk: prose that documents an app that no longer exists.
 * These are cheap and they will keep earning their keep as the app changes.
 */
describe('guides describe this app', () => {
  const BANNED = [
    'Headwall',
    'Expedition',
    'Season Pass',
    'AI Coach',
    'AI Builder',
    'Coach Billy',
    'leaderboard',
    'Health tab',
    'Vehicle',
    'Guild',
    'Trail Encounter',
  ];

  it('mentions no cut system', () => {
    const offences: string[] = [];
    for (const guide of GUIDES) {
      for (const text of blocks(guide).flatMap(strings)) {
        for (const banned of BANNED) {
          if (text.toLowerCase().includes(banned.toLowerCase())) {
            offences.push(`${guide.id}: "${banned}" in "${text.slice(0, 80)}"`);
          }
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('carries no HTML — content is data, and nothing renders it as markup', () => {
    const withTags = ALL_STRINGS.filter((s) => /<\/?[a-z][^>]*>/i.test(s));
    expect(withTags).toEqual([]);
  });

  it('balances its inline markers', () => {
    const unbalanced = ALL_STRINGS.filter((s) => (s.match(/\*\*/g) ?? []).length % 2 !== 0);
    expect(unbalanced).toEqual([]);
  });
});

describe('guides and programs', () => {
  it('links a guide to its program by shared id, without either storing the other', () => {
    expect(guideFor('iron_grip')?.id).toBe('iron_grip');
    expect(getProgram('iron_grip')).toBeDefined();
  });

  it('has a guide for every program but the ones we know about', () => {
    const without = PROGRAMS.filter((p) => guideFor(p.id) === undefined).map((p) => p.id);
    // general_training is the one program with no guide written: it is the
    // log-only mode rather than a twelve-week block, so there is no
    // progression to explain. If another id appears here, one is missing.
    expect(without).toEqual(['general_training']);
  });

  it('returns nothing for an unknown id rather than throwing', () => {
    expect(getGuide('not_a_guide')).toBeUndefined();
    expect(guideFor('not_a_program')).toBeUndefined();
  });

  it('keeps the standalone guides out of the program mapping', () => {
    expect(getGuide('injury_management')).toBeDefined();
    expect(getProgram('injury_management')).toBeUndefined();
  });
});

/**
 * The injury guide states the ACWR bands in prose. `deriveClimberState`
 * draws them in code. They have to be the same numbers, and a test is the
 * only thing that will keep them the same in a year.
 */
describe('the injury guide agrees with the load engine', () => {
  const guide = getGuide('injury_management');

  const acwrTable = guide?.sections
    .flatMap((s) => s.content)
    .find((b): b is Extract<GuideBlock, { kind: 'table' }> => b.kind === 'table');

  it('has an ACWR table to check', () => {
    expect(acwrTable).toBeDefined();
    expect(acwrTable?.head[0]).toBe('Ratio');
  });

  it('states the same boundaries the engine uses', () => {
    const ratios = (acwrTable?.rows ?? []).map((row) => row[0] ?? '');
    // Every number quoted in the Ratio column, in order.
    const quoted = ratios.flatMap((r) => [...r.matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
    const bounds = [
      ACWR_BOUNDS.optimalFrom,
      ACWR_BOUNDS.optimalFrom,
      ACWR_BOUNDS.optimalTo,
      ACWR_BOUNDS.optimalTo,
      ACWR_BOUNDS.cautionTo,
      ACWR_BOUNDS.cautionTo,
    ];
    expect(quoted).toEqual(bounds);
  });
});
