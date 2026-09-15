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
    const sent = made.projects.find((p) => p.status === 'sent')!;
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
