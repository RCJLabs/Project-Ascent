/**
 * Preparing a photo for an offline app.
 *
 * A phone camera produces 3–8MB per shot. Storing those untouched would eat
 * a browser's storage budget in a few dozen pictures, and this app has no
 * cloud to fall back on when the browser starts evicting — so every image is
 * re-encoded before it is kept.
 *
 * `createImageBitmap` applies EXIF orientation for us, so a photo taken in
 * portrait does not come back on its side.
 */

/** Longest edge, in pixels. Enough to read beta off a boulder on a phone. */
export const MAX_EDGE = 1600;
export const QUALITY = 0.82;

/**
 * A ceiling per photo, and a second pass when the first misses it.
 *
 * An ordinary photo lands well under this at 1600px. A noisy one — dense
 * texture, granite in flat light — can defeat the codec and come out several
 * times larger, and eight of those on each of a dozen projects is a storage
 * budget gone. So the encoder gets one more go, smaller and harder.
 */
export const MAX_BYTES = 600 * 1024;
const RETRY_EDGE = 1100;
const RETRY_QUALITY = 0.7;

/** Refuse anything that is not going to become a picture. */
export const ACCEPTED = 'image/*';

export interface PreparedImage {
  blob: Blob;
  type: string;
  width: number;
  height: number;
}

export class ImageError extends Error {}

export async function prepareImage(file: File, maxEdge = MAX_EDGE): Promise<PreparedImage> {
  const first = await encode(file, maxEdge, QUALITY);
  if (first.blob.size <= MAX_BYTES) return first;
  const second = await encode(file, Math.min(maxEdge, RETRY_EDGE), RETRY_QUALITY);
  // Keep whichever actually came out smaller; a retry that loses is no help.
  return second.blob.size < first.blob.size ? second : first;
}

async function encode(file: File, maxEdge: number, quality: number): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) {
    throw new ImageError('That is not an image. Photos only for now — video would fill the phone.');
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError('That image could not be read.');
  }

  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageError('This browser cannot process images.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // WebP where it exists, JPEG everywhere else. Both are a deliberate
  // re-encode: the point is the size, not fidelity to the original file.
  const type = supportsWebp(canvas) ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
  if (!blob) throw new ImageError('That image could not be processed.');
  return { blob, type, width, height };
}

function supportsWebp(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL('image/webp').startsWith('data:image/webp');
}

