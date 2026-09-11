// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getProgram } from '@/content/programs';
import type { BodyPart } from '@/content/warmups';
import { newSession, putSession } from '@/db/sessions';
import { dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { HomePage } from '@/features/home/HomePage';
import { ReviewPage } from '@/features/review/ReviewPage';

/**
 * Injury load, counted before you get to the gym (PLAN.md M89).
 *
 * `bodyLoad.sessionConflicts` was written, documented, unit-tested and
 * called by nothing. What shipped instead was `exerciseConflict`, one line
 * at a time, inside the logger — so a climber with a logged elbow found out
 * about a session's third clashing exercise mid-session, having already
 * travelled to the wall. The count belongs where the decision is: on the
 * front door, and on the week ahead.
 */

const DATE = today();

interface Setup {
  program: string;
  typeId: string;
  injured?: BodyPart;
  /** Today's session already recorded. */
  logged?: boolean;
}

async function open({ program, typeId, injured, logged = false }: Setup): Promise<void> {
  await reset();
  const found = getProgram(program)!;
  if (logged) await putSession({ ...newSession(DATE, 0, { completed: true }), programId: found.id, sessionTypeId: typeId } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: found.id,
    startDates: { [found.id]: DATE },
    plans: { [found.id]: { [dayOfWeek(DATE)]: typeId } },
    weekOverrides: {},
    adaptations: {},
    injuries: injured
      ? [{ id: 'i1', part: injured, since: DATE, severity: 'managing' as const, status: 'active' as const }]
      : [],
  });
}

describe('the front door, before you travel', () => {
  it('counts what today loads, rather than flagging it one line at a time', async () => {
    await open({ program: 'ground_zero', typeId: 'str', injured: 'elbow' });
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').toMatch(/3 exercises load your elbow/);
  });

  /**
   * The case a count built only from `sessionConflicts` gets wrong: this
   * day's exercises leave the pulley alone and its drill does not. Reported
   * as nothing, it would be a silence the climber could not check.
   */
  it('counts the drill, which lives outside the session type’s blocks', async () => {
    await open({ program: 'iron_grip', typeId: 'perf', injured: 'pulley' });
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').toMatch(/the drill loads your pulley/);
  });

  it('says nothing when the day leaves the hurt part alone', async () => {
    await open({ program: 'ground_zero', typeId: 'str', injured: 'ankle' });
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').not.toMatch(/load(s)? your|Each one is marked/);
  });

  it('says nothing when nothing is hurt', async () => {
    await open({ program: 'ground_zero', typeId: 'str' });
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    // The whole line has to be gone, not merely emptied of its words: an
    // empty warning is still a warning triangle on the front door.
    expect(view.container.textContent ?? '').not.toMatch(/load(s)? your|Each one is marked/);
  });

  // The warning is for a decision that has not been made yet. After the
  // session it is a verdict on something already climbed.
  it('drops it once the session is logged', async () => {
    await open({ program: 'ground_zero', typeId: 'str', injured: 'elbow', logged: true });
    const view = renderAt('/', <HomePage />);
    await view.findByRole('heading', { level: 1 });
    expect(view.container.textContent ?? '').not.toMatch(/3 exercises load your elbow/);
  });
});

describe('the week ahead', () => {
  async function nextWeek(injured?: BodyPart) {
    await open({ program: 'ground_zero', typeId: 'str', ...(injured ? { injured } : {}) });
    const view = renderAt('/review', <ReviewPage />);
    await view.findByRole('heading', { level: 1 });
    const card = [...view.container.querySelectorAll('section, div')].find((el) =>
      el.textContent?.startsWith('Next week'),
    );
    if (!card) return { seen: '', heard: '' };
    // What a screen reader gets and what the page shows are different
    // sentences here, and the point of the caption is that only one of them
    // repeats.
    const visible = card.cloneNode(true) as HTMLElement;
    for (const hidden of visible.querySelectorAll('.sr-only')) hidden.remove();
    return { seen: visible.textContent ?? '', heard: card.textContent ?? '' };
  }

  it('marks the days that load it, so a week can be rearranged in advance', async () => {
    expect((await nextWeek('elbow')).seen).toMatch(/3/);
  });

  // Naming the part on every row is the same sentence read five times.
  it('names the part once on screen, under the list', async () => {
    const { seen } = await nextWeek('elbow');
    expect(seen.match(/your elbow/g) ?? []).toHaveLength(1);
    expect(seen).toMatch(/Counts what that day loads of your elbow/);
  });

  // A bare "3" read aloud, several rows before the caption that explains
  // it, is not a number anyone can act on.
  it('says what the number is to someone who cannot see the badge', async () => {
    expect((await nextWeek('elbow')).heard).toMatch(/3 exercises load your elbow/);
  });

  it('leaves the week unmarked when nothing is hurt', async () => {
    const { seen, heard } = await nextWeek();
    expect(heard).not.toMatch(/Counts what that day loads/);
    // No caption and no badges: a column of zeroes beside seven days is
    // worse than nothing, because it looks like a reading.
    expect(seen).not.toMatch(/\d/);
  });
});
