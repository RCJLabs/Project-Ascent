import { create } from 'zustand';

/**
 * One step back from a destructive action (PLAN.md M20).
 *
 * Deleting a session used to be two taps and gone. A confirm dialog is not
 * the same thing as an undo: it asks before you know you were wrong, and the
 * moment you find out is a second later, when the thing is already gone.
 *
 * One pending offer, not a stack. A stack invites "undo, undo, undo" past the
 * point anyone remembers what each step was, and every entry holds a copy of
 * a record alive; one offer is the one a climber actually wants, which is the
 * thing they just did.
 */

/** How long an offer stands. Long enough to notice, short enough not to
 *  become furniture. */
export const UNDO_WINDOW_MS = 15_000;

export interface UndoOffer {
  /** Names what would come back, e.g. "Tuesday's session". */
  label: string;
  /** When it was offered, so it can expire. */
  at: number;
  run: () => Promise<void>;
}

interface UndoState {
  offer: UndoOffer | null;
  /** Replaces any standing offer: the newest mistake is the live one. */
  offerUndo: (label: string, run: () => Promise<void>) => void;
  clear: () => void;
}

export const useUndo = create<UndoState>((set) => ({
  offer: null,
  offerUndo: (label, run) => set({ offer: { label, at: Date.now(), run } }),
  clear: () => set({ offer: null }),
}));

/** Whether an offer is still live. Pure, so the window is testable. */
export function offerIsLive(offer: UndoOffer | null, now: number): boolean {
  if (offer === null) return false;
  return now - offer.at < UNDO_WINDOW_MS;
}

/** Callable from anywhere, including outside React. */
export function offerUndo(label: string, run: () => Promise<void>): void {
  useUndo.getState().offerUndo(label, run);
}
