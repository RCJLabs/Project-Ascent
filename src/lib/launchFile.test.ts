import { describe, expect, it } from 'vitest';
import { receiveLaunch, setLaunchFile, takeLaunchFile } from './launchFile';

/**
 * M111. The launch consumer fires in `App`, before the screen that handles
 * the file has mounted, so the file waits in a variable for one render.
 *
 * Once. A file left in the slot is a file that re-imports itself the next
 * time the climber happens to open the builder.
 */

const file = (name: string) => new File(['{}'], name, { type: 'application/json' });

const program = () =>
  new File(
    [JSON.stringify({ app: 'project-ascent', kind: 'program', schemaVersion: 2, program: {} })],
    'shared.json',
  );
const backup = () =>
  new File([JSON.stringify({ app: 'project-ascent', schemaVersion: 2, data: {} })], 'backup.json');

describe('a file handed over at launch', () => {
  it('is nothing until one arrives', () => {
    expect(takeLaunchFile()).toBe(null);
  });

  it('comes back once', () => {
    const opened = file('program.json');
    setLaunchFile(opened);
    expect(takeLaunchFile()).toBe(opened);
  });

  it('is gone on the second ask', () => {
    // Both screens that can receive a launch check on mount. Whichever one
    // was not the destination must find nothing, and the destination must
    // not find it again on its next visit.
    setLaunchFile(file('backup.json'));
    takeLaunchFile();
    expect(takeLaunchFile()).toBe(null);
  });

  it('keeps the newest when two arrive before either is taken', () => {
    const older = file('first.json');
    const newer = file('second.json');
    setLaunchFile(older);
    setLaunchFile(newer);
    expect(takeLaunchFile()).toBe(newer);
    expect(takeLaunchFile()).toBe(null);
  });
});

describe('taking delivery of one', () => {
  it('sends a program to the builder and keeps it', async () => {
    const opened = program();
    expect(await receiveLaunch(opened)).toBe('/build');
    expect(takeLaunchFile(), 'routed but never handed over').toBe(opened);
  });

  it('sends a backup to settings and keeps it', async () => {
    const opened = backup();
    expect(await receiveLaunch(opened)).toBe('/settings');
    expect(takeLaunchFile()).toBe(opened);
  });

  it('goes nowhere for a file it cannot place', async () => {
    expect(await receiveLaunch(new File(['Date,Grade'], 'log.csv'))).toBe(null);
  });

  it('stashes nothing it could not place', async () => {
    // Otherwise the file sits in the slot and lands on whichever of the two
    // importers the climber happens to open next, minutes later.
    takeLaunchFile();
    await receiveLaunch(new File(['Date,Grade'], 'log.csv'));
    expect(takeLaunchFile()).toBe(null);
  });
});
