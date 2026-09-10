import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * M21's "done when", so far as source can hold it.
 *
 * The measurement — 20 interactions before, 15 after, and every one now a
 * direct tap rather than a native picker to open, scroll and choose — was
 * taken in a real browser and is recorded in PLAN.md. These are the parts a
 * cleanup could quietly undo.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const LOG = read('src/features/log/LogPage.tsx');
const ENTRY = read('src/features/log/ClimbEntry.tsx');

describe('logging a climb is taps, not pickers', () => {
  it('uses no dropdown to enter a climb', () => {
    // A `<select>` is open, scroll, choose before it is a choice at all,
    // and on a phone that is about a second and a half each.
    expect(ENTRY).not.toContain('<Select');
    expect(ENTRY).not.toContain('<option');
  });

  it('keeps the grade row to one line', () => {
    // Seventeen grades wrapped is four lines tall on a phone and pushes the
    // Add button off the screen.
    expect(ENTRY).toContain('overflow-x-auto');
    expect(ENTRY).not.toMatch(/aria-label="Grade"[\s\S]{0,200}flex-wrap/);
  });

  it('scrolls the chosen grade into view', () => {
    // Otherwise a climber logging V8 starts every session looking at V0.
    expect(ENTRY).toContain('scrollTo');
  });

  it('says which grade is chosen without relying on colour', () => {
    expect(ENTRY).toContain('aria-pressed');
  });
});

describe('a repeated session is one tap', () => {
  it('offers the last session when nothing is logged', () => {
    expect(LOG).toContain('<RepeatLast');
  });

  it('does not claim you sent a named climb again', () => {
    // A named climb is a specific piece of rock. Copying the name forward
    // would have the app inventing an ascent.
    expect(ENTRY).toContain("Omit<Climb, 'name'>");
  });
});

describe('a number field offers a number keypad', () => {
  it('does so by default, so a call site cannot forget', () => {
    const field = read('src/ui/Field.tsx');
    expect(field).toContain("rest.type === 'number'");
    expect(field).toContain("inputMode: 'decimal'");
  });

  it('lets a field that needs something else say so', () => {
    expect(read('src/ui/Field.tsx')).toContain('rest.inputMode === undefined');
  });
});

describe('a running timer survives the page going away', () => {
  it('is written somewhere a reload cannot reach', () => {
    // The M19 finding: the protocol timer was component state and nothing
    // else, so a refresh mid-hangboard restarted it from set one.
    expect(LOG).toContain('saveTimerState(');
    expect(LOG).toContain('loadTimerState(');
  });

  it('is cleared when the timer is closed or finished', () => {
    // A stale timer reopening on the next visit is its own bug.
    expect(LOG.match(/clearTimerState\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('hands the sheet somewhere to resume from', () => {
    expect(LOG).toContain('resume={resume}');
    expect(read('src/ui/TimerSheet.tsx')).toContain('resume?.startedAt');
  });
});
