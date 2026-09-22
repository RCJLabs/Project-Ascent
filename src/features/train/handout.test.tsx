// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { PROGRAMS } from '@/content/programs';
import { handoutName, programHandout } from '@/engine/programHandout';
import { today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';
import * as download from '@/lib/download';

/**
 * The handout, from the catalogue (PLAN.md M317).
 *
 * M298a's seventh entry: M288 built the handout and put it in the builder,
 * where it can only hand over a program the coach wrote themselves — and a
 * coach is at least as likely to put an athlete on Iron Grip. The generator
 * took any `Program` from the day it was written.
 */

async function open(id: string): Promise<void> {
  await reset();
  await hydrate();
  renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
  await screen.findByRole('heading', { level: 1 });
}

describe('writing a shipped program out', () => {
  it('is offered on the page, without opening the fold', async () => {
    await open('iron_grip');
    // The fold is shut: its button still offers to open it.
    expect(screen.getByText(/What's in it/)).toBeTruthy();
    expect(screen.getByText('Save as a handout')).toBeTruthy();
  });

  it('saves the same text the generator writes, under the same name', async () => {
    const saved = vi.spyOn(download, 'downloadText').mockImplementation(() => {});
    await open('iron_grip');
    fireEvent.click(screen.getByText('Save as a handout'));
    expect(saved).toHaveBeenCalledTimes(1);
    const [text, name, type] = saved.mock.calls[0]!;
    expect(name).toBe(handoutName(PROGRAMS.find((p) => p.id === 'iron_grip')!));
    expect(type).toBe('text/markdown');
    expect(text).toBe(programHandout(PROGRAMS.find((p) => p.id === 'iron_grip')!, today()));
    saved.mockRestore();
  });

  /**
   * And no file button beside it, which the builder does have.
   *
   * The file carries a program to another copy of the app, and every copy
   * of the app already has this one. Offering it here would be a download
   * that does nothing for anybody.
   */
  it('does not offer the file, which only a written program needs', async () => {
    await open('iron_grip');
    expect(screen.queryByText('Save as a file')).toBeNull();
  });

  it('is offered for a mode as well, which is a program a coach may put someone on', async () => {
    await open('outdoor_climbing');
    expect(screen.getByText('Save as a handout')).toBeTruthy();
  });
});
