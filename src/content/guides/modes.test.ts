import { beforeAll, describe, expect, it } from 'vitest';
import { PROGRAMS, loadPrograms } from '@/content/programs';
import { CATALOGUE } from '@/content/programs/catalogue';
import { GUIDES, guideFor, guideLength } from '@/content/guides';
import { guideSummaryFor } from '@/content/guides/summary';
import { safetyIssues } from '@/engine/programSafety';

/**
 * The two modes were the emptiest entries in the catalogue (PLAN.md M166).
 */

beforeAll(async () => {
  await loadPrograms();
});

const mode = (id: string) => PROGRAMS.find((p) => p.id === id)!;

describe('the measurement the milestone was built on', () => {
  it('is two modes and eleven programs', () => {
    expect(PROGRAMS.filter((p) => p.kind === 'mode').map((p) => p.id)).toEqual([
      'general_training',
      'outdoor_climbing',
    ]);
    expect(PROGRAMS.filter((p) => p.kind === 'program')).toHaveLength(11);
  });

  /**
   * The proposal said the modes were *"the entries with the least of
   * everything"*. Measured, that is true of some things and false of others,
   * and the difference is what the milestone turned on.
   */
  it('shows the modes are not short of assessments, which the proposal implied', () => {
    const counts = PROGRAMS.map((p) => (p.assessments ?? []).length);
    const lowest = Math.min(...counts.filter((n) => n > 0));
    expect(mode('general_training').assessments).toHaveLength(7);
    expect(mode('outdoor_climbing').assessments).toHaveLength(5);
    // Both sit inside the catalogue's ordinary range rather than below it.
    expect(mode('outdoor_climbing').assessments!.length).toBeGreaterThanOrEqual(lowest);
  });

  /**
   * And nor are they alone in shipping no drills: four programs do the same.
   * A finding that reads as "the modes are the empty ones" has to survive
   * being checked against the rest, and this half of it does not.
   */
  it('shows four programs ship no drills either', () => {
    const drillless = PROGRAMS.filter((p) =>
      p.sessionTypes.every((t) => Object.keys(t.drillsByWeek ?? {}).length === 0),
    ).map((p) => p.id);
    expect(drillless).toContain('general_training');
    expect(drillless).toContain('outdoor_climbing');
    expect(drillless.filter((id) => id !== 'general_training' && id !== 'outdoor_climbing')).toEqual(
      ['ground_zero', 'two_day_week', 'trip_prep', 'the_cruiser'],
    );
  });
});

describe('what is correct about a mode rather than missing from it', () => {
  /**
   * One phase over fifty-two weeks, no deload weeks, no recommended week and
   * no adherence. The proposal counted these as emptiness; they are the
   * definition. `programSafety` already excludes modes from its deload rule
   * on exactly this reasoning — *"open-ended logging with no progression to
   * deload from"* — so a milestone that added deloads would have been adding
   * something another module is written to ignore.
   */
  it.each(['general_training', 'outdoor_climbing'])('leaves %s open-ended', (id) => {
    const m = mode(id);
    expect(m.weeks).toBe(52);
    expect(m.phases).toHaveLength(1);
    expect(m.deloadWeeks).toBeUndefined();
    expect(m.recommendedLayout).toBeUndefined();
    expect(m.constraints.some((c) => c.kind === 'sessions-per-week')).toBe(false);
  });
});

describe('the rule General Training stated and never declared', () => {
  it('is declared now, and matches its own prose', () => {
    const gt = mode('general_training');
    const gap = gt.constraints.find((c) => c.kind === 'min-gap-hours');
    expect(gap, 'the constraint is gone').toBeTruthy();
    if (gap?.kind !== 'min-gap-hours') throw new Error('unreachable: checked above');
    expect(gap.hours).toBe(48);
    expect(gap.between).toEqual(['hb']);

    const prose = gt.sessionTypes
      .flatMap((t) => t.blocks ?? [])
      .flatMap((b) => Object.values(b.perPhase))
      .map((p) => p?.rationale ?? '')
      .join(' ');
    expect(prose, 'the prose it was supposed to back').toContain('48 hours between hangboard sessions');
  });

  /**
   * And it is the whole of what was added. The builder's own safety check
   * flagged this program and no other on the day it shipped; with the gap
   * declared it flags none of the thirteen.
   */
  it('quiets the check that found it, across the whole catalogue', () => {
    expect(CATALOGUE.filter((p) => safetyIssues(p).length > 0).map((p) => p.id)).toEqual([]);
  });

  /**
   * Outdoor Climbing gets none, and the reason is the app's own: its rest
   * type notes skin takes about 48 hours, and a gap rule built on that would
   * fire on every trip — where consecutive days on rock are the point, which
   * is the thing M163 had to teach the coach about the load ratio.
   */
  it('leaves Outdoor Climbing without one, deliberately', () => {
    expect(mode('outdoor_climbing').constraints).toEqual([]);
    const rest = mode('outdoor_climbing').sessionTypes.find((t) => t.isRest === true)!;
    expect(rest.description, 'the prose this decision is about').toMatch(/48 hours/);
  });
});

