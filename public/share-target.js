/**
 * Receiving a shared photo (PLAN.md M111b).
 *
 * ## Why this file exists at all
 *
 * A `share_target` with `method: "POST"` is delivered to the *service
 * worker* as a POST navigation, not to the page. Nothing in the app can see
 * it. `generateSW` writes the whole worker and takes no custom handlers, so
 * the two ways to add one are to own the worker outright (`injectManifest`)
 * or to have workbox import a script into the one it generates.
 *
 * **This is the second, deliberately.** M19 spent a milestone on the offline
 * contract — precache the whole shell, `registerType: 'prompt'`, never hand
 * over mid-session — and all of that is workbox's generated code. Owning the
 * worker would mean owning that too, and re-deriving it by hand to add a
 * fetch listener is the shape of a bug that only appears on someone else's
 * deploy. `importScripts` puts this at the top of the generated file and
 * changes nothing below it.
 *
 * ## Why the photo goes in a cache rather than the database
 *
 * A worker can open IndexedDB, and writing the photo straight into `media`
 * would be fewer moving parts. It would also skip `prepareImage` — so a
 * 12-megapixel phone photo would land at full size in a store the app caps
 * at 8 per owner — and skip the question `/attach` exists to ask, which is
 * *whose* day or project this belongs to. The worker's job is to catch the
 * file and get out of the way.
 *
 * ## One shot
 *
 * The entry is deleted by the first read (`lib/sharedPhoto.ts`), the same
 * rule `lib/launchFile.ts` follows for an opened file: a refresh of the
 * attach page must not re-offer a photo that has already been filed.
 *
 * **Plain JavaScript, in `public/`, so it is copied verbatim.** The two
 * constants below are duplicated in `lib/sharedPhoto.ts` because nothing
 * can import across that boundary; `sharedPhoto.test.ts` reads both files
 * and fails if they drift.
 */

const SHARE_CACHE = 'ascent-share-inbox';
const SHARE_KEY = '/__shared-photo';
const SHARE_ACTION = '/share-target';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Cheapest checks first: almost every request the worker sees is a GET,
  // and this listener runs before workbox's on all of them.
  if (request.method !== 'POST') return;
  if (new URL(request.url).pathname !== SHARE_ACTION) return;

  event.respondWith(
    (async () => {
      try {
        const form = await request.formData();
        const file = form.get('photo');
        if (file && typeof file !== 'string' && file.size > 0) {
          const cache = await caches.open(SHARE_CACHE);
          await cache.put(
            SHARE_KEY,
            new Response(file, {
              headers: {
                'content-type': file.type || 'application/octet-stream',
                // Encoded: a filename can carry anything, and a raw newline
                // in a header value throws rather than being sanitised.
                'x-shared-name': encodeURIComponent(file.name || 'shared'),
              },
            }),
          );
        }
      } catch {
        // A share that cannot be read still has to go somewhere. The attach
        // page with no photo waiting is the app saying "pick one", which is
        // a better answer than a browser error page on a POST to a URL that
        // does not exist.
      }
      return Response.redirect(new URL('/#/attach', self.location.origin).href, 303);
    })(),
  );
});
