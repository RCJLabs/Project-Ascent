// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { hydrate, renderAt, reset } from '@/test/render';
import { AssessmentsPage } from './AssessmentsPage';

/**
 * The date and the note, side by side (PLAN.md M280).
 *
 * `Input` carries `w-full`, and in a flex row an item with the default
 * `flex: 0 1 auto` resolves its basis to that 100% and claims the whole row.
 * Measured at 1280px: the date field took **912 of 942px** and the note beside
 * it was **22px wide** — a text input narrower than one character.
 *
 * ## Why this is a class assertion and not a measurement
 *
 * jsdom has no layout engine, so both fields report zero here and the bug is
 * structurally invisible to the suite — which is why it survived from M99b
 * until `scripts/layout.mjs` could reach `/assessments/:id` at all. The real
 * check is that harness. This is the cheap guard that stops the fix being
 * tidied away by someone who cannot see what it does.
 *
 * Read off the rendered element rather than out of the source, for the reason
 * M270 and M271 found four times over: a scan of the file passes on prose in
 * the comment above.
 */

async function openForm(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/assessments', <AssessmentsPage />);
  fireEvent.click(await screen.findByText(/Add a benchmark/));
  fireEvent.click(await screen.findByText('Max Hang 20mm 7s'));
}

describe('the row holding the date and the note', () => {
  it('gives the date a basis of its own rather than the whole row', async () => {
    await openForm();
    const date = screen.getByLabelText('Date tested');
    expect(date.className).toContain('basis-');
    expect(date.className).toContain('shrink-0');
  });

  it('lets the note take what is left, below its content if it has to', async () => {
    await openForm();
    const note = screen.getByLabelText('Result note');
    expect(note.className).toContain('flex-1');
    // Without this a flex item's `min-width: auto` floors it at its content.
    expect(note.className).toContain('min-w-0');
  });

  /**
   * The pair is the point: a basis on one and a grow on the other. Either
   * alone leaves the row as it was.
   */
  it('keeps them in one row', async () => {
    await openForm();
    const date = screen.getByLabelText('Date tested');
    const note = screen.getByLabelText('Result note');
    expect(date.parentElement).toBe(note.parentElement);
    expect(date.parentElement?.className).toContain('flex');
  });
});
