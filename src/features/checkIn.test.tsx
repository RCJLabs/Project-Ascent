// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { dayOfWeek, today } from '@/engine/dates';
import { FINGER_CHIP, FINGER_LABEL, SLEEP_CHIP, SLEEP_LABEL } from '@/engine/readiness';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import type { BodyPart } from '@/content/warmups';

/**
 * The readiness check-in (PLAN.md M72).
 *
 * The engine's rules are tested in engine/readiness.test.ts. This is about
 * the two things that make it not superstition: the answer is stored, and it
 * marks the session in places the climber was going to look anyway.
 */

const DATE = today();
const PROGRAM = 'ground_zero';
/** Fingers on the wall; `mob` is the same program's day with none. */
const FINGER_DAY = 'str';
const NO_FINGER_DAY = 'mob';

interface Options {
  patch?: Record<string, unknown>;
  /** A standing injury, to check which warning wins on a line. */
  injured?: BodyPart;
}

async function logging(typeId: string, options: Options = {}): Promise<void> {
  await reset();
  const program = getProgram(PROGRAM)!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: typeId,
    ...options.patch,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    // The plan has to place the session type on today, or the day has no
    // phase and there is no prescription to mark.
    plans: { [program.id]: { [dayOfWeek(DATE)]: typeId } },
    weekOverrides: {},
    adaptations: {},
    ...(options.injured
      ? {
          injuries: [
            {
              id: 'inj-1',
              part: options.injured,
              since: DATE,
              severity: 'managing' as const,
              status: 'active' as const,
            },
          ],
        }
      : {}),
  });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

const chip = (name: string) => screen.getByRole('button', { name });
/** The flag on a prescription line, which reads `{answer} — {why it loads}`.
 *  Matched on the second half so it cannot be confused with the effort
 *  ceiling, which opens with the same answer. */
const lineFlag = (answer: string) => new RegExp(`${answer} — it loads`);
const stored = async () => (await getSession(`${DATE}#0`))?.checkIn;

describe('asking', () => {
  it('asks two questions and no more', async () => {
    await logging(FINGER_DAY);
    expect(await screen.findByText('How do the fingers feel?')).toBeTruthy();
    expect(screen.getByText('How was the sleep?')).toBeTruthy();
  });

  it('stores nothing until it is asked to — the card does not insist', async () => {
    await logging(FINGER_DAY);
    await screen.findByText('How do the fingers feel?');
    expect(await stored()).toBeUndefined();
  });

  it('stores nothing on half an answer, and says nothing about it', async () => {
    await logging(FINGER_DAY);
    fireEvent.click(await screen.findByRole('button', { name: FINGER_CHIP.sore }));
    // Guessing the other half as "fine" would put words in the climber's
    // mouth and then advise them on it.
    expect(await stored()).toBeUndefined();
    expect(screen.queryByText('Train, with changes.')).toBeNull();
  });

  it('stores both once both are given', async () => {
    await logging(FINGER_DAY);
    fireEvent.click(await screen.findByRole('button', { name: FINGER_CHIP.tender }));
    fireEvent.click(chip(SLEEP_CHIP.short));
    await waitFor(async () => expect(await stored()).toEqual({ fingers: 'tender', sleep: 'short' }));
    expect(screen.getByText('Train, with changes.')).toBeTruthy();
  });

  it('does not ask on a rest day', async () => {
    await logging('rest');
    await screen.findByText('Recovery checklist');
    expect(screen.queryByText('How do the fingers feel?')).toBeNull();
  });
});

describe('what the answer changes', () => {
  it('marks the lines that load the part you flagged', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'sore', sleep: 'good' } } });
    const flags = await screen.findAllByText(lineFlag(FINGER_LABEL.sore));
    expect(flags.length).toBeGreaterThan(0);
    expect(flags[0]!.textContent).toMatch(/loads the fingers/);
  });

  it('names the fingers on the line even when the sleep was bad too', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'sore', sleep: 'none' } } });
    const flags = await screen.findAllByText(lineFlag(FINGER_LABEL.sore));
    // The sleep had nothing to do with this line.
    expect(flags[0]!.textContent).not.toContain(SLEEP_LABEL.none);
  });

  it('leaves the lines alone when the fingers are fine', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'good', sleep: 'none' } } });
    await screen.findByText("Today's prescription");
    expect(screen.queryByText(lineFlag(FINGER_LABEL.good))).toBeNull();
    expect(screen.queryByText(/— it loads/)).toBeNull();
  });

  it('puts the ceiling next to the effort, where it bites', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'tender', sleep: 'none' } } });
    expect(await screen.findByText(/the check-in suggested 5 or below/)).toBeTruthy();
  });

  it('sets no ceiling on a day with nothing wrong with it', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'good', sleep: 'good' } } });
    await screen.findByText('Good to go.');
    expect(screen.queryByText(/the check-in suggested/)).toBeNull();
  });

  it('still lets you log what the session actually was', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'sore', sleep: 'none' } } });
    await screen.findByText(/the check-in suggested 5 or below/);
    fireEvent.click(chip('9'));
    await waitFor(async () => expect((await getSession(`${DATE}#0`))?.rpe).toBe(9));
  });

  it('does not talk about the fingerboard on a day with no fingerboard in it', async () => {
    await logging(NO_FINGER_DAY, { patch: { checkIn: { fingers: 'sore', sleep: 'good' } } });
    await screen.findByText('Train, with changes.');
    expect(screen.queryByText(/Leave the fingerboard/)).toBeNull();
    // The call still stands: sore fingers are still sore.
    expect(screen.getByText(/the check-in suggested 7 or below/)).toBeTruthy();
  });

  it('gives a standing injury the line, rather than saying two things on it', async () => {
    await logging(FINGER_DAY, {
      patch: { checkIn: { fingers: 'sore', sleep: 'good' } },
      injured: 'fingers',
    });
    // An injury is a standing condition and today's check-in is not. Both on
    // one exercise makes the first mean less, so the injury outranks.
    expect((await screen.findAllByText(/^Loads /)).length).toBeGreaterThan(0);
    expect(screen.queryByText(lineFlag(FINGER_LABEL.sore))).toBeNull();
  });

  it('says it on a day that does load them', async () => {
    await logging(FINGER_DAY, { patch: { checkIn: { fingers: 'sore', sleep: 'good' } } });
    expect(await screen.findByText(/Leave the fingerboard/)).toBeTruthy();
  });
});
