// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { hydrate, renderAt } from '@/test/render';
import { FinderPage } from '@/features/finder/FinderPage';
import { COOLDOWN_EXERCISES } from './cooldowns';
import { PART_STEPS, defaultSteps } from './returnToClimbing';
import { WARMUP_EXERCISES } from './warmups';
import { PART_WORDS, partsNamedIn } from '@/engine/bodyLoad';
import {
  BODY_PARTS,
  REGIONS,
  REGION_LABEL,
  bodyPart,
  hasSides,
  partLabel,
  partsIn,
  type BodyPart,
} from './bodyParts';

/**
 * A body part is a five-place commitment (PLAN.md M223).
 *
 * The union, a label, return-to-climbing prompts, something in the warmup
 * that loads it, and something in the cooldown that eases it. Before this
 * nothing checked any of that, and the result was two hand-kept pickers
 * that **disagreed** — seven parts in the finder against nine on the
 * injuries card — and a `pulley` with no cooldown at all.
 *
 * A part that is only in the union is a label a climber can pick and the
 * app will do nothing about, which is worse than not offering it.
 */

const IDS = BODY_PARTS.map((part) => part.id);

describe('the parts table', () => {
  it('is the only list, and both pickers read it', () => {
    // The drift this file exists to stop: a second list written by hand.
    for (const path of [
      'src/features/injury/InjuriesCard.tsx',
      'src/features/finder/FinderPage.tsx',
    ]) {
      const source = readFileSync(path, 'utf8');
      expect(source, path).toContain("from '@/content/bodyParts'");
      // No local array of parts beside the one that is imported. Matched on
      // the *type* rather than on a part's name: the finder has a training
      // goal called 'fingers' and a looser pattern caught it.
      expect(source, path).not.toMatch(/:\s*\{[^}]*value: BodyPart/);
      expect(source, path).not.toMatch(/BodyPart;\s*label: string \}\[\]/);
    }
  });

  it('gives every part a distinct id and a label that is not the id', () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    for (const part of BODY_PARTS) {
      expect(part.label.length, part.id).toBeGreaterThan(0);
      // Rendering the id with `capitalize` is what kept every part to one
      // lowercase word. A label is free to be two.
      expect(partLabel(part.id)).toBe(part.label);
    }
  });

  it('puts every part in a region, and every region has parts', () => {
    for (const part of BODY_PARTS) expect(REGIONS, part.id).toContain(part.region);
    for (const region of REGIONS) {
      expect(partsIn(region).length, region).toBeGreaterThan(0);
      expect(REGION_LABEL[region].length).toBeGreaterThan(0);
    }
    // Every part appears exactly once across the groups the pickers render.
    expect(REGIONS.flatMap(partsIn).map((p) => p.id).sort()).toEqual([...IDS].sort());
  });

  it('knows which parts have no sides, rather than naming one in a condition', () => {
    // `injury.part !== 'back'` was a list of one, kept in an if.
    const central = BODY_PARTS.filter((part) => !part.sides).map((part) => part.id);
    expect(central).toContain('back');
    expect(hasSides('elbow')).toBe(true);
    expect(hasSides('back')).toBe(false);
  });
});

describe('what a part is worth once it is offered', () => {
  it('has return-to-climbing prompts of its own', () => {
    for (const id of IDS) {
      expect(PART_STEPS[id], id).toBeDefined();
      // And they arrive after the general ones rather than instead of them.
      expect(defaultSteps(id).length, id).toBeGreaterThan(PART_STEPS[id]!.length);
    }
  });

  it('offers every part on the finder too, which is where the drift was', async () => {
    await hydrate();
    // M223's battery cut the finder's render to one region and every source
    // rule in this file still passed. The bug this milestone fixed was two
    // lists disagreeing, so a rule about *rendering* is the one that matters.
    // The finder is a wizard and the injury card is on its last step, so
    // the walk is: pick a goal, then read the card above "Find my program".
    const view = renderAt('/find', <FinderPage />);
    (await view.findByRole('button', { name: /^Stronger fingers/ })).click();
    const card = (await screen.findByText('Anything currently injured?')).closest('div')!
      .parentElement!;
    for (const part of BODY_PARTS) {
      expect(within(card).getByRole('button', { name: part.label }), part.id).toBeTruthy();
    }
  });

  it('has something in the warmup that loads it', () => {
    // Otherwise marking it healing excludes nothing, and the card's promise
    // that it is "kept out of your warmups" is not kept.
    for (const id of IDS) {
      const loaded = WARMUP_EXERCISES.filter((e) => e.loads.includes(id));
      expect(loaded.length, id).toBeGreaterThan(0);
    }
  });

  it('has something in the cooldown that reaches it', () => {
    // `pulley` had none of these before M223.
    for (const id of IDS) {
      const eased = COOLDOWN_EXERCISES.filter((e) => e.targets.includes(id));
      expect(eased.length, id).toBeGreaterThan(0);
    }
  });

  it('is recognised when a safety rule names it in prose', () => {
    for (const id of IDS) expect(PART_WORDS[id], id).toBeDefined();
    // And the words actually match: a table of regexes that never fire is
    // the same as no table.
    expect(partsNamedIn('Stop if you feel it in the hand or thumb')).toContain('hand');
    expect(partsNamedIn('Nothing through the achilles this week')).toContain('achilles');
    expect(partsNamedIn('Ease off if the ribs complain')).toContain('rib');
  });

  it('tells a hip from a groin, which one rule used to answer for both', () => {
    // The hip rule was /\bhips?\b|\bgroin\b/, so a sentence about adductors
    // reported a hip and a sentence about hips reported no groin.
    // No 'knee' in the sentence: the first version said "drop knees" and
    // the knee rule answered too, correctly.
    expect(partsNamedIn('Wide stemming loads the adductors')).toEqual(['groin']);
    expect(partsNamedIn('High steps load the hip')).toEqual(['hip']);
  });
});

describe('the nine M223 added', () => {
  it('includes the one this milestone started from', () => {
    expect(IDS).toContain('hand');
    expect(bodyPart('hand').region).toBe('hands');
    expect(bodyPart('hand').hint).toBeDefined();
  });

  it('covers what heel hooks, crimping and belaying actually hurt', () => {
    for (const id of ['hamstring', 'achilles', 'foot', 'rib', 'neck', 'forearm', 'lat', 'groin'] as BodyPart[]) {
      expect(IDS, id).toContain(id);
    }
  });
});
