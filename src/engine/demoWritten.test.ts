import { beforeAll, describe, expect, it } from 'vitest';
import { demoClimber } from './demoClimber';
import { buildJournal } from './journal';
import { loadPrograms } from '@/content/programs';

/**
 * The sample climber writes things down (PLAN.md M207).
 *
 * Settings offers the button as filling the app *"so every screen has
 * something to show — for a look around, a screenshot or a video"*, and two
 * screens were bare. **The journal stores nothing**: it reads notes back off
 * sessions, projects and benchmarks, so it was empty because the climber
 * wrote none, not because a table was missing. Objectives are a table — of
 * a sort — and had none either.
 */

const TODAY = '2026-09-15';

beforeAll(async () => {
  await loadPrograms();
});

describe('the journal has something in it', () => {
  const made = demoClimber(TODAY);
  const journal = buildJournal({
    sessions: made.sessions,
    projects: made.projects,
    metrics: made.metrics,
  });

  it('is not empty', () => {
    expect(journal.length).toBeGreaterThan(10);
  });

  it('draws from more than one kind of note', () => {
    // A journal of nothing but project burns is the one it had: every
    // source it reads has to be represented or the screen is a list of one
    // thing wearing a timeline.
    const kinds = new Set(journal.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['assessment', 'attempt', 'beta', 'session']);
  });

  it('writes on some sessions rather than all of them', () => {
    const written = made.sessions.filter((s) => s.notes !== undefined);
    expect(written.length).toBeGreaterThan(5);
    expect(written.length).toBeLessThan(made.sessions.length / 2);
  });

  it('puts the beta on the project being worked', () => {
    // Beta accumulates where you keep going back. The one still open
    // should carry more of it than the one already sent, and the shelved
    // one none — which is also what stops a single note on any project
    // satisfying the kinds above.
    const worked = made.projects.find((p) => p.status === 'active')!;
    // The one sent most recently, not the first in the list: four are sent
    // now, and beta belongs to the one they were last on (PLAN.md M313).
    const sent = made.projects
      .filter((p) => p.status === 'sent')
      .sort((a, b) => (a.sentDate! < b.sentDate! ? 1 : -1))[0]!;
    const shelved = made.projects.find((p) => p.status === 'shelved')!;
    expect(worked.beta.length).toBeGreaterThan(sent.beta.length);
    expect(sent.beta.length).toBeGreaterThan(0);
    expect(shelved.beta).toEqual([]);
  });

  it('says different things', () => {
    // One note repeated forty times reads as a placeholder, which is what
    // it would be.
    const texts = new Set(journal.map((e) => e.text));
    expect(texts.size).toBeGreaterThan(8);
  });

  it('is the same journal every time', () => {
    // The sample climber is deterministic and the prose is part of it.
    const again = demoClimber(TODAY);
    expect(again.sessions.map((s) => s.notes)).toEqual(made.sessions.map((s) => s.notes));
  });

  it('leaves the climber underneath unchanged', () => {
    // The notes come off their own RNG stream, so adding them cannot
    // re-roll a single burn, benchmark or grade. This is the property that
    // makes that visible: the prose stream is independent of the seed's
    // main sequence, so two climbers differing only in seed still differ
    // everywhere, while the same seed reproduces both halves exactly.
    const other = demoClimber(TODAY, 12_345);
    expect(other.sessions.length).toBeGreaterThan(0);
    expect(other.sessions.map((s) => s.notes)).not.toEqual(made.sessions.map((s) => s.notes));
  });
});

/**
 * The sample climber ties in (PLAN.md M277).
 *
 * Measured before this was written: 174 sessions, 473 climbs, **every one
 * V-scale**. Not one YDS route, not one `ropeStyle`, not one partner — so
 * every roped reading in the app returned null for the climber whose whole
 * job is that *"every screen has something to show"*.
 */
