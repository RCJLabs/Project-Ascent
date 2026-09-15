// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile, type Injury } from '@/store/profile';
import { BodyPage } from '@/features/body/BodyPage';
import { InjuryPage } from './InjuryPage';

/**
 * A healed injury is kept (PLAN.md M177).
 *
 * The page's own empty state used to say the opposite out loud — *"Recovered
 * injuries are cleared from the tracker"* — so the loss was documented rather
 * than accidental. What went with the record was the answer to the question a
 * physio asks second: has this happened before?
 */

const past = (part: Injury['part'], since: string, healedAt: string, id: string): Injury => ({
  id,
  part,
  since,
  healedAt,
  severity: 'managing',
  status: 'active',
});

async function fresh(state: Partial<Parameters<typeof useProfile.setState>[0]> = {}): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
  useProfile.setState({ injuries: [], healedInjuries: [], ...state });
}

const body = () => document.body.textContent ?? '';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('marking an injury healed', () => {
  it('takes it out of the live list and keeps the record', async () => {
    const live: Injury = { id: 'f1', part: 'fingers', since: '2026-01-05', severity: 'managing', status: 'active' };
    await fresh({ injuries: [live] });
    renderAt('/injury/f1', <InjuryPage params={{ id: 'f1' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mark healed' }));
    await waitFor(() => {
      expect(useProfile.getState().injuries).toEqual([]);
      expect(useProfile.getState().healedInjuries.map((i) => i.id)).toEqual(['f1']);
    });
    expect(useProfile.getState().healedInjuries[0]!.healedAt).toBe(today());
  });

  /** The undo has to undo the episode too, or the record comes back and
   *  leaves a scar the climber never had. */
  it('is undone whole, history and all', async () => {
    const live: Injury = { id: 'f1', part: 'fingers', since: '2026-01-05', severity: 'managing', status: 'active' };
    await fresh({ injuries: [live] });
    useProfile.getState().healInjury('f1');
    useProfile.getState().restoreInjury(live);
    expect(useProfile.getState().injuries.map((i) => i.id)).toEqual(['f1']);
    expect(useProfile.getState().healedInjuries).toEqual([]);
  });

  /**
   * And healing the same record twice is one episode, not two.
   *
   * The app cannot reach this state on its own — after a heal the record is
   * out of the live list, so a second `healInjury` finds nothing — but a
   * restored backup is a file, and a file can say anything. The battery found
   * the guard unreachable through the UI and this is what reaches it, because
   * a duplicate here inflates a count on somebody's injury history.
   */
  it('never records the same episode twice', async () => {
    const live: Injury = { id: 'f1', part: 'fingers', since: '2026-01-05', severity: 'managing', status: 'active' };
    await fresh({
      injuries: [live],
      healedInjuries: [{ ...live, healedAt: '2025-06-01' }],
    });
    useProfile.getState().healInjury('f1');
    expect(useProfile.getState().healedInjuries).toHaveLength(1);
    expect(useProfile.getState().healedInjuries[0]!.healedAt).toBe(today());
  });

  /**
   * And it survives the tab, which is the whole milestone: an episode the
   * database never sees is the deletion this replaced, one reload later.
   * The battery said so — writing `[]` into the snapshot passed everything
   * until this, because every other test here reads the store rather than
   * what was written.
   */
  it('is still there after a reload', async () => {
    const live: Injury = { id: 'f1', part: 'fingers', since: '2026-01-05', severity: 'managing', status: 'active' };
    await fresh({ injuries: [live] });
    useProfile.getState().healInjury('f1');
    await waitFor(async () => {
      await hydrate();
      expect(useProfile.getState().healedInjuries.map((i) => i.id)).toEqual(['f1']);
    });
    expect(useProfile.getState().injuries).toEqual([]);
  });

  /**
   * `removeInjury` stays a delete. Three of its call sites are a checkbox
   * being un-ticked — the finder's questions, onboarding, clearing the demo —
   * and recording those as episodes would invent an injury history out of
   * changing your mind.
   */
  it('is not what un-ticking a checkbox does', async () => {
    const live: Injury = { id: 'f1', part: 'fingers', since: '2026-01-05', severity: 'managing', status: 'active' };
    await fresh({ injuries: [live] });
    useProfile.getState().removeInjury('f1');
    expect(useProfile.getState().injuries).toEqual([]);
    expect(useProfile.getState().healedInjuries, 'a toggle wrote an injury history').toEqual([]);
  });
});

describe('the second time a part goes', () => {
  it('says which time it is, on the injury itself', async () => {
    await fresh({
      injuries: [{ id: 'f2', part: 'fingers', since: '2026-03-02', severity: 'managing', status: 'active' }],
      healedInjuries: [past('fingers', '2025-01-01', '2025-02-01', 'f1')],
    });
    renderAt('/injury/f2', <InjuryPage params={{ id: 'f2' }} />);
    expect(await screen.findByText('This is not the first')).toBeTruthy();
    expect(body()).toContain('The second time this fingers has gone');
  });

  it('says nothing at all on a first episode', async () => {
    await fresh({
      injuries: [{ id: 'f1', part: 'fingers', since: '2026-03-02', severity: 'managing', status: 'active' }],
    });
    renderAt('/injury/f1', <InjuryPage params={{ id: 'f1' }} />);
    await screen.findByText('How it is');
    expect(screen.queryByText('This is not the first')).toBeNull();
  });

  /** And it does not tell the climber what it means. */
  it('counts rather than interprets', async () => {
    await fresh({
      injuries: [{ id: 'f2', part: 'fingers', since: '2026-03-02', severity: 'managing', status: 'active' }],
      healedInjuries: [past('fingers', '2025-01-01', '2025-02-01', 'f1')],
    });
    renderAt('/injury/f2', <InjuryPage params={{ id: 'f2' }} />);
    await screen.findByText('This is not the first');
    expect(body()).toContain('Counted, not interpreted');
  });
});

describe('a part that has healed and is fine now', () => {
  /**
   * The half that keeps this from being another store nothing renders: the
   * injury page only exists while an injury is live, so a history read only
   * there would be invisible to exactly the climber who is currently fine.
   */
  it('still shows on the body page', async () => {
    await fresh({ healedInjuries: [past('elbow', '2025-01-01', '2025-03-02', 'e1')] });
    renderAt('/body', <BodyPage />);
    await screen.findByText('Injuries');
    expect(body()).toContain('Healed');
    expect(body()).toMatch(/elbow.*one episode, 60 days, healed 2025-03-02/i);
  });

  it('counts the episodes once there is more than one', async () => {
    await fresh({
      healedInjuries: [
        past('elbow', '2025-01-01', '2025-03-02', 'e1'),
        past('elbow', '2025-08-01', '2025-09-01', 'e2'),
      ],
    });
    renderAt('/body', <BodyPage />);
    await screen.findByText('Injuries');
    expect(body()).toMatch(/elbow.*2 episodes, last healed 2025-09-01/i);
  });

  /** A part that is hurting now belongs in the live list, not the history. */
  it('drops off the healed line while it is live again', async () => {
    await fresh({
      injuries: [{ id: 'e3', part: 'elbow', since: '2026-03-02', severity: 'managing', status: 'active' }],
      healedInjuries: [past('elbow', '2025-01-01', '2025-03-02', 'e1')],
    });
    renderAt('/body', <BodyPage />);
    await screen.findByText('Injuries');
    expect(body()).not.toMatch(/Healed/);
  });
});
