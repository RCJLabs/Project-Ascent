import { useEffect, useRef } from 'react';

/**
 * Focus management for a modal (PLAN.md M14).
 *
 * The app had three dialogs — the protocol timer, the share sheet and the
 * photo viewer — and between them they had one Escape handler, one
 * `aria-modal` and no focus management at all. Measured: opening the timer
 * left focus on the button behind it, Tab walked straight out of the sheet
 * into the page underneath it, and closing left focus wherever it had
 * wandered to. A full-screen overlay you can Tab out of is not a dialog; it
 * is a picture of one.
 *
 * Four things, which is the whole contract:
 *
 * 1. **Focus moves in** on open, to the container. Not to the first control:
 *    that skips the dialog's own heading, and a screen reader lands
 *    mid-dialog with no idea what it opened.
 * 2. **Tab is trapped.** Wrapping at both ends, so Shift-Tab from the top
 *    goes to the bottom rather than into the page behind.
 * 3. **Escape closes**, doing exactly what the dialog's own close button
 *    does — including, for the timer, discarding a running protocol. That
 *    is the visible affordance's behaviour and a keyboard user should not
 *    get a different one.
 * 4. **Focus goes back** to whatever opened it, if that is still on the
 *    page. A dialog that returns focus to nowhere costs a keyboard user the
 *    whole tab order again.
 *
 * `onClose` is held in a ref rather than being an effect dependency. Every
 * caller passes an inline arrow, so depending on it would tear down and
 * rebuild the trap on every render — and run the focus restore each time.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialog<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  /**
   * Whether the dialog is on screen.
   *
   * Callers that mount only while open can leave this alone. A caller that
   * is always mounted and renders the dialog conditionally — the photo
   * viewer — must pass it, or the trap registers a document-level Escape
   * handler that swallows the key with no dialog to close.
   */
  open = true,
) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    node?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || node === null) return;

      const focusable = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      const active = document.activeElement;

      // Nothing to move to, or focus has escaped: put it back on the sheet.
      if (focusable.length === 0 || !(active instanceof Node) || !node.contains(active)) {
        event.preventDefault();
        (focusable[0] ?? node).focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && (active === first || active === node)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // Capture, so a dialog closes on Escape before anything underneath it
    // acts on the same key.
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (opener?.isConnected === true) opener.focus();
    };
  }, [open]);

  return ref;
}