describe('the sample climber climbs routes', () => {
  const made = demoClimber(TODAY);
  const climbs = made.sessions.flatMap((s) => s.climbs ?? []);

  it('logs routes as well as boulders', () => {
    // The trap M195 names: a probe that cannot find a known-present instance
    // is not a probe. Both halves have to be there for the rest to mean
    // anything.
    expect(climbs.filter((c) => c.scale === 'V').length).toBeGreaterThan(100);
    expect(climbs.filter((c) => c.scale === 'YDS').length).toBeGreaterThan(30);
  });

  it('says of every route whether it was led or top-roped', () => {
    const routes = climbs.filter((c) => c.scale === 'YDS');
    expect(routes.every((c) => c.ropeStyle !== undefined)).toBe(true);
    // Both, or the split card has nothing to split.
    expect(routes.some((c) => c.ropeStyle === 'lead')).toBe(true);
    expect(routes.some((c) => c.ropeStyle === 'toprope')).toBe(true);
  });

  it('never puts a rope style on a boulder, which would be a typo', () => {
    expect(climbs.filter((c) => c.scale === 'V').every((c) => c.ropeStyle === undefined)).toBe(true);
  });

  it('names who it climbed with, on some sessions and not all', () => {
    const named = made.sessions.filter((s) => (s.partners ?? []).length > 0);
    expect(named.length).toBeGreaterThan(5);
    // More than one person, or the year page's list is a single row.
    expect(new Set(named.flatMap((s) => s.partners ?? [])).size).toBeGreaterThan(1);
  });

  /**
   * And leaves the field empty sometimes, which is the harder half.
   *
   * `named.length < sessions.length` was the first draft and is trivially
   * true — no bouldering session names anybody. A mutant filling the field on
   * every roped session survived it. The property is about the **roped**
   * sessions: `partners.ts` holds that an empty field is a field nobody
   * filled, and a demo that fills it every time never shows that state.
   */
  it('leaves the partner field empty on some roped sessions', () => {
    const roped = made.sessions.filter((s) => (s.climbs ?? []).some((c) => c.scale === 'YDS'));
    const named = roped.filter((s) => (s.partners ?? []).length > 0);
    expect(named.length).toBeGreaterThan(0);
    expect(named.length).toBeLessThan(roped.length);
  });

  /**
   * The invariant that keeps the boulder half byte-identical.
   *
   * This file's header states the rule: every draw comes off one sequence, so
   * an inserted `chance()` re-rolls every record after it. The roped sessions
   * come off their own stream **and land on a day the bouldering loop never
   * uses** — it walks Monday, Wednesday and Friday and rests on Sunday. Both
   * halves are needed: a first draft drew the roped note off `prose` and moved
   * two notes between bouldering sessions.
   */
  it('keeps routes and boulders on separate days', () => {
    for (const session of made.sessions) {
      const scales = new Set((session.climbs ?? []).map((c) => c.scale));
      expect(scales.size, `${session.date} carries ${[...scales].join(' and ')}`).toBeLessThan(2);
    }

    /**
     * Per **date**, not just per session — and this is the half that bites.
     *
     * The first draft checked only the loop above, and a mutant moving the
     * roped session onto a Wednesday survived it: two sessions, one scale
     * each, both passing. But the bouldering loop already uses Wednesday, and
     * both call `newSession(date, 0)` — so they would collide on one id and
     * the second would overwrite the first in the store.
     */
    const byDate = new Map<string, Set<string>>();
    for (const session of made.sessions) {
      const scales = byDate.get(session.date) ?? new Set<string>();
      for (const climb of session.climbs ?? []) scales.add(climb.scale);
      byDate.set(session.date, scales);
    }
    for (const [date, scales] of byDate) {
      expect(scales.size, `${date} carries ${[...scales].join(' and ')}`).toBeLessThan(2);
    }
  });

  /** Which the id would say too, if two records ever landed on one day. */
  it('gives every session its own id', () => {
    const ids = made.sessions.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is still the same climber on a second build', () => {
    const again = demoClimber(TODAY);
    expect(JSON.stringify(again.sessions)).toBe(JSON.stringify(made.sessions));
  });
});
