// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';

/**
 * Who you climbed with, in the logger (PLAN.md M237).
 *
 * The field is worth nothing if filling it is work, so the thing under test
 * is mostly the suggestions: after the first time, a partner is one tap.
 */

const DATE = today();
const ID = `${DATE}#0`;
const EARLIER = addDays(DATE, -3);

async function open(partners?: string[], view: 'quick' | 'full' = 'full'): Promise<void> {
  await reset();
  await putSession({
    ...newSession(EARLIER, 0, { completed: true }),
    partners: ['Sam', 'Alex'],
  } as never);
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    climbs: [{ id: 'a', grade: 'V4', scale: 'V', count: 2, result: 'send' }],
    ...(partners === undefined ? {} : { partners }),
  } as never);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  useSettings.setState({ logView: view });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText('Climbs');
}

const card = () => screen.getByText('Who you climbed with').closest('section')!;
const add = () => within(card()).getByRole('button', { name: /add/i }) as HTMLButtonElement;
const box = () => screen.getByLabelText('Who you climbed with');

describe('the partners card', () => {
  it('writes a typed name onto the session', async () => {
    await open();
    fireEvent.change(box(), { target: { value: '  Jo Ridley ' } });
    fireEvent.click(add());
    await waitFor(async () => {
      expect((await getSession(ID))?.partners).toEqual(['Jo Ridley']);
    });
  });

  it('takes Enter as well, because a name is a one-line answer', async () => {
    await open();
    fireEvent.change(box(), { target: { value: 'Jo' } });
    fireEvent.keyDown(box(), { key: 'Enter' });
    await waitFor(async () => {
      expect((await getSession(ID))?.partners).toEqual(['Jo']);
    });
  });

  it('refuses to add an empty box', async () => {
    await open();
    expect(add().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: '   ' } });
    expect(add().disabled).toBe(true);
  });

  /**
   * The point of the whole card. A name typed once in February should never
   * need typing again.
   */
  it('offers everyone the log already knows, and adds one on a tap', async () => {
    await open();
    expect(card().textContent).toContain('Sam');
    expect(card().textContent).toContain('Alex');
    fireEvent.click(within(card()).getByRole('button', { name: 'Sam' }));
    await waitFor(async () => {
      expect((await getSession(ID))?.partners).toEqual(['Sam']);
    });
  });

  /**
   * And never offers one that is already on: the chip above removes, the chip
   * below adds, and one name in both rows is two controls for one fact.
   */
  it('stops offering a name once it is on the session', async () => {
    await open(['Sam']);
    expect(within(card()).getAllByRole('button', { name: /^Sam/ })).toHaveLength(1);
    expect(card().textContent).toContain('Alex');
  });

  it('takes a name back off', async () => {
    await open(['Sam', 'Alex']);
    fireEvent.click(within(card()).getByRole('button', { name: /^Sam/ }));
    await waitFor(async () => {
      expect((await getSession(ID))?.partners).toEqual(['Alex']);
    });
  });

  /**
   * Behind the *More* fold with the notes and the photos. Nothing in the app
   * asks for a partner and nothing counts a session as unfinished without
   * one, so it does not belong on the screen a climber sees mid-session.
   */
  it('is not in the quick view', async () => {
    await open(undefined, 'quick');
    expect(screen.queryByText('Who you climbed with')).toBeNull();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  /** Said on the card itself, because that is where the decision is made. */
  it('says where the name goes and where it does not', async () => {
    await open();
    expect(card().textContent).toContain('never a share card');
  });
});
