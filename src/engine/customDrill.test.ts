import { describe, expect, it } from 'vitest';
import type { Drill } from '@/content/types';
import {
  blankDrill,
  CUSTOM_DRILL_PREFIX,
  drillIssues,
  isCustomDrill,
  newDrillId,
  tidyDrill,
} from './customDrill';

/**
 * Writing your own drill (PLAN.md M286).
 *
 * The library ships 156 and not one can be the climber's own. Programs are
 * authorable and session types with them; drills were content only — which
 * for a coach is backwards, since the drill is where their own coaching lives.
 */

describe('a drill the climber wrote', () => {
  it('is told apart by its id, and nothing else', () => {
    expect(isCustomDrill(newDrillId())).toBe(true);
    expect(isCustomDrill('sticky_feet')).toBe(false);
    expect(newDrillId().startsWith(CUSTOM_DRILL_PREFIX)).toBe(true);
  });

  it('gets a distinct id across a tight loop', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newDrillId()));
    expect(ids.size).toBe(200);
  });

  /**
   * Coherent from the first render, which is `customProgram.ts`'s rule for
   * its own skeleton: the record exists before it is finished.
   */
  it('starts as a real drill with nothing said yet', () => {
    const drill = blankDrill();
    expect(drill.name).toBe('');
    expect(drill.text).toBe('');
    // The fields an engine reads are never absent, only empty.
    expect(Array.isArray(drill.equipment)).toBe(true);
    expect(Array.isArray(drill.loads)).toBe(true);
    expect(Array.isArray(drill.sources)).toBe(true);
    expect(drill.category).toBeTruthy();
    expect(drill.discipline).toBeTruthy();
  });
});

describe('what is still missing', () => {
  const filled = (over: Partial<Drill> = {}): Drill => ({
    ...blankDrill(),
    name: 'Three-point rule',
    focus: 'Foot precision under fatigue',
    text: 'Climb eight boulders keeping three points on at all times.',
    ...over,
  });

  it('says nothing about a drill that is finished', () => {
    expect(drillIssues(filled())).toEqual([]);
  });

  /**
   * Three fields, and only three. A drill is read by people rather than
   * walked by an engine, so the bar is whether a climber opening it in six
   * months knows what to do.
   */
  it('asks for a name, what it trains, and the drill itself', () => {
    expect(drillIssues(blankDrill()).map((i) => i.field).sort()).toEqual(['focus', 'name', 'text']);
  });

  it('is not satisfied by whitespace', () => {
    const blank = drillIssues(filled({ name: '   ', focus: ' ', text: '\n ' }));
    expect(blank.map((i) => i.field).sort()).toEqual(['focus', 'name', 'text']);
  });

  /** Everything else has a working default, so nothing else blocks. */
  it('asks for nothing else, however empty', () => {
    expect(drillIssues(filled({ duration: '', level: '', equipment: [], loads: [] }))).toEqual([]);
  });
});

describe('tidying it', () => {
  it('collapses the whitespace a name picked up', () => {
    const tidy = tidyDrill({ ...blankDrill(), name: '  Three   point  rule ', focus: ' Feet ' });
    expect(tidy.name).toBe('Three point rule');
    expect(tidy.focus).toBe('Feet');
  });

  /**
   * The text keeps its shape. It is a paragraph a coach wrote, and the page
   * renders it `whitespace-pre-line` — collapsing runs inside it would throw
   * away the line breaks they typed on purpose.
   */
  it('trims the text without reflowing it', () => {
    const tidy = tidyDrill({ ...blankDrill(), text: '  One.\n\nTwo.  ' });
    expect(tidy.text).toBe('One.\n\nTwo.');
  });

  it('leaves the lists alone', () => {
    const drill = { ...blankDrill(), equipment: ['wall', 'hangboard'] as never };
    expect(tidyDrill(drill).equipment).toEqual(['wall', 'hangboard']);
  });
});
