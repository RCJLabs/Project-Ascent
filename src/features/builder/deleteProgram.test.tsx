// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blankProgram } from '@/engine/customProgram';
import { useCustomPrograms } from '@/store/programs';
import { useProfile } from '@/store/profile';
import { useUndo } from '@/store/undo';
import { hydrate, renderAt, reset } from '@/test/render';
import { BuilderPage } from './BuilderPage';

/**
 * A custom program should be hard to lose (PLAN.md M49).
 *
 * Deleting one was a single tap in a "Danger zone" card with no confirmation
 * and no undo, followed by a navigate away. Sessions, projects and
 * objectives all call `offerUndo`; the project goes further and asks first.
 * The custom program is the most expensive thing in the app to recreate — a
 * coach's twelve-week block for an athlete — and it was the only delete with
 * no net at all.
 */

async function withProgram(name = 'Athlete block'): Promise<string> {
  await reset();
  const program = { ...blankProgram(name), id: 'custom_test' };
  await useCustomPrograms.getState().save(program);
  await hydrate();
  useUndo.getState().clear();
  return program.id;
}

const deleteButton = (view: { container: HTMLElement }) =>
  [...view.container.querySelectorAll('button')].find((b) => /delete/i.test(b.textContent ?? ''));

describe('deleting a custom program', () => {
  it('asks before doing it', async () => {
    const id = await withProgram();
    const view = renderAt(`/build/${id}`, <BuilderPage params={{ id }} />);
    await view.findByRole('heading', { level: 1 });

    deleteButton(view)!.click();
    await new Promise((r) => setTimeout(r, 30));
    expect(
      useCustomPrograms.getState().custom.map((p) => p.id),
      'one tap deleted it outright',
    ).toContain(id);
    expect(view.container.textContent ?? '', 'nothing asked').toMatch(/keep it/i);
  });

  it('offers it back once it is gone', async () => {
    const id = await withProgram();
    const view = renderAt(`/build/${id}`, <BuilderPage params={{ id }} />);
    await view.findByRole('heading', { level: 1 });
    deleteButton(view)!.click();
    await new Promise((r) => setTimeout(r, 30));
    // Now the real one.
    [...view.container.querySelectorAll('button')]
      .find((b) => /delete for good/i.test(b.textContent ?? ''))!
      .click();
    await new Promise((r) => setTimeout(r, 60));

    expect(useCustomPrograms.getState().custom.map((p) => p.id)).not.toContain(id);
    const offer = useUndo.getState().offer;
    expect(offer, 'deleted with no way back').not.toBeNull();
    expect(offer!.label).toContain('Athlete block');

    await offer!.run();
    expect(useCustomPrograms.getState().custom.map((p) => p.id), 'undo did not restore it').toContain(id);
  });

  it('does not leave the app running a program that is gone', async () => {
    // Deleting the block you are mid-way through is the case where losing it
    // hurts most, and it would have left `activeProgramId` pointing at
    // nothing.
    const id = await withProgram();
    useProfile.getState().startProgram(id, { }, undefined);
    expect(useProfile.getState().activeProgramId).toBe(id);

    const view = renderAt(`/build/${id}`, <BuilderPage params={{ id }} />);
    await view.findByRole('heading', { level: 1 });
    deleteButton(view)!.click();
    await new Promise((r) => setTimeout(r, 30));
    [...view.container.querySelectorAll('button')]
      .find((b) => /delete for good/i.test(b.textContent ?? ''))!
      .click();
    await new Promise((r) => setTimeout(r, 60));

    expect(useProfile.getState().activeProgramId, 'still pointing at a deleted program').toBeNull();
  });
});