describe('the guide the catalogue was missing', () => {
  it('exists, and is the last one the catalogue was short of', () => {
    expect(guideFor('general_training')).toBeDefined();
    expect(PROGRAMS.filter((p) => guideFor(p.id) === undefined)).toEqual([]);
  });

  it('is reachable from the program page, which reads the summary list', () => {
    const summary = guideSummaryFor('general_training');
    expect(summary, 'a guide missing from the summary list is a guide nobody reaches').toBeTruthy();
    expect(summary!.sections).toBe(guideFor('general_training')!.sections.length);
  });

  /**
   * Long enough to be a guide. The catalogue's shortest program guides run
   * six sections, and one written to close a hole ought not to be the new
   * shortest thing in the folder.
   */
  it('is not a stub', () => {
    const guide = guideFor('general_training')!;
    const shortest = Math.min(...GUIDES.map((g) => g.sections.length));
    expect(guide.sections.length).toBeGreaterThanOrEqual(6);
    expect(guide.sections.length).toBeGreaterThan(shortest);
    expect(guideLength(guide).blocks).toBeGreaterThan(20);
  });

  /**
   * And it says the things the mode's own blocks say, which is where they
   * were trapped: a `perPhase.rationale` is visible only once a climber has
   * picked that block on that session, which is after the decision the guide
   * exists to inform.
   */
  it.each([
    [/48 hours between hangboard sessions/, 'the gap, now a declared rule'],
    [/Half crimp or open hand only/, 'the grip rule'],
    [/pull-dominant/, 'why push work is not bodybuilding'],
    [/skip entirely on climbing-heavy days/, 'the mistake the menus invite'],
  ])('lifts %s out of the block rationales — %s', (pattern) => {
    const text = JSON.stringify(guideFor('general_training'));
    expect(text).toMatch(pattern);
  });

  /**
   * Safety set apart from advice. `warn` blocks render so they cannot be
   * skimmed past, which is the whole reason the kind exists — and the two
   * rules in this mode that are not menus are exactly the two that belong in
   * one. Read off the section titles, because a `toMatch` over the whole
   * guide finds a phrase wherever it appears, including in a cross-reference
   * to itself: the battery showed that by retitling a section and surviving.
   */
  it('sets the two non-optional rules apart as warnings', () => {
    const guide = guideFor('general_training')!;
    const warns = guide.sections
      .flatMap((s) => s.content)
      .flatMap((b) => (b.kind === 'warn' ? [b] : []));
    expect(warns.map((w) => w.title)).toEqual(['Fingers', 'Antagonists']);
    for (const warn of warns) {
      expect(warn.items.length, warn.title).toBeGreaterThanOrEqual(3);
      expect(warn.footer, warn.title).toBeTruthy();
    }
  });

  /**
   * And says what the mode is bad at, which is the half a guide written to
   * fill a hole would skip. Asserted against the section *titles* for the
   * same reason as above.
   */
  it('gives what open-ended training is worse at its own section', () => {
    const guide = guideFor('general_training')!;
    expect(guide.sections.map((s) => s.title)).toContain('What this is bad at');
    const section = guide.sections.find((s) => s.title === 'What this is bad at')!;
    const text = JSON.stringify(section);
    for (const claim of ['Peaking for a date', 'Progressive overload', 'Telling you when to back off']) {
      expect(text, claim).toContain(claim);
    }
  });

  /**
   * It points at real programs, and **only** ones that exist.
   *
   * A scan rather than a checklist: the checklist version passed while a
   * mention was changed to a program the catalogue does not ship, because
   * the same program was named twice and the other mention carried it. Every
   * shouted phrase in this guide is a program name, so every shouted phrase
   * has to resolve to one.
   */
  it('names no program the catalogue does not ship', () => {
    const text = JSON.stringify(guideFor('general_training'));
    const shouted = [...new Set(text.match(/\b[A-Z]{3,}(?: [A-Z]{3,})+\b/g) ?? [])];
    expect(shouted.length, 'nothing shouted, so this proves nothing').toBeGreaterThanOrEqual(5);
    const titles = new Set(PROGRAMS.map((p) => p.name.toUpperCase()));
    expect(shouted.filter((name) => !titles.has(name))).toEqual([]);
    // And the ones it should be sending people to are among them.
    for (const name of ['TRIP PREP', 'PEAK PERFORMANCE', 'IRON GRIP', 'THE LONG GAME']) {
      expect(shouted, name).toContain(name);
    }
  });
});
