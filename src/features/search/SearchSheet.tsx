import { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/ui/IconButton';
import { useDialog } from '@/ui/useDialog';
import { SearchBody } from './SearchBody';

/**
 * Search, over the page rather than instead of it (PLAN.md M117).
 *
 * A tab from M16 to M116, and the tab was the problem: six slots in a bar
 * that fits five, spent on a text field. The button in the shell's header
 * opens this on every page, so "one tap to search, one to the result" still
 * holds — from anywhere, over anything, without leaving where you were.
 *
 * **Anchored to the top, not the bottom.** A phone's keyboard covers the
 * lower half of the screen the moment the field is focused; a bottom sheet
 * would put the results under it.
 *
 * **Closes on the tap that picks a result**, by delegation rather than by
 * a prop on every link — one handler, and a link added later cannot forget
 * it. The shell also closes it when the location changes for any other
 * reason. Closing here first matters for focus: the dialog hands focus
 * back to the button that opened it as it unmounts, and the shell then
 * moves focus into the new page. In that order the page wins; in the other
 * order the header button would.
 */
export function SearchSheet({ onClose }: { onClose: () => void }) {
  const sheet = useDialog<HTMLDivElement>(onClose);

  // After `useDialog`, deliberately: effects run in declaration order, so
  // the dialog has recorded the button that opened it and focused the
  // container before this moves focus on to the field. A search that opens
  // with nothing to type into is a search that needs a second tap, and on
  // a phone that second tap is what brings the keyboard up. See
  // `SearchBody` for the bug the other order produced.
  useEffect(() => {
    sheet.current?.querySelector<HTMLInputElement>('input[type="text"], input:not([type])')?.focus();
  }, [sheet]);

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center p-3 sm:p-6 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl p-4 w-full max-w-lg max-h-full overflow-y-auto"
        onClick={(e) => {
          e.stopPropagation();
          if (e.target instanceof Element && e.target.closest('a[href]') !== null) onClose();
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Search</h2>
          <IconButton label="Close search" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <SearchBody />
      </div>
    </div>
  );
}
