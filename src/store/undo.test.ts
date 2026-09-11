import { beforeEach, describe, expect, it } from 'vitest';
import { UNDO_WINDOW_MS, offerIsLive, offerUndo, useUndo } from './undo';

beforeEach(() => useUndo.setState({ offer: null }));

describe('the undo offer', () => {
  it('stands for a while, then does not', () => {
    const offer = { label: 'x', verb: 'deleted', at: 1000, run: async () => {} };
    expect(offerIsLive(offer, 1000)).toBe(true);
    expect(offerIsLive(offer, 1000 + UNDO_WINDOW_MS - 1)).toBe(true);
    expect(offerIsLive(offer, 1000 + UNDO_WINDOW_MS)).toBe(false);
  });

  it('is nothing when there is nothing', () => {
    expect(offerIsLive(null, 0)).toBe(false);
  });

  it('keeps only the newest', () => {
    // A stack invites undoing past the point anyone remembers what each
    // step was, and holds a copy of every deleted record alive.
    offerUndo('first', async () => {});
    offerUndo('second', async () => {});
    expect(useUndo.getState().offer?.label).toBe('second');
  });

  it('runs what it was given', async () => {
    let restored = false;
    offerUndo('a session', async () => {
      restored = true;
    });
    await useUndo.getState().offer?.run();
    expect(restored).toBe(true);
  });

  it('can be cleared', () => {
    offerUndo('x', async () => {});
    useUndo.getState().clear();
    expect(useUndo.getState().offer).toBeNull();
  });
});

/**
 * What happened to it, in the past tense (PLAN.md M100).
 *
 * Every undoable action was a delete until marking days trained, so
 * `UndoBar` printed "deleted" itself — and the first create it was asked to
 * describe read "5 days marked deleted".
 */
describe('what the offer says happened', () => {
  it('is a delete unless the caller says otherwise', () => {
    offerUndo('Tuesday’s session', async () => {});
    expect(useUndo.getState().offer?.verb).toBe('deleted');
  });

  it('takes the caller’s word for an action that is not one', () => {
    offerUndo('3 days', async () => {}, 'marked');
    expect(useUndo.getState().offer).toMatchObject({ label: '3 days', verb: 'marked' });
  });
});
