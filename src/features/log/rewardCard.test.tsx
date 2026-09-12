// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { newSession, putSession, type Session } from '@/db/sessions';
import { today } from '@/engine/dates';
import { useXp } from '@/store/game';
import type { SessionXp } from '@/engine/xp';
import { hydrate, renderAt, reset } from '@/test/render';
import { GamePage } from '@/features/game/GamePage';
import { DayBody } from './LogPage';

/**
 * The XP on a logged session is one quiet line (PLAN.md M118).
 *
 * From M13 to M117 every session ended in a ledger: the number in 3xl, the
 * lines under it, the multipliers under those. The number still accrues
 * and is still shown — here as a line, and on the Game tab in full — but
 * logging a session no longer looks like being paid.
 */

const TODAY = today();

/**
 * A plain session: not the first, not a record, nothing to celebrate. The
 * milestone lead is M26's and is not what this file is about, so the
 * fixture puts three harder days before today.
 */
async function logged(): Promise<string> {
  await reset();
  for (const [i, date] of ['2026-01-05', '2026-01-07', '2026-01-09'].entries()) {
    await putSession({
      ...newSession(date, 0),
      completed: true,
      rewarded: true,
      rpe: 7,
      durationMin: 90,
      warmup: true,
      climbs: [{ id: `p${i}`, grade: 'V5', scale: 'V', count: 2, result: 'send' }],
    });
  }
  const session: Session = {
    ...newSession(TODAY, 0),
    completed: true,
    rewarded: false,
    rpe: 6,
    durationMin: 60,
    warmup: true,
    climbs: [{ id: 'c1', grade: 'V3', scale: 'V', count: 3, result: 'send' }],
  };
  await putSession(session);
  await hydrate();
  return session.id;
}

/** `useXp` is a hook; this reads it the way a component would. */
function xpFor(id: string): Promise<SessionXp | undefined> {
  return new Promise((resolve) => {
    function Probe() {
      const xp = useXp();
      useEffect(() => {
        resolve(xp.bySession[id]);
      }, [xp]);
      return null;
    }
    renderAt('/', <Probe />);
  });
}

describe('the reward card', () => {
  it('says the session is logged and the XP once, small', async () => {
    const id = await logged();
    const detail = await xpFor(id);
    expect(detail?.xp ?? 0).toBeGreaterThan(0);
    renderAt('/', <DayBody date={TODAY} />);
    await screen.findByText('Session logged.');
    const lines = screen.getAllByText(new RegExp(`\\+${detail!.xp.toLocaleString()} XP`));
    expect(lines).toHaveLength(1);
    expect(lines[0]!.className).toContain('text-sm');
    // The arithmetic is folded, not gone.
    expect(screen.queryByText(/already applied/)).toBeNull();
    for (const line of detail!.lines) expect(screen.queryByText(line.label)).toBeNull();
    expect(screen.getByRole('button', { name: 'How it was counted' })).toBeTruthy();
  });

  it('unfolds the arithmetic on request', async () => {
    const id = await logged();
    const detail = await xpFor(id);
    renderAt('/', <DayBody date={TODAY} />);
    await screen.findByText('Session logged.');
    fireEvent.click(screen.getByRole('button', { name: 'How it was counted' }));
    expect(detail!.lines.length).toBeGreaterThan(0);
    for (const line of detail!.lines) expect(screen.getByText(line.label)).toBeTruthy();
  });

  it('still lands on the game tab in full', async () => {
    const id = await logged();
    const detail = await xpFor(id);
    renderAt('/game', <GamePage />);
    await screen.findByRole('heading', { level: 1 });
    const recent = screen.getByText('Recent XP').closest('section')!;
    expect(within(recent).getByText(`+${detail!.xp.toLocaleString()}`)).toBeTruthy();
  });
});
