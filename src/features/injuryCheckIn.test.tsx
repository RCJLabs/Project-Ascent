// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { getSession, newSession, putSession } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { useProfile, type Injury } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from '@/features/log/LogPage';
import { InjuryPage } from '@/features/injury/InjuryPage';

/**
 * The injury as a series (PLAN.md M103).
 *
 * An `Injury` says where a part stands now and is overwritten every time it
 * is edited. The check-in asked about the fingers and the sleep. So the one
 * question every physio asks — how has it been? — had no data in an app
 * holding both the injury and the sessions.
 */

const DATE = today();

const injury = (part: Injury['part'], patch: Partial<Injury> = {}): Injury => ({
  id: `i-${part}`,
  part,
  since: addDays(DATE, -29),
  severity: 'managing',
  status: 'active',
  ...patch,
});

async function logging(injuries: Injury[], sessions = [newSession(DATE, 0, { completed: false })]) {
  await reset();
  for (const s of sessions) await putSession(s as never);
  await hydrate();
  useProfile.setState({ injuries });
  renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
}

const stored = async () => (await getSession(`${DATE}#0`))?.checkIn;

describe('the check-in asks about what is hurt', () => {
  it('asks nothing extra with nothing injured', async () => {
    await logging([]);
    expect(screen.getByText('How do the fingers feel?')).toBeTruthy();
    expect(screen.queryByText(/How is your/)).toBeNull();
  });

  it('asks once per open injury', async () => {
    await logging([injury('elbow'), injury('knee')]);
    expect(screen.getByText('How is your elbow today?')).toBeTruthy();
    expect(screen.getByText('How is your knee today?')).toBeTruthy();
  });

  // The check-in already asks how the fingers feel, of everyone. A second
  // chip row for the same tissue is the same question twice.
  it('does not ask again about a part the fingers question covers', async () => {
    await logging([injury('fingers'), injury('pulley')]);
    expect(screen.getByText('How do the fingers feel?')).toBeTruthy();
    expect(screen.queryByText(/How is your fingers/)).toBeNull();
    expect(screen.queryByText(/How is your pulley/)).toBeNull();
  });

  it('asks once for two injuries to the same part', async () => {
    await logging([injury('elbow'), { ...injury('elbow'), id: 'i-elbow-2', side: 'left' }]);
    expect(screen.getAllByText('How is your elbow today?')).toHaveLength(1);
  });

  it('keeps the answer on the session', async () => {
    await logging([injury('elbow')]);
    fireEvent.click(within(fieldset('How is your elbow today?')).getByText('Sore'));
    fireEvent.click(within(fieldset('How do the fingers feel?')).getByText('Fine'));
    fireEvent.click(within(fieldset('How was the sleep?')).getByText('Well'));
    await waitFor(async () => expect((await stored())?.parts?.elbow).toBe('sore'));
  });

  // Two injuries are two answers, not the last one you happened to tap.
  it('keeps every part answered, not only the last', async () => {
    await logging([injury('elbow'), injury('knee')]);
    fireEvent.click(within(fieldset('How is your elbow today?')).getByText('Sore'));
    fireEvent.click(within(fieldset('How is your knee today?')).getByText('Fine'));
    fireEvent.click(within(fieldset('How do the fingers feel?')).getByText('Fine'));
    fireEvent.click(within(fieldset('How was the sleep?')).getByText('Well'));
    await waitFor(async () =>
      expect((await stored())?.parts).toEqual({ elbow: 'sore', knee: 'good' }),
    );
  });

  // Every answer that is not "fine" has to produce something you can point
  // at, which is the rule the check-in was built on.
  it('changes the day when a part is sore', async () => {
    await logging([injury('elbow')]);
    fireEvent.click(within(fieldset('How do the fingers feel?')).getByText('Fine'));
    fireEvent.click(within(fieldset('How was the sleep?')).getByText('Well'));
    fireEvent.click(within(fieldset('How is your elbow today?')).getByText('Sore'));
    expect(await screen.findByText(/Train around your elbow today/)).toBeTruthy();
    expect(screen.getByText('Elbow sore')).toBeTruthy();
  });

  it('says nothing extra when the part is fine', async () => {
    await logging([injury('elbow')]);
    fireEvent.click(within(fieldset('How do the fingers feel?')).getByText('Fine'));
    fireEvent.click(within(fieldset('How was the sleep?')).getByText('Well'));
    fireEvent.click(within(fieldset('How is your elbow today?')).getByText('Fine'));
    await waitFor(async () => expect((await stored())?.parts?.elbow).toBe('good'));
    expect(screen.queryByText(/Train around your elbow/)).toBeNull();
    // And it stays a full day. An injury you have is not a reason to be
    // told to go easy on a day you said it was fine.
    expect(screen.getByText('Good to go.')).toBeTruthy();
    expect(screen.getByText('Nothing flagged.')).toBeTruthy();
  });
});

