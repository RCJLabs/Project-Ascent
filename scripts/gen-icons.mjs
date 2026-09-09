// Generates the PWA icons (mountain glyph on glacier ground) as PNGs with
// zero image dependencies: pixels are drawn into an RGBA buffer and encoded
// with node's zlib. Run via `npm run icons`; outputs are committed.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x17, 0x3a, 0x55]; // deep glacier navy
const PEAK = [0xe8, 0xee, 0xf3]; // snow/ice
const PEAK_FAR = [0x5a, 0xa3, 0xd4]; // accent blue

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let c = -1;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inTriangle = (px, py, [ax, ay], [bx, by], [cx, cy]) => {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
};

/** Draw the glyph in unit space (0..1), then scale. `pad` insets the art
 *  for maskable safe zones. */
function drawIcon(size, pad) {
  const px = Buffer.alloc(size * size * 4);
  const s = (v) => pad * size + v * size * (1 - 2 * pad);
  // far peak (accent), main peak (snow)
  const far = [[s(0.18), s(0.78)], [s(0.52), s(0.30)], [s(0.86), s(0.78)]];
  const main = [[s(0.02), s(0.78)], [s(0.40), s(0.18)], [s(0.78), s(0.78)]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let c = BG;
      if (inTriangle(x, y, ...far)) c = PEAK_FAR;
      if (inTriangle(x, y, ...main)) c = PEAK;
      const i = (y * size + x) * 4;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
      px[i + 3] = 255;
    }
  }
  return encodePng(size, px);
}

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'icon-192.png'), drawIcon(192, 0.06));
writeFileSync(join(OUT_DIR, 'icon-512.png'), drawIcon(512, 0.06));
writeFileSync(join(OUT_DIR, 'maskable-512.png'), drawIcon(512, 0.18));
writeFileSync(join(OUT_DIR, 'apple-touch-icon.png'), drawIcon(180, 0.1));
console.log(`icons written to ${OUT_DIR}`);
