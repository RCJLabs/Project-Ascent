import { create } from 'zustand';

/**
 * What the climber just told the finder, carried to the screen that can act
 * on it (PLAN.md M59).
 *
 * They answer "six weeks" on the finder, it recommends a twelve-week block
 * with "you would run it over 6" written on it, they open the program — and
 * the start screen asks the same question again one card down. The answer
 * should arrive with them.
 *
 * **Not persisted, on purpose.** A trip is a fact about this month, not a
 * setting: it belongs in memory for as long as the climber is acting on it
 * and nowhere after that. A reload clears it, which is the right behaviour —
 * a deadline that outlived the session it was typed in would silently shorten
 * a program months later.
 */
interface IntentState {
  /** Weeks the climber said they had, or null if they left it open. */
  weeksAvailable: number | null;
  setWeeksAvailable: (weeks: number | null) => void;
}

export const useIntent = create<IntentState>((set) => ({
  weeksAvailable: null,
  setWeeksAvailable: (weeksAvailable) => set({ weeksAvailable }),
}));