/** The chip row under one question, by its legend. */
function fieldset(legend: string): HTMLElement {
  return screen.getByText(legend).closest('fieldset')!;
}

describe('what the injury page says about it', () => {
  const answered = (date: string, feel: 'good' | 'tender' | 'sore') => ({
    ...newSession(date, 0, { completed: true }),
    checkIn: { fingers: 'good' as const, sleep: 'good' as const, parts: { elbow: feel } },
  });

  async function page(sessions: ReturnType<typeof answered>[]) {
    await reset();
    for (const s of sessions) await putSession(s as never);
    await hydrate();
    useProfile.setState({ injuries: [injury('elbow')] });
    renderAt('/injury/i-elbow', <InjuryPage params={{ id: 'i-elbow' }} />);
  }

  it('says nothing before anything was answered', async () => {
    await page([]);
    expect(screen.queryByText('How it has been')).toBeNull();
  });

  // Coverage first: "worse three times" over thirty days means something
  // different from "worse three times" over four answers.
  it('states coverage before the counts', async () => {
    await page([answered(addDays(DATE, -5), 'good'), answered(addDays(DATE, -2), 'sore')]);
    expect(screen.getByText('How it has been')).toBeTruthy();
    expect(screen.getByText(/Answered on 2 of the 30 days since you logged it/)).toBeTruthy();
  });

  it('lists the days it was worse, with what was around them', async () => {
    await page([answered(addDays(DATE, -5), 'sore')]);
    expect(screen.getByText('The days it was worse')).toBeTruthy();
    expect(screen.getByText(/That day: Climbing session/)).toBeTruthy();
  });

  /**
   * No ratio, ever.
   *
   * The milestone proposed "worse on 4 of the 5 days after a session that
   * loaded the elbow; 1 of 9 otherwise". Two counts side by side are a
   * causal claim however they are worded — and "loaded the elbow" is a
   * keyword scan whose own module says it is not fit for a number.
   */
  it('draws no comparison and names no cause', async () => {
    await page([
      answered(addDays(DATE, -6), 'sore'),
      answered(addDays(DATE, -4), 'good'),
      answered(addDays(DATE, -2), 'sore'),
    ]);
    const card = screen.getByText('How it has been').closest('section')!;
    expect(card.textContent).not.toMatch(/otherwise|caused|because of|more likely|correlat/i);
    expect(card.textContent).toMatch(/not a cause/);
  });

  // The heading is the claim. Over a fortnight of fine days there is
  // nothing to head.
  it('does not head a list of bad days when there were none', async () => {
    await page([answered(addDays(DATE, -5), 'good'), answered(addDays(DATE, -3), 'tender')]);
    expect(screen.getByText('How it has been')).toBeTruthy();
    expect(screen.queryByText('The days it was worse')).toBeNull();
  });

  it('says the app does not know what else you did', async () => {
    await page([answered(addDays(DATE, -2), 'sore')]);
    expect(screen.getByText(/nothing at all about the rest of your week/)).toBeTruthy();
  });

  // Red-amber-green is a convention, not a reading. A chip that says only
  // the date is a colour and nothing else.
  it('puts the answer in the chip and not only in the colour', async () => {
    await page([answered(addDays(DATE, -5), 'sore'), answered(addDays(DATE, -3), 'tender')]);
    const strip = screen.getByLabelText('How it felt, by day');
    expect(strip.textContent).toMatch(/worse/);
    expect(strip.textContent).toMatch(/niggly/);
  });

  /**
   * An injury answered about all year is hundreds of chips. The counts are
   * all of them; the strip is the recent shape and says when it is a slice.
   */
  it('caps the strip, and says the counts are not capped', async () => {
    const many = Array.from({ length: 20 }, (_, i) => answered(addDays(DATE, -(i + 1)), 'good'));
    await page(many);
    const strip = screen.getByLabelText('How it felt, by day');
    expect(within(strip).getAllByRole('listitem')).toHaveLength(14);
    expect(screen.getByText(/The counts above are all 20/)).toBeTruthy();
    expect(screen.getByText(/20 fine/)).toBeTruthy();
  });

  it('says nothing about a cap it did not apply', async () => {
    await page([answered(addDays(DATE, -2), 'sore')]);
    expect(screen.queryByText(/The counts above are all/)).toBeNull();
  });

  // The newest answers, not the oldest: the shape you are in now.
  it('keeps the most recent answers when it caps', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      answered(addDays(DATE, -(i + 1)), i === 0 ? 'sore' : 'good'),
    );
    await page(many);
    const strip = screen.getByLabelText('How it felt, by day');
    expect(strip.textContent).toMatch(/worse/);
  });
});
