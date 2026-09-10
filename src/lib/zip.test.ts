import { describe, expect, it } from 'vitest';
import { crc32, looksLikeZip, unzip, zip, ZipError } from './zip';

/**
 * A backup container (PLAN.md M53).
 *
 * Hand-written rather than a dependency, so it is worth being unusually
 * careful: a backup that restores *wrongly* is worse than one that refuses.
 */

const bytes = (s: string) => new TextEncoder().encode(s);
const text = (b: Uint8Array) => new TextDecoder().decode(b);

describe('writing and reading an archive', () => {
  it('round-trips what was put in it', () => {
    const entries = [
      { name: 'backup.json', bytes: bytes('{"app":"project-ascent"}') },
      { name: 'media/m1.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]) },
    ];
    const out = unzip(zip(entries));
    expect(out.map((e) => e.name)).toEqual(['backup.json', 'media/m1.jpg']);
    expect(text(out[0]!.bytes)).toBe('{"app":"project-ascent"}');
    expect([...out[1]!.bytes]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);
  });

  it('keeps entries in the order they were written', () => {
    const names = ['backup.json', 'media/b.jpg', 'media/a.jpg', 'media/c.jpg'];
    const out = unzip(zip(names.map((name) => ({ name, bytes: bytes(name) }))));
    expect(out.map((e) => e.name)).toEqual(names);
  });

  it('carries an empty file without losing it', () => {
    const out = unzip(zip([{ name: 'empty', bytes: new Uint8Array(0) }]));
    expect(out).toHaveLength(1);
    expect(out[0]!.bytes).toHaveLength(0);
  });

  it('handles an archive with nothing in it', () => {
    expect(unzip(zip([]))).toEqual([]);
  });

  it('does not grow the bytes it stores', () => {
    // Store-only is the point: photos are already JPEG, and deflating them
    // spends CPU to make the file bigger.
    const photo = new Uint8Array(64 * 1024).map((_, i) => (i * 31) % 251);
    const archive = zip([{ name: 'media/m.jpg', bytes: photo }]);
    expect(archive.length).toBeLessThan(photo.length + 200);
  });

  it('survives a name that is not ASCII', () => {
    const out = unzip(zip([{ name: 'media/café–1.jpg', bytes: bytes('x') }]));
    expect(out[0]!.name).toBe('media/café–1.jpg');
  });

  // Round-tripping through this app's own reader proves nothing about the
  // file manager a climber actually opens the backup in: without bit 11 a
  // reader may decode names as CP437, and Python's zipfile does.
  it('declares its names as UTF-8, in both headers', () => {
    const out = zip([{ name: 'media/café–1.jpg', bytes: bytes('x') }]);
    const view = new DataView(out.buffer);
    expect(view.getUint16(6, true) & 0x800).toBe(0x800);
    const central = view.getUint32(out.length - 22 + 16, true);
    expect(view.getUint32(central, true)).toBe(0x02014b50);
    expect(view.getUint16(central + 8, true) & 0x800).toBe(0x800);
  });

  it('reads an archive whose entries are large', () => {
    // A real backup is tens of megabytes; the header arithmetic is where a
    // hand-written writer goes wrong.
    const big = new Uint8Array(600 * 1024).fill(7);
    const out = unzip(zip([{ name: 'a', bytes: big }, { name: 'b', bytes: big }]));
    expect(out.map((e) => e.bytes.length)).toEqual([big.length, big.length]);
  });
});

describe('refusing what it cannot read', () => {
  it('says so when the file is not an archive', () => {
    expect(() => unzip(bytes('{"app":"project-ascent"}'))).toThrow(ZipError);
  });

  it('notices a truncated file rather than returning half a photo', () => {
    const archive = zip([{ name: 'media/m.jpg', bytes: new Uint8Array(5000).fill(3) }]);
    expect(() => unzip(archive.subarray(0, archive.length - 40))).toThrow(ZipError);
  });

  it('notices a corrupted byte, which is the one a reader could miss', () => {
    // Length and offsets all still line up; only the content changed. This
    // is what the CRC is for, and why it is checked rather than trusted.
    //
    // The byte has to be inside the stored body: a local header is 30 bytes
    // plus the name, and the name there is never read — the central
    // directory is what a zip is defined by, and this reader says so.
    const name = 'media/m.jpg';
    const archive = zip([{ name, bytes: new Uint8Array(64).fill(9) }]);
    const bodyAt = 30 + name.length;
    const damaged = archive.slice();
    damaged[bodyAt + 10] = damaged[bodyAt + 10]! ^ 0xff;
    expect(() => unzip(damaged)).toThrow(/did not survive/);
  });

  it('refuses a compressed archive by name rather than mis-reading it', () => {
    const archive = zip([{ name: 'a', bytes: bytes('hello') }]);
    // Flip the central directory's method field to deflate.
    const view = new DataView(archive.buffer);
    let at = archive.length - 22;
    at = view.getUint32(at + 16, true);
    view.setUint16(at + 10, 8, true);
    expect(() => unzip(archive)).toThrow(/another program/);
  });
});

describe('the checksum itself', () => {
  it('matches the values every other zip tool computes', () => {
    // Fixed vectors, so a subtle table or shift error cannot pass by being
    // internally consistent.
    expect(crc32(bytes(''))).toBe(0);
    expect(crc32(bytes('a'))).toBe(0xe8b7be43);
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
    expect(crc32(bytes('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });
});

describe('telling an archive from a JSON backup', () => {
  it('recognises its own output', () => {
    expect(looksLikeZip(zip([{ name: 'a', bytes: bytes('x') }]))).toBe(true);
  });

  it('does not mistake a JSON backup for one', () => {
    expect(looksLikeZip(bytes('{\n  "app": "project-ascent"'))).toBe(false);
    expect(looksLikeZip(new Uint8Array(0))).toBe(false);
  });
});
