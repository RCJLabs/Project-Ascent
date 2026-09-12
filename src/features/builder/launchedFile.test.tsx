// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getProgram, loadPrograms } from '@/content/programs';
import { buildProgramFile } from '@/engine/programFile';
import { forkProgram } from '@/engine/customProgram';
import { setLaunchFile, takeLaunchFile } from '@/lib/launchFile';
import { useCustomPrograms } from '@/store/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { BuilderList } from './BuilderList';

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

const settle = () => new Promise((r) => setTimeout(r, 40));

describe('a program the app was opened with', () => {
  it('imports itself without the climber finding the picker', async () => {
    const file = await shared('Opened block');
    await reset();
    setLaunchFile(file);

    renderAt('/build', <BuilderList />);
    await settle();

    expect(
      useCustomPrograms.getState().custom.map((p) => p.name),
      'the file was handed over and nothing read it',
    ).toContain('Opened block');
  });

  it('says which program arrived', async () => {
    const file = await shared('Named block');
    await reset();
    setLaunchFile(file);

    const view = renderAt('/build', <BuilderList />);
    await settle();

    // The same notice the picker shows. An import that lands silently is one
    // the climber cannot tell from a file that failed to open.
    expect(view.container.textContent ?? '').toMatch(/Imported "Named block"/);
  });

  it('does not import it a second time on the next visit', async () => {
    const file = await shared('Once only');
    await reset();
    setLaunchFile(file);

    renderAt('/build', <BuilderList />);
    await settle();
    renderAt('/build', <BuilderList />);
    await settle();

    expect(
      useCustomPrograms.getState().custom.filter((p) => p.name === 'Once only'),
      'every visit to the builder re-imported the launch file',
    ).toHaveLength(1);
  });

  it('leaves the store alone when nothing was opened', async () => {
    await reset();
    takeLaunchFile();
    await hydrate();

    renderAt('/build', <BuilderList />);
    await settle();

    expect(useCustomPrograms.getState().custom).toEqual([]);
  });

  it('reports a file it cannot read instead of failing quietly', async () => {
    await reset();
    setLaunchFile(new File(['{"app":"project-ascent","kind":"program"}'], 'broken.json'));

    const view = renderAt('/build', <BuilderList />);
    await settle();

    // The parser's own words, not a generic shrug — and not silence, which
    // is what a launch that throws inside the consumer would look like.
    expect(view.container.textContent ?? '').toContain('That file has no program in it.');
    expect(useCustomPrograms.getState().custom).toEqual([]);
  });
});
