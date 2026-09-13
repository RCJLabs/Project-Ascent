// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { getSession, newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';

/**
 * Three questions the climbs already answer (PLAN.md M120).
 *
 * Iron Grip's climbing day asks for the hardest attempted, the hardest sent
 * and the climbs done. From M70 to M119 the logger asked all three of a
 * climber who had just tallied them.
 */

const DATE = today();

async function climbing(fields: Record<string, string | number>, climbs: unknown[]): Promise<void> {
  await reset();
  const program = getProgram('iron_grip')!;
  const type = program.sessionTypes.find((t) => (t.fields ?? []).includes('sessionVolume'))!;
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    programId: program.id,
    sessionTypeId: type.id,
    fields,
    climbs,
  } as never);
  await hydrate();
  useProfile.setState({
    activeProgramId: program.id,
    startDates: { [program.id]: DATE },
    plans: { [program.id]: {} },
    weekOverrides: {},
    adaptations: {},
  });
  // The card is in the full view.
  useSettings.setState({ logView: 'full' });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText('This session');
}

const sent = (grade: string, count = 1) => ({ id: `s-${grade}`, grade, scale: 'V', count, result: 'send' });
const tried = (grade: string, count = 1) => ({ id: `t-${grade}`, grade, scale: 'V', count, result: 'attempt' });

describe('a field the climbs answer', () => {
  it('is shown, not asked, once there are climbs', async () => {
    await climbing({}, [sent('V3', 3), sent('V5'), tried('V6', 2)]);
    const card = screen.getByText('This session').closest('section')!;
    expect(card.textContent).toContain('Hardest sent');
    expect(card.textContent).toContain('V5');
    expect(card.textContent).toContain('Hardest attempted');
    expect(card.textContent).toContain('V6');
    expect(card.textContent).toContain('Climbs done');
    expect(card.textContent).toContain('6');
    expect(card.textContent).toContain('From the climbs');
    expect(screen.queryByLabelText('Hardest sent')).toBeNull();
    expect(screen.queryByLabelText('Climbs done')).toBeNull();
  });

  it('is asked when there is nothing to read it from', async () => {
    await climbing({}, []);
    expect(screen.getByLabelText('Hardest sent')).toBeTruthy();
    expect(screen.getByLabelText('Climbs done')).toBeTruthy();
    expect(screen.queryByText(/From the climbs/)).toBeNull();
  });

  it('names a typed answer the climbs disagree with, and clears it on request', async () => {
    await climbing({ hardestGradeSent: 'V7', sessionVolume: 12 }, [sent('V5')]);
    const card = screen.getByText('This session').closest('section')!;
    expect(card.textContent).toContain('not the V7 you typed');
    expect(card.textContent).toContain('not the 12 you typed');
    const buttons = screen.getAllByRole('button', { name: 'Use the climbs' });
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]!);
    await waitFor(async () => expect((await getSession(`${DATE}#0`))?.fields?.hardestGradeSent).toBeUndefined());
    // The other stays until it is asked for.
    expect((await getSession(`${DATE}#0`))?.fields?.sessionVolume).toBe(12);
  });

  it('stays quiet about a typed answer the climbs agree with', async () => {
    await climbing({ hardestGradeSent: 'V5', sessionVolume: 1 }, [sent('V5')]);
    expect(screen.queryByRole('button', { name: 'Use the climbs' })).toBeNull();
    expect(screen.queryByText(/you typed/)).toBeNull();
  });
});
