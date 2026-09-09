import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/**
 * Saying out loud what the screen just changed (PLAN.md M14).
 *
 * Before this there was no `aria-live` region anywhere in the app, which
 * meant every state change that did *not* navigate was silent to a screen
 * reader: a session logged, XP awarded, a timer moving from work to rest, a
 * challenge claimed, an import finishing or failing. The screen said so and
 * nothing else did.
 *
 * ## Why a store and not a prop
 *
 * The things worth announcing happen in stores and engines, several layers
 * below whatever is on screen — the reward pipeline does not know which
 * page is mounted, and should not. One module they can all call, one region
 * mounted once in the shell.
 *
 * ## polite vs assertive
 *
 * `polite` waits for a gap in whatever the reader is saying. `assertive`
 * interrupts, and interrupting someone mid-sentence is rude enough that it
 * has to be earned: it is for errors and for a timer segment ending, where
 * late is the same as useless. Everything else is polite.
 */

export type Urgency = 'polite' | 'assertive';

interface AnnouncerState {
  /** A counter, so announcing the same words twice still fires. */
  id: number;
  message: string;
  urgency: Urgency;
  announce: (message: string, urgency?: Urgency) => void;
  clear: () => void;
}

const useAnnouncer = create<AnnouncerState>((set, get) => ({
  id: 0,
  message: '',
  urgency: 'polite',
  announce: (message, urgency = 'polite') => {
    const trimmed = message.trim();
    if (trimmed === '') return;
    set({ id: get().id + 1, message: trimmed, urgency });
  },
  clear: () => set({ message: '' }),
}));

/**
 * Announce something to anyone using a screen reader.
 *
 * Callable from anywhere, including outside React — engines and stores use
 * the static form rather than a hook.
 */
export function announce(message: string, urgency: Urgency = 'polite'): void {
  useAnnouncer.getState().announce(message, urgency);
}

/**
 * The live regions themselves, mounted once in the shell.
 *
 * Two of them, always present and always empty until something arrives:
 * a region added to the DOM at the same moment as its text is unreliable
 * across readers, which is the single most common way live regions are got
 * wrong. Text goes into a region that was already there.
 */
export function Announcer() {
  const id = useAnnouncer((s) => s.id);
  const message = useAnnouncer((s) => s.message);
  const urgency = useAnnouncer((s) => s.urgency);
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (message === '') return;
    if (urgency === 'assertive') setAssertive(message);
    else setPolite(message);

    // Emptied afterwards so the same words can be announced again later,
    // and so a reader moving through the page later does not read a stale
    // sentence as if it were current.
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setPolite('');
      setAssertive('');
    }, 4000);
    return () => window.clearTimeout(timer.current);
  }, [id, message, urgency]);

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {polite}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only">
        {assertive}
      </div>
    </>
  );
}
