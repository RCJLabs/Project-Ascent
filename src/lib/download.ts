/**
 * Handing the browser a file.
 *
 * Six lines, written out in the settings page, and about to be written out a
 * second time for the calendar export (PLAN.md M75) — which is how the
 * ninety-five bare buttons happened. One of it instead.
 *
 * **And it happened anyway.** M7 wrote a private `save()` in `BuilderPage`
 * for the shared-program file, M288's handout reused it, and it was a worse
 * copy of this on both counts below: a detached anchor and a synchronous
 * revoke. Found at M292, when a third caller wanted the same thing; the two
 * wrappers underneath exist so the next one reaches for a function rather
 * than for six lines.
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

/** Text as a file, which is what every caller in the app actually has. */
export function downloadText(text: string, filename: string, type: string): void {
  downloadFile(new Blob([text], { type }), filename);
}

/** A pretty-printed JSON file: both of the app's own documents are one. */
export function downloadJson(value: unknown, filename: string): void {
  downloadText(JSON.stringify(value, null, 2), filename, 'application/json');
}
