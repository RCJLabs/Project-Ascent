/**
 * A backup that is a container rather than one enormous string (PLAN.md M53).
 *
 * `exportAll` used to base64 every photo into one object and `JSON.stringify`
 * the lot. Measured on 96 photos at the app's own 600KB ceiling — 56MB of
 * pictures — that produced a **75MB file** and a **225MB peak heap**, because
 * base64 costs a third and the file is assembled through several full copies
 * at once. On a phone that is the difference between a backup and a crash.
 *
 * Store-only, no deflate. Every byte in these archives is already-compressed
 * JPEG, so deflating would spend CPU to grow the file — and leaving it out
 * means no compression library, which for an offline app whose whole first
 * load is 225KB is the point.
 *
 * Deliberately not a zip library. It writes and reads exactly the shape this
 * app produces: no directories, no encryption, no Zip64, no data descriptors.
 * Anything else is refused by name rather than mis-parsed, because a backup
 * that restores *wrongly* is worse than one that refuses.
 */

export class ZipError extends Error {}

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_SIG = 0x04034b50;
const CENTRAL_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
const EOCD_SIZE = 22;
/** Store, i.e. no compression. */
const STORED = 0;
/**
 * General-purpose bit 11: the file names in this archive are UTF-8.
 *
 * Without it a reader is entitled to decode names as CP437, and Python's
 * `zipfile` does — `media/café.jpg` came back mojibake and could not be
 * looked up, even though `unzip` guessed right. A backup a climber cannot
 * open in the tools they have is not much of a backup.
 */
const UTF8_NAMES = 0x800;

/** CRC-32, which every zip entry carries and every reader checks. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * DOS date and time, which zip has carried since 1989.
 *
 * Two-second resolution and a 1980 epoch. Nothing reads these back — the
 * records carry their own timestamps — but a file with a zeroed date shows
 * as 1980 in a file manager, which looks broken.
 */
function dosDateTime(when: Date): { date: number; time: number } {
  const year = Math.max(1980, when.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1),
  };
}

/**
 * Write a store-only archive. Entry order is preserved.
 *
 * One allocation for the whole file rather than a per-entry buffer that is
 * then copied into a second one. With 56MB of photos going in, the copy was
 * a second 56MB alive at the same moment for no reason — on a phone that is
 * the whole difference this milestone is about.
 */
export function zip(entries: ZipEntry[], when: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { date, time } = dosDateTime(when);
  const names = entries.map((e) => encoder.encode(e.name));

  let localSize = 0;
  let centralSize = 0;
  for (let i = 0; i < entries.length; i += 1) {
    localSize += 30 + names[i]!.length + entries[i]!.bytes.length;
    centralSize += 46 + names[i]!.length;
  }

  const out = new Uint8Array(localSize + centralSize + EOCD_SIZE);
  const view = new DataView(out.buffer);
  const sums = new Uint32Array(entries.length);
  const offsets = new Uint32Array(entries.length);

  let at = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const name = names[i]!;
    const sum = crc32(entry.bytes);
    sums[i] = sum;
    offsets[i] = at;

    view.setUint32(at, LOCAL_SIG, true);
    view.setUint16(at + 4, 20, true); // version needed
    view.setUint16(at + 6, UTF8_NAMES, true);
    view.setUint16(at + 8, STORED, true);
    view.setUint16(at + 10, time, true);
    view.setUint16(at + 12, date, true);
    view.setUint32(at + 14, sum, true);
    view.setUint32(at + 18, entry.bytes.length, true);
    view.setUint32(at + 22, entry.bytes.length, true);
    view.setUint16(at + 26, name.length, true);
    view.setUint16(at + 28, 0, true); // extra field length
    out.set(name, at + 30);
    out.set(entry.bytes, at + 30 + name.length);
    at += 30 + name.length + entry.bytes.length;
  }

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]!;
    const name = names[i]!;
    view.setUint32(at, CENTRAL_SIG, true);
    view.setUint16(at + 4, 20, true); // version made by
    view.setUint16(at + 6, 20, true); // version needed
    view.setUint16(at + 8, UTF8_NAMES, true);
    view.setUint16(at + 10, STORED, true);
    view.setUint16(at + 12, time, true);
    view.setUint16(at + 14, date, true);
    view.setUint32(at + 16, sums[i]!, true);
    view.setUint32(at + 20, entry.bytes.length, true);
    view.setUint32(at + 24, entry.bytes.length, true);
    view.setUint16(at + 28, name.length, true);
    view.setUint32(at + 42, offsets[i]!, true);
    out.set(name, at + 46);
    at += 46 + name.length;
  }

  view.setUint32(at, EOCD_SIG, true);
  view.setUint16(at + 8, entries.length, true);
  view.setUint16(at + 10, entries.length, true);
  view.setUint32(at + 12, centralSize, true);
  view.setUint32(at + 16, localSize, true);
  return out;
}

/** Whether these bytes look like an archive at all. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true) === LOCAL_SIG;
}

/**
 * Read a store-only archive, by way of its central directory.
 *
 * The central directory rather than a scan of local headers, because that is
 * the record a zip is defined by — a scan cannot tell a real entry from the
 * same bytes appearing inside a stored file.
 */
export function unzip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view, bytes.length);
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL_SIG) {
      throw new ZipError('This backup file is damaged — its index does not match its contents.');
    }
    const method = view.getUint16(at + 10, true);
    if (method !== STORED) {
      throw new ZipError('This backup was made by another program and is compressed in a way this app cannot read.');
    }
    const sum = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (localAt + 30 > bytes.length || view.getUint32(localAt, true) !== LOCAL_SIG) {
      throw new ZipError(`This backup file is damaged — ${name} is not where its index says.`);
    }
    const localNameLength = view.getUint16(localAt + 26, true);
    const localExtraLength = view.getUint16(localAt + 28, true);
    const start = localAt + 30 + localNameLength + localExtraLength;
    const body = bytes.subarray(start, start + size);
    if (body.length !== size) {
      throw new ZipError(`This backup file is truncated — ${name} is incomplete.`);
    }
    if (crc32(body) !== sum) {
      throw new ZipError(`This backup file is damaged — ${name} did not survive the trip.`);
    }
    entries.push({ name, bytes: body });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/**
 * The End Of Central Directory record, which lives at the end and may be
 * followed by a comment of up to 64KB — so it is found by searching
 * backwards rather than assumed to be the last 22 bytes.
 */
function findEocd(view: DataView, length: number): number {
  const floor = Math.max(0, length - EOCD_SIZE - 0xffff);
  for (let at = length - EOCD_SIZE; at >= floor; at -= 1) {
    if (view.getUint32(at, true) === EOCD_SIG) return at;
  }
  throw new ZipError('This is not a Project Ascent backup file.');
}
