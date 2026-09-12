import { describe, expect, it } from 'vitest';
import { OPENS_AT, kindOfFile, looksZipped, openedKind } from './openWith';

/**
 * M111. The manifest hands the app a file and says nothing useful about it:
 * `file_handlers` matches on extension, and **both of the app's own JSON
 * files are `.json`**. So the sniffer is the thing that decides which
 * screen a tapped file belongs to, and getting it wrong sends a shared
 * program into the restore-everything screen.
 */

const program = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'project-ascent',
    kind: 'program',
    schemaVersion: 2,
    appVersion: '1.0.0',
    exportedAt: '2026-03-01T00:00:00.000Z',
    program: { id: 'p1', name: 'Twelve weeks' },
    ...extra,
  });

const backup = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    app: 'project-ascent',
    schemaVersion: 2,
    appVersion: '1.0.0',
    exportedAt: '2026-03-01T00:00:00.000Z',
    data: { sessions: [] },
    ...extra,
  });

describe('telling the app’s two files apart', () => {
  it('reads a shared program as a program', () => {
    expect(openedKind(program())).toBe('program');
  });

  it('reads a backup as a backup', () => {
    expect(openedKind(backup())).toBe('backup');
  });

  it('does not read a program as a backup', () => {
    // Both carry `schemaVersion: number`, so the only thing separating them
    // is that `kind` is checked first. Swap the two branches and every
    // shared program opens in the screen that offers to replace everything
    // the climber has.
    expect(openedKind(program())).not.toBe('backup');
  });

  it('does not read a backup as a program', () => {
    // The other direction has the same shape of cost: the builder's parser
    // would reject it and report a broken file, when the file is fine and
    // the app simply took it to the wrong screen.
    expect(openedKind(backup())).not.toBe('program');
  });
});

describe('a file the app cannot place', () => {
  it('refuses one from another app', () => {
    expect(openedKind(JSON.stringify({ app: 'some-other-tracker', schemaVersion: 2 }))).toBe(null);
  });

  it('refuses one with the app’s name and nothing else', () => {
    // A half-written file, or a future format this build has never seen.
    // Neither importer knows how to read it, so neither gets it.
    expect(openedKind(JSON.stringify({ app: 'project-ascent' }))).toBe(null);
  });

  it('refuses one whose schema version is not a number', () => {
    expect(openedKind(backup({ schemaVersion: '2' }))).toBe(null);
  });

  it('refuses a kind it has never heard of', () => {
    // `kind` present but wrong, and no schema version to fall back on.
    expect(openedKind(JSON.stringify({ app: 'project-ascent', kind: 'workout' }))).toBe(null);
  });

  it('refuses text that is not JSON at all', () => {
    // A `.json` extension is a claim, not a fact — this is the file that
    // would otherwise throw inside the launch consumer and take the boot
    // with it.
    expect(openedKind('Date,Grade,Result\n2026-03-01,V4,send')).toBe(null);
  });

  it('refuses JSON that is not an object', () => {
    expect(openedKind('[{"app":"project-ascent","kind":"program"}]')).toBe(null);
    expect(openedKind('"project-ascent"')).toBe(null);
    expect(openedKind('7')).toBe(null);
  });

  it('refuses null, which is an object', () => {
    // `typeof null === 'object'`, so this is the one that gets through a
    // check written the obvious way and throws on the next line.
    expect(openedKind('null')).toBe(null);
  });

  it('refuses an empty file', () => {
    expect(openedKind('')).toBe(null);
  });
});

describe('an archive is not a question', () => {
  it('recognises the bytes a zip starts with', () => {
    expect(looksZipped(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  });

  it('does not call a JSON file an archive', () => {
    // `{` is 0x7b. A text backup and an archive backup both restore, but
    // they go through different readers.
    expect(looksZipped(new TextEncoder().encode('{"app":"project-ascent"'))).toBe(false);
  });

  it('wants both bytes, not just the first', () => {
    expect(looksZipped(new Uint8Array([0x50, 0x00]))).toBe(false);
    expect(looksZipped(new Uint8Array([0x00, 0x4b]))).toBe(false);
  });

  it('survives a file too short to have a header', () => {
    // A zero-byte file is something a file manager will hand over quite
    // happily. Reading past the end must answer no, not throw.
    expect(looksZipped(new Uint8Array([]))).toBe(false);
    expect(looksZipped(new Uint8Array([0x50]))).toBe(false);
  });
});

describe('the file itself, as the launch consumer hands it over', () => {
  const asFile = (body: BlobPart, name: string) => new File([body], name);

  it('places a shared program', async () => {
    expect(await kindOfFile(asFile(program(), 'block.json'))).toBe('program');
  });

  it('places a plain backup', async () => {
    expect(await kindOfFile(asFile(backup(), 'backup.json'))).toBe('backup');
  });

  it('places an archive backup without decoding it', async () => {
    // An archive is every photo the climber has attached. Decoding that as
    // UTF-8 to learn what the first two bytes already said is the cost this
    // ordering exists to avoid, so the file refuses to be read as text.
    const zip = asFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x00, 0x01]), 'backup.zip');
    Object.defineProperty(zip, 'text', {
      value: () => Promise.reject(new Error('decoded an archive as text')),
    });
    expect(await kindOfFile(zip)).toBe('backup');
  });

  it('places nothing when the file is neither', async () => {
    expect(await kindOfFile(asFile('Date,Grade\n2026-03-01,V4', 'log.csv'))).toBe(null);
  });

  it('ignores the extension entirely', async () => {
    // A shared program saved as `.txt`, and a CSV a file manager decided to
    // call `.json`. The name is what someone typed; the content is what it is.
    expect(await kindOfFile(asFile(program(), 'block.txt'))).toBe('program');
    expect(await kindOfFile(asFile('Date,Grade', 'log.json'))).toBe(null);
  });
});

describe('where an opened file goes', () => {
  it('sends a program to the builder and a backup to settings', () => {
    // Not interchangeable: the builder adds a program alongside what is
    // there, settings offers to replace the database.
    expect(OPENS_AT.program).toBe('/build');
    expect(OPENS_AT.backup).toBe('/settings');
  });
});
