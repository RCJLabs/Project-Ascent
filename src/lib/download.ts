/**
 * Handing the browser a file.
 *
 * Six lines, written out in the settings page, and about to be written out a
 * second time for the calendar export (PLAN.md M75) — which is how the
 * ninety-five bare buttons happened. One of it instead.
 *
 * The anchor goes into the document before it is clicked and comes out
 * after: a detached anchor works in Chrome and has never been reliable in
 * Firefox. The object URL is revoked on the next tick rather than on the
 * line after the click, because revoking it synchronously races the
 * browser's own read of it — which shows up as a download that silently
 * produces an empty file, on some platforms, sometimes.
 */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
