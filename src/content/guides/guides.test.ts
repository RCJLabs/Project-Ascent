import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HEIGHT } from '@/engine/altimeter';
import { CHALLENGE_REWARD } from '@/engine/challenges';
import { ACWR_BOUNDS } from '@/engine/derive';
import { AWARDS, GAME_ACTION_CAP, MULTIPLIERS } from '@/engine/economy';
import { MAX_ACTIVE } from '@/engine/objectives';
import { STAT_LABELS } from '@/engine/stats';
import { SKILL_TREES } from '../skills';
import { PROGRAMS, getProgram } from '../programs';
import { GUIDES, getGuide, guideFor, guideLength } from './index';
import { GUIDE_SUMMARIES, guideSummaryFor } from './summary';
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

/**
 * Section titles count too.
 *
 * These scans used to read `section.content` and nothing else, so a section
 * *titled* "The Armory" would have sailed past the check that exists to stop
 * exactly that — and a guide heading is the most-read prose in the file.
 */
const ALL_STRINGS = [
  ...GUIDES.flatMap((g) => g.sections.map((s) => s.title)),
  ...ALL_BLOCKS.flatMap(strings),
];

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
  /**
   * The app guide's own preamble lists what the prototype had and this app
   * does not. This is that list, minus the two words the guides use
   * legitimately: a guide is allowed — encouraged — to say "there are no
   * skill points" and "the tree is a map of your training, not a shop",
   * and banning the noun would ban the denial along with the claim.
   */
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
    'Armory',
    'gear set',
    'garage',
    'card battler',
    'sponsor',
    'tycoon',
    'pro team',
    'routesetting',
    'companion',
    'exploration map',
  ];

  it('mentions no cut system', () => {
    // Reads ALL_STRINGS, which carries the section titles. Walking only
    // `section.content` — which this did — let a section *titled* "The
    // Armory" through the one check written to stop it.
    const offences: string[] = [];
    for (const text of ALL_STRINGS) {
      for (const banned of BANNED) {
        if (text.toLowerCase().includes(banned.toLowerCase())) {
          offences.push(`"${banned}" in "${text.slice(0, 80)}"`);
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

/**
 * Every number the app guide quotes, checked against the code it describes.
 *
 * The prototype's app guide rotted because nothing connected its prose to
 * the app. These are the connection: retune the economy and the guide fails
 * until someone rewrites it.
 */
describe('the app guide quotes real numbers', () => {
  const guide = getGuide('app_guide');

  const tableAfter = (head: string): Extract<GuideBlock, { kind: 'table' }> | undefined =>
    guide?.sections
      .flatMap((s) => s.content)
      .find(
        (b): b is Extract<GuideBlock, { kind: 'table' }> =>
          b.kind === 'table' && b.head[0] === head,
      );

  /** The percentages in a cell, as fractions of a level. */
  const percents = (cell: string): number[] =>
    [...cell.matchAll(/(\d+(?:\.\d+)?)%/g)].map((m) => Number(m[1]) / 100);

  const allText = (guide?.sections.flatMap((s) => s.content) ?? []).flatMap(strings).join(' ');

  it('exists and is not a stub', () => {
    expect(guide).toBeDefined();
    expect(guide?.sections.length).toBeGreaterThanOrEqual(10);
  });

  it('prices every award as the economy does', () => {
    const table = tableAfter('Action');
    expect(table).toBeDefined();
    const byLabel = new Map((table?.rows ?? []).map((r) => [r[0] ?? '', r[1] ?? '']));
    expect(percents(byLabel.get('Logging a session') ?? '')[0]).toBe(AWARDS.session);
    expect(percents(byLabel.get('Warming up') ?? '')[0]).toBe(AWARDS.warmup);
    expect(percents(byLabel.get("Finishing the session's drill") ?? '')[0]).toBe(AWARDS.drillDone);
    expect(percents(byLabel.get('A logged rest day') ?? '')[0]).toBe(AWARDS.restDay);
    expect(percents(byLabel.get('A send') ?? '')).toEqual([AWARDS.sendBase, AWARDS.sendPerGrade]);
    expect(percents(byLabel.get('A new personal record') ?? '')[0]).toBe(AWARDS.personalRecord);
    expect(percents(byLabel.get('Sending a project') ?? '')[0]).toBe(AWARDS.projectSend);
  });

  it('prices the board as the board does', () => {
    const table = tableAfter('Shape');
    expect(table).toBeDefined();
    const byLabel = new Map((table?.rows ?? []).map((r) => [r[0] ?? '', r[1] ?? '']));
    expect(percents(byLabel.get('Daily') ?? '')[0]).toBe(CHALLENGE_REWARD.daily);
    expect(percents(byLabel.get('Weekly') ?? '')[0]).toBe(CHALLENGE_REWARD.weekly);
    expect(percents(byLabel.get('Bounty') ?? '')[0]).toBe(CHALLENGE_REWARD.bounty);
  });

  it('states the game cap the code enforces', () => {
    expect(allText).toContain(`${GAME_ACTION_CAP * 100}%`);
    // And states it as half of a session, which is what makes it the rule.
    expect(GAME_ACTION_CAP).toBe(AWARDS.session / 2);
  });

  it('states the altimeter’s real height per send', () => {
    expect(allText).toContain(`${HEIGHT.boulder} feet for a boulder`);
    expect(allText).toContain(`${HEIGHT.route} for a route`);
    expect(HEIGHT.outdoor).toBe(1.25); // 'a quarter more outdoors'
  });

  it('states the style multipliers as the economy has them', () => {
    expect(MULTIPLIERS.flash).toBe(1.5); // 'half again'
    expect(MULTIPLIERS.onsight).toBe(2); // 'double'
  });

  it('states the objective cap', () => {
    expect(MAX_ACTIVE).toBe(3);
    expect(allText).toContain('Three active at a time');
  });

  it('describes the stats in the app’s own words', () => {
    const table = tableAfter('Stat');
    expect(table).toBeDefined();
    const byName = new Map((table?.rows ?? []).map((r) => [r[0] ?? '', r[1] ?? '']));
    for (const label of Object.values(STAT_LABELS)) {
      expect(byName.get(label.name), `stat row missing: ${label.name}`).toBe(label.blurb);
    }
  });

  it('names only tabs that exist', () => {
    const table = tableAfter('Tab');
    expect(table?.rows.map((r) => r[0])).toEqual([
      'Home',
      'Train',
      'Calendar',
      'Projects',
      'Progress',
    ]);
  });
});

describe('the app guide counts what the app has', () => {
  const guide = getGuide('app_guide');
  const allText = (guide?.sections.flatMap((s) => s.content) ?? []).flatMap(strings).join(' ');

  it('counts the programs correctly, blocks and modes apart', () => {
    const modes = PROGRAMS.filter((p) => p.kind === 'mode');
    expect(PROGRAMS).toHaveLength(13);
    expect(modes).toHaveLength(2);
    expect(allText).toContain('Thirteen of them: eleven structured blocks');
    expect(allText).toContain('two log-only modes');
  });

  it('counts the finder’s questions', () => {
    // discipline, experience, grade, goal, days, equipment, injuries.
    expect(allText).toContain('seven questions');
    expect(allText.match(/seven questions — ([^—]+)—/)?.[1]?.split(',').length).toBe(7);
  });
});

describe('the app guide names the systems that exist', () => {
  const guide = getGuide('app_guide');
  const allText = (guide?.sections.flatMap((s) => s.content) ?? []).flatMap(strings).join(' ');

  it('names every skill tree, and no others', () => {
    expect(SKILL_TREES).toHaveLength(5);
    expect(allText).toContain('Five trees');
    for (const tree of SKILL_TREES) {
      expect(allText, `tree not named in the guide: ${tree.name}`).toContain(tree.name);
    }
  });

  it('names every stat the climber page shows', () => {
    for (const label of Object.values(STAT_LABELS)) {
      expect(allText).toContain(label.name);
    }
  });
});

describe('the app guide names the training-state verdicts', () => {
  const guide = getGuide('app_guide');
  const allText = (guide?.sections.flatMap((s) => s.content) ?? []).flatMap(strings).join(' ');

  it('quotes the headlines the diagnosis actually produces', () => {
    // Read out of the engine's source so a renamed verdict fails here.
    const source = readFileSync(new URL('../../engine/plateau.ts', import.meta.url), 'utf8');
    const headlines = [...source.matchAll(/headline: '([^']+)'/g)].map((m) => m[1]!);
    expect(headlines.length).toBeGreaterThanOrEqual(4);
    for (const headline of headlines) {
      expect(allText, `verdict not named in the guide: ${headline}`).toContain(headline);
    }
  });
});

describe('the summary index matches the guides', () => {
  it('lists every guide, with its real name and section count', () => {
    expect(GUIDE_SUMMARIES.map((s) => ({ id: s.id, name: s.name, sections: s.sections }))).toEqual(
      GUIDES.map((g) => ({ id: g.id, name: g.name, sections: g.sections.length })),
    );
  });

  it('resolves a program to its guide without loading one', () => {
    expect(guideSummaryFor('iron_grip')?.name).toBe('IRON GRIP');
    expect(guideSummaryFor('general_training')).toBeUndefined();
  });
});
