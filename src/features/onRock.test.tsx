// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { newSession, putSession, type Session } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgressPage } from '@/features/progress/ProgressPage';

/**
 * What you have done on rock (PLAN.md M112d).
 *
 * Personal records were one list with no notion of where a grade was sent,
 * so an indoor V7 and an outdoor V7 were the same record — and a climber
 * whose hardest ever is plastic had nothing at all telling them their
 * hardest on rock.
 */

let n = 0;
const day = (date: string, mode: 'indoor' | 'outdoor', grades: string[]): Session =>
  newSession(date, n++, {
    completed: true,
    mode,
    climbs: grades.map((grade) => ({
      id: `c${n++}`,
      grade,
      scale: grade.startsWith('V') ? ('V' as const) : ('YDS' as const),
      count: 1,
      result: 'send' as const,
    })),
  });

async function progressWith(sessions: Session[]): Promise<void> {
  await loadPrograms();
  await reset();
  for (const s of sessions) await putSession(s);
  await hydrate();
  renderAt('/progress', <ProgressPage />);
}

// "Records on rock", not "On rock": the grade pyramid above already has an
// On rock chip, and the first draft of this test found both.
const onRock = () => screen.queryByText('Records on rock');
const rockCard = () => {
  const heading = screen.getByText('Records on rock');
  const box = heading.closest('section, div[class*="rounded"]');
  if (!box) throw new Error('the On rock card has no container');
  return within(box as HTMLElement);
};

describe('the On rock card', () => {
  it('is absent for a climber who has only been indoors', async () => {
    await progressWith([day('2026-09-01', 'indoor', ['V5'])]);
    expect(onRock()).toBeNull();
  });

  it('does not share its name with the pyramid’s On rock chip', async () => {
    await progressWith([day('2026-09-01', 'outdoor', ['V4'])]);
    expect(screen.getAllByText('Records on rock')).toHaveLength(1);
  });

  it('appears once something has been climbed outside', async () => {
    await progressWith([day('2026-09-01', 'outdoor', ['V4'])]);
    expect(onRock()).toBeTruthy();
  });

  it('shows a rock grade the overall list does not', async () => {
    // The whole reason this is a separate list rather than a filter. V7
    // indoors is the only overall record; filtering it by mode leaves
    // nothing, and the climber learns nothing about rock.
    await progressWith([
      day('2026-09-01', 'indoor', ['V7']),
      day('2026-09-05', 'outdoor', ['V4']),
    ]);
    expect(rockCard().getByText('V4')).toBeTruthy();
  });

  it('does not let a gym send raise the bar for rock', async () => {
    await progressWith([
      day('2026-09-01', 'outdoor', ['V3']),
      day('2026-09-05', 'indoor', ['V8']),
      day('2026-09-08', 'outdoor', ['V4']),
    ]);
    const card = rockCard();
    expect(card.getByText('V3')).toBeTruthy();
    expect(card.getByText('V4')).toBeTruthy();
    expect(card.queryByText('V8')).toBeNull();
  });

  it('shows the newest records rather than the oldest', async () => {
    // The card caps at six. Without the reverse, a climber with a long
    // history sees their first six grades for ever and never the one they
    // just set — which is the row they opened the page for.
    await progressWith(
      ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'].map((g, i) =>
        day(`2026-09-0${i + 1}`, 'outdoor', [g]),
      ),
    );
    const card = rockCard();
    expect(card.getByText('V7')).toBeTruthy();
    expect(card.queryByText('V1'), 'the oldest record is still on screen').toBeNull();
  });

  it('says it is counting only what was climbed outside', async () => {
    await progressWith([day('2026-09-01', 'outdoor', ['V4'])]);
    expect(screen.getByText(/only what you climbed outside/i)).toBeTruthy();
  });
});

describe('the overall list says where a record was set', () => {
  it('marks one set on rock', async () => {
    await progressWith([day('2026-09-01', 'outdoor', ['V4'])]);
    const records = screen.getByText('Personal records').closest('section, div[class*="rounded"]')!;
    expect(within(records as HTMLElement).getByText(/first sent on rock/)).toBeTruthy();
  });

  it('says nothing extra for an indoor one', async () => {
    // "on rock" earns its place by distinguishing something. On an indoor
    // record it would be wrong, and on every row it would be noise.
    await progressWith([day('2026-09-01', 'indoor', ['V4'])]);
    const records = screen.getByText('Personal records').closest('section, div[class*="rounded"]')!;
    expect(within(records as HTMLElement).queryByText(/on rock/)).toBeNull();
  });

  it('does not repeat the qualifier inside the rock card', async () => {
    // That list is all outdoors; saying so on every row is noise.
    await progressWith([day('2026-09-01', 'outdoor', ['V4'])]);
    expect(rockCard().queryByText(/first sent on rock/)).toBeNull();
  });
});
