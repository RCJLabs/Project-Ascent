import { beforeAll, describe, expect, it } from 'vitest';
import { PROGRAMS, loadPrograms } from '@/content/programs';
import { SKILL_TREES } from '@/content/skills';
import { HEIGHT, MILESTONES } from '@/engine/altimeter';
import { STAT_LABELS } from '@/engine/stats';
import { readFileSync } from 'node:fs';
import { APP } from './app';
import type { GuideBlock } from './types';

/**
 * The app's description of itself, held to the app (PLAN.md M242).
 *
 * `accuracy.test.ts` has checked the **program** guides against the
 * catalogue since M33 — every dose, every week count, every deload. The app
 * guide never got one, and it is the document a climber reads to find out
 * what the app *is*: how many programs, how many tabs, what the coach can
 * say, how far a send is worth.
 *
 * It had drifted in two places when this was written, and both were the
 * kind a reader cannot catch:
 *
 * - **Five verdicts, and there are six.** `plateau.ts` returns
 *   `training ? 'Building' : 'Ticking over'` from its last branch, and the
 *   guide named only *Building* — so the one verdict a climber who has
 *   stopped training sees was the one the guide did not mention.
 * - **"Three or four phases", and no program has four.** Eleven blocks with
 *   three, Trip Prep with two.
 *
 * ## Both ends, or it is a test of the code with extra steps
 *
 * Each claim is checked twice: the guide still **makes** it, and the code
 * still **agrees**. Without the first half a reworded guide passes silently
 * — the sentence goes, the assertion about `PROGRAMS.length` keeps passing,
 * and nothing has been checked at all. That is M195's rule, applied to
 * prose: a probe that cannot find the claim is not a probe.
 */

beforeAll(async () => {
  await loadPrograms();
});

/** Every word the guide renders, as one string. */
function prose(): string {
  const parts: string[] = [];
  const take = (block: GuideBlock) => {
    if ('text' in block) parts.push(block.text);
    if ('items' in block) parts.push(...block.items);
    if ('title' in block) parts.push(block.title);
    if (block.kind === 'table') parts.push(...block.head, ...block.rows.flat());
  };
  for (const section of APP.sections) {
    parts.push(section.title);
    for (const block of section.content) take(block);
  }
  return parts.join('\n');
}

const TEXT = prose();

/**
 * Says the guide still makes the claim, then what the code says about it.
 *
 * The message names the phrase, because the failure a year from now is
 * somebody rewording a sentence and needing to know which number moved.
 */
function claims(phrase: string): void {
  expect(TEXT, `the guide no longer says "${phrase}" — check the number and move this`).toContain(
    phrase,
  );
}

describe('what the guide says there is', () => {
  it('finds the guide at all, or nothing below means anything', () => {
    expect(APP.sections.length).toBeGreaterThan(8);
    expect(TEXT.length).toBeGreaterThan(8_000);
  });

  /**
   * And `claims` can actually fail, which a battery had to point out.
   *
   * Every check below asserts twice: the guide makes the claim, and the code
   * agrees. Gutting the first half left all the second halves passing — so
   * the guide could be reworded to say anything and this file would stay
   * green, which is the failure mode it exists to prevent. Same shape as
   * `a11y.test.ts`'s *"would still catch a page that simply forgot its
   * heading"*: the probe is asked to catch something it should.
   */
  it('notices when a claim has left the guide', () => {
    expect(() => claims('the app is written entirely in Fortran')).toThrow();
    expect(() => claims('thirteen programs')).not.toThrow();
  });

  it('counts the programs', () => {
    claims('thirteen programs');
    claims('Thirteen of them: eleven structured blocks');
    expect(PROGRAMS).toHaveLength(13);
    // A block runs phases; a mode is one long open-ended stretch.
    const blocks = PROGRAMS.filter((p) => p.phases.length > 1);
    const modes = PROGRAMS.filter((p) => p.phases.length === 1);
    expect(blocks).toHaveLength(11);
    expect(modes).toHaveLength(2);
    claims('two log-only modes');
  });

  /** *"most twelve weeks across two or three phases"* — measured, both halves. */
  it('counts the weeks and the phases a block runs', () => {
    claims('most twelve weeks across two or three phases');
    const blocks = PROGRAMS.filter((p) => p.phases.length > 1);
    expect(blocks.filter((p) => p.weeks === 12).length).toBeGreaterThan(blocks.length / 2);
    const phases = [...new Set(blocks.map((p) => p.phases.length))].sort();
    expect(phases, 'a block grew a phase the guide does not mention').toEqual([2, 3]);
  });

  it('counts the tabs', () => {
    claims('Five things live in the bar at the bottom');
    const shell = readFileSync('src/ui/AppShell.tsx', 'utf8');
    expect([...shell.matchAll(/href: '[^']+', label: '[^']+'/g)]).toHaveLength(5);
  });

  it('counts the stats and names the trees', () => {
    claims('The five stats');
    expect(Object.keys(STAT_LABELS)).toHaveLength(5);
    claims('Five trees — Dynamic Power, Static Tension, Endurance, Technique and Mental Grit');
    expect(SKILL_TREES.map((t) => t.name)).toEqual([
      'Dynamic Power',
      'Static Tension',
      'Endurance',
      'Technique',
      'Mental Grit',
    ]);
  });

  /**
   * The find this file was written for. Six branches, and the guide named
   * five — leaving out the one a climber who has stopped training is shown.
   */
  it('names every verdict the coach can reach', () => {
    const source = readFileSync('src/engine/plateau.ts', 'utf8');
    const verdicts = [...source.matchAll(/headline: (?:training \? )?'([^']+)'(?: : '([^']+)')?/g)]
      .flatMap((m) => [m[1], m[2]])
      .filter((v): v is string => v !== undefined);
    expect(verdicts, 'the verdicts moved out of plateau.ts').toHaveLength(6);
    claims('One of six verdicts');
    for (const verdict of verdicts) claims(verdict);
  });

  it('says what a send is worth, and where the ladder ends', () => {
    claims('15 feet for a boulder, 50 for a route, a quarter more outdoors');
    expect(HEIGHT).toMatchObject({ boulder: 15, route: 50, outdoor: 1.25 });
    claims('the other thirteen eight-thousanders');
    const everest = MILESTONES.findIndex((m) => m.name === 'Everest');
    expect(everest, 'Everest is not on the ladder').toBeGreaterThan(-1);
    expect(MILESTONES.slice(everest + 1)).toHaveLength(13);
  });
});
