// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getSession, newSession, putSession, type Climb } from '@/db/sessions';
import { today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';

/**
 * Correcting a climb that is already logged (PLAN.md M298).
 *
 * `TallyRow` bumped the count and nothing else, so a grade typo, a flash
 * logged as a send, or a name typed a beat too late cost the row: minus to
 * zero and re-enter through the grade picker. The name was the sharp one,
 * because the input's own placeholder promises that named climbs become
 * projects and there was no way to give one afterwards.
 */

const DATE = today();
const ID = `${DATE}#0`;

async function logged(climbs: Climb[]) {
  globalThis.indexedDB = new IDBFactory();
  await reset();
  await putSession({ ...newSession(DATE, 0), completed: true, climbs } as never);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  useSettings.setState({ logView: 'quick' });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText('Climbs');
}

const climb = (over: Partial<Climb> = {}): Climb =>
  ({ id: 'a', grade: 'V4', scale: 'V', count: 1, result: 'send', ...over }) as Climb;

const rows = async () => (await getSession(ID))!.climbs;

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('a logged climb', () => {
  it('opens for correction from the row itself', async () => {
    await logged([climb()]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    expect(screen.getByRole('button', { name: /^Save climb$/ })).toBeTruthy();
  });

  it('keeps its count when the grade was wrong', async () => {
    await logged([climb({ count: 4 })]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'V6' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save climb$/ }));
    await waitFor(async () => {
      const list = await rows();
      expect(list).toHaveLength(1);
      expect(list[0]!.grade).toBe('V6');
      expect(list[0]!.count, 'four climbs at the wrong grade are four at the right one').toBe(4);
    });
  });

  /** The case the placeholder promises and nothing delivered. */
  it('can be named after it was logged', async () => {
    await logged([climb()]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    fireEvent.change(screen.getByLabelText('Climb name'), { target: { value: 'Brad Pit' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save climb$/ }));
    await waitFor(async () => expect((await rows())[0]!.name).toBe('Brad Pit'));
  });

  it('can have how it went corrected', async () => {
    await logged([climb()]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Flash' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save climb$/ }));
    await waitFor(async () => expect((await rows())[0]!.style).toBe('flash'));
  });

  /**
   * Through the same merge an add goes through: a V4 corrected to a V5 the
   * session already holds joins that row rather than becoming a second V5.
   */
  it('joins a row it now matches', async () => {
    await logged([climb({ id: 'a', count: 2 }), climb({ id: 'b', grade: 'V5', count: 1 })]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'V5' }));
    fireEvent.click(screen.getByRole('button', { name: /^Save climb$/ }));
    await waitFor(async () => {
      const list = await rows();
      expect(list).toHaveLength(1);
      expect(list[0]!.count).toBe(3);
    });
  });

  it('is left alone by Cancel', async () => {
    await logged([climb()]);
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    fireEvent.click(screen.getByRole('button', { name: 'V6' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: /^Correct V4 sent$/ })).toBeTruthy();
    expect((await rows())[0]!.grade).toBe('V4');
  });

  /** The count is the row's own plus and minus, which have an undo. */
  it('does not take the count away from the row', async () => {
    await logged([climb({ count: 2 })]);
    expect(screen.getByRole('button', { name: /^One more V4 sent$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Correct V4 sent$/ }));
    expect(screen.queryByRole('button', { name: /^One more V4 sent$/ })).toBeNull();
  });
});
