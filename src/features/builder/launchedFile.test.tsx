// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/react';
import { getProgram, loadPrograms } from '@/content/programs';
import { buildProgramFile } from '@/engine/programFile';
import { forkProgram } from '@/engine/customProgram';
import { setLaunchFile, takeLaunchFile } from '@/lib/launchFile';
import { useCustomPrograms } from '@/store/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { BuilderList } from './BuilderList';
import { BuilderPage } from './BuilderPage';

/**
 * A shared program tapped in a file manager (PLAN.md M111).
 *
 * The manifest can register a file handler in three lines; what it cannot do
 * is put the file anywhere. The launch consumer fires in `App` before this
 * screen exists, so the proof that the feature works at all is that the
 * program is in the store after this page mounts — not that the manifest
 * mentions `.json`.
 */

const shared = async (name = 'Shared block') => {
  await loadPrograms();
  const file = buildProgramFile(forkProgram(getProgram('iron_grip')!, name));
  return new File([JSON.stringify(file)], 'shared.json', { type: 'application/json' });
};

/**
 * Waited for, not slept through (PLAN.md M303).
 *
 * Forty milliseconds to read a file, parse it, validate it and write a
 * program — a clock standing in for a condition, and the same bet the
 * settings copy of this test lost on a loaded CI runner. Each wait below
 * is on the thing it is about, and the ones asserting an absence wait for
 * the page instead, which is the latest moment an absence can be asked
 * about.
 */
const imported = (name: string) =>
  waitFor(() =>
    expect(useCustomPrograms.getState().custom.map((p) => p.name)).toContain(name),
  );
const shows = (view: { container: HTMLElement }, pattern: RegExp) =>
  waitFor(() => expect(view.container.textContent ?? '').toMatch(pattern));
const listed = (view: { container: HTMLElement }) => shows(view, /block|program/i);

describe('a program the app was opened with', () => {
  it('imports itself without the climber finding the picker', async () => {
    const file = await shared('Opened block');
    await reset();
    setLaunchFile(file);

    renderAt('/build', <BuilderList />);
    await imported('Opened block');
    expect(
      useCustomPrograms.getState().custom.map((p) => p.name),
      'the file was handed over and nothing read it',
    ).toContain('Opened block');
  });

  /**
   * By opening it (PLAN.md M333). An import that lands silently is one the
   * climber cannot tell from a file that failed to open.
   *
   * This asserted an *Imported "…"* line on the list, and passed only
   * because the list here is rendered without the router: in the app the
   * import navigates to the program and the list, notice and all, unmounts.
   * No climber ever saw that line. What they see is the program's own page,
   * named, with what the sender changed — so that is what is held.
   */
  it('says which program arrived, by opening it', async () => {
    const file = await shared('Named block');
    await reset();
    setLaunchFile(file);

    renderAt('/build', <BuilderList />);
    await imported('Named block');
    const arrived = useCustomPrograms.getState().custom.find((p) => p.name === 'Named block')!;
    await waitFor(() => expect(window.location.hash).toBe(`#/build/${arrived.id}`));

    const page = renderAt(window.location.hash, <BuilderPage params={{ id: arrived.id }} />);
    await shows(page, /Named block/);
    await shows(page, /Changed from Iron Grip/);
  });

  it('does not import it a second time on the next visit', async () => {
    const file = await shared('Once only');
    await reset();
    setLaunchFile(file);

    renderAt('/build', <BuilderList />);
    await imported('Once only');
    const second = renderAt('/build', <BuilderList />);
    await listed(second);
    expect(
      useCustomPrograms.getState().custom.filter((p) => p.name === 'Once only'),
      'every visit to the builder re-imported the launch file',
    ).toHaveLength(1);
  });

  it('leaves the store alone when nothing was opened', async () => {
    await reset();
    takeLaunchFile();
    await hydrate();

    const view = renderAt('/build', <BuilderList />);
    await listed(view);
    expect(useCustomPrograms.getState().custom).toEqual([]);
  });

  it('reports a file it cannot read instead of failing quietly', async () => {
    await reset();
    setLaunchFile(new File(['{"app":"project-ascent","kind":"program"}'], 'broken.json'));

    const view = renderAt('/build', <BuilderList />);
    // The parser's own words, not a generic shrug — and not silence, which
    // is what a launch that throws inside the consumer would look like.
    await shows(view, /That file has no program in it\./);
    expect(view.container.textContent ?? '').toContain('That file has no program in it.');
    expect(useCustomPrograms.getState().custom).toEqual([]);
  });
});
