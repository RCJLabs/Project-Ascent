import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { offerIsLive, useUndo, UNDO_WINDOW_MS } from '@/store/undo';
import { announce } from './Announce';
import { Button } from './Button';

/**
 * "Deleted. Undo?" (PLAN.md M20).
 *
 * Rendered by the shell, in the same slot as the update prompt, so it never
 * covers what the climber is reading and never moves the page under a thumb.
 *
 * It expires rather than sitting there: an offer that never goes away stops
 * reading as an offer. The tick is one second and only runs while something
 * is pending, so an idle app is not waking up to check a clock.
 */
export function UndoBar() {
  const offer = useUndo((s) => s.offer);
  const clear = useUndo((s) => s.clear);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!offer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [offer]);

  // Announced rather than only drawn: a climber using a screen reader has no
  // other way to know an offer appeared, and it is gone in fifteen seconds.
  useEffect(() => {
    if (offer) announce(`${offer.label} deleted. Undo is available.`);
  }, [offer]);

  if (!offer || !offerIsLive(offer, now)) return null;

  const left = Math.max(0, Math.ceil((offer.at + UNDO_WINDOW_MS - now) / 1000));

  return (
    <div
      className="bg-surface border border-line rounded-2xl px-3.5 py-2.5 flex items-center gap-3"
      role="status"
    >
      <span className="text-sm flex-1 min-w-0 truncate">
        <span className="font-semibold">{offer.label}</span> deleted
      </span>
      <span className="text-xs text-ink-soft tabular-nums" aria-hidden>
        {left}s
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void offer
            .run()
            .then(() => announce(`${offer.label} restored.`))
            .catch(() => announce('That could not be undone.', 'assertive'))
            .finally(() => {
              setBusy(false);
              clear();
            });
        }}
      >
        <Undo2 size={14} /> Undo
      </Button>
    </div>
  );
}
