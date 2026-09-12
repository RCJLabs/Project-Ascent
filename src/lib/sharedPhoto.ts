/**
 * A photo shared into the app from somewhere else (PLAN.md M111b).
 *
 * The service worker catches the `share_target` POST and leaves the file in
 * a cache — see `public/share-target.js` for why it is a cache and not the
 * database — then redirects to `/#/attach`. This is the page's side of that
 * handover: pick the file up, and take it rather than read it.
 *
 * **Taken, not read**, the same rule `lib/launchFile.ts` follows. The entry
 * is deleted by the first successful read, so refreshing the attach page
 * does not re-offer a photo that has already been filed, and React mounting
 * an effect twice in development does not produce two of them.
 *
 * **The two constants are duplicated from `public/share-target.js`**, which
 * is plain JavaScript outside the TypeScript build and cannot be imported
 * from. `sharedPhoto.test.ts` reads both files and fails if they drift —
 * the same shape as the glossary keys (M116), for the same reason: a
 * duplication a test holds is fine, a duplication nothing checks is a bug
 * waiting for a rename.
 */

/** The cache the worker puts a shared file in. */
export const SHARE_CACHE = 'ascent-share-inbox';

/** The single key inside it. One slot: a second share replaces the first. */
export const SHARE_KEY = '/__shared-photo';

/** Where the manifest points and the worker listens. */
export const SHARE_ACTION = '/share-target';

/**
 * The shared photo, once, or null.
 *
 * Every failure answers null rather than throwing. A browser with no Cache
 * API, a private window that refuses one, a cache that was cleared between
 * the redirect and the mount — none of those are errors the climber can do
 * anything about, and all of them mean the same thing on screen: no photo
 * waiting, pick one.
 */
export async function takeSharedPhoto(): Promise<File | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return null;
    // Deleted before the body is read, not after: a read that throws
    // half-way would otherwise leave the entry there to fail again on every
    // future visit to the page.
    await cache.delete(SHARE_KEY);
    const blob = await response.blob();
    if (blob.size === 0) return null;
    const type = response.headers.get('content-type') ?? blob.type;
    return new File([blob], sharedName(response), { type });
  } catch {
    return null;
  }
}

/**
 * The original filename, or a plausible one.
 *
 * The worker percent-encodes it, because a filename can contain anything
 * and a raw newline in a header value throws. A name that will not decode
 * is not worth failing the share over.
 */
function sharedName(response: Response): string {
  const raw = response.headers.get('x-shared-name');
  if (raw === null || raw === '') return 'shared-photo';
  try {
    const decoded = decodeURIComponent(raw).trim();
    return decoded === '' ? 'shared-photo' : decoded;
  } catch {
    return 'shared-photo';
  }
}
