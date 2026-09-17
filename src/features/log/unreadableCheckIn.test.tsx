// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { Session } from '@/db/sessions';
import { getSession, newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { FINGER_CHIP, SLEEP_CHIP } from '@/engine/readiness';
import { useProfile } from '@/store/profile';
import { useSettings } from '@/store/settings';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from './LogPage';

/**
 * The logger, given a check-in it cannot read (PLAN.md M244).
 *
 * `sleep: 'poor'` is not one of the three words `SleepFeel` has, and a
 * restored backup can carry it: `importAll` checks the file is a Project
 * Ascent backup and each store is an array, then writes every record
 * verbatim. Spread into `readinessFor`, the missing contribution made the
 * cost `NaN`, which loses every comparison — so the call came out
 * *adjusted* with nothing flagged, and this card printed **"Nothing
 * flagged. — the check-in suggested 7 or below."** over a set taken off
 * every block. A quieter wrong than a crash, and the one M129 built the
 * card not to do.
 */

const DATE = today();
const ID = `${DATE}#0`;

async function logger(checkIn: unknown): Promise<void> {
  await reset();
  sessionStorage.clear();
  await putSession({
    ...newSession(DATE, 0, { completed: false }),
    startedAt: new Date().toISOString(),
    climbs: [{ id: 'a', grade: 'V4', scale: 'V', count: 2, result: 'send' }],
    checkIn,
  } as unknown as Session);
  await hydrate();
  useProfile.setState({ activeProgramId: null, startDates: {} });
  useSettings.setState({ logView: 'full' });
  renderAt('/', <DayBody date={DATE} />);
  await screen.findByText('Before you start');
}

const stored = async () => (await getSession(ID))!;

describe('a check-in the logger cannot read', () => {
  it('offers no ceiling it cannot explain', async () => {
    await logger({ fingers: 'good', sleep: 'poor' });
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/the check-in suggested/);
    // The readiness block under the questions is the same judgement shown
    // twice, so pin the headline too — the unread answer produced
    // "Train, with changes.", which is the one that must not appear.
    expect(text).not.toMatch(/Train, with changes\.|Today is not the day\.|Good to go\./);
  });

  it('shows the questions as unanswered rather than half-pressed', async () => {
    await logger({ fingers: 'good', sleep: 'poor' });
    for (const label of [...Object.values(FINGER_CHIP), ...Object.values(SLEEP_CHIP)]) {
      const chip = screen.getByRole('button', { name: label });
      expect(chip.getAttribute('aria-pressed'), label).toBe('false');
    }
  });

  /**
   * The trap that made this worth a separate file. The card's draft used to
   * start from the stored record, so answering the *other* question wrote
   * the unreadable word straight back — the climber could tap fingers, get
   * a save, and still be carrying a check-in nothing could read.
   */
  it('does not write the unreadable answer back when the other is answered', async () => {
    await logger({ fingers: 'good', sleep: 'poor' });
    fireEvent.click(screen.getByRole('button', { name: FINGER_CHIP.tender }));
    // Nothing saved: one answer is not a check-in.
    await waitFor(async () => {
      expect((await stored()).checkIn).toEqual({ fingers: 'good', sleep: 'poor' });
    });

    fireEvent.click(screen.getByRole('button', { name: SLEEP_CHIP.short }));
    await waitFor(async () => {
      expect((await stored()).checkIn).toEqual({ fingers: 'tender', sleep: 'short' });
    });
  });

  /** And a readable one still answers, still caps, still says why. */
  it('reads a check-in it knows exactly as before', async () => {
    await logger({ fingers: 'sore', sleep: 'none' });
    const text = document.body.textContent ?? '';
    expect(text).toMatch(/the check-in suggested/);
    // Which also proves the two probes above can match in this DOM at all
    // (PLAN.md M195): a headline and a ceiling both render here.
    expect(text).toMatch(/Today is not the day\./);
    expect(screen.getByRole('button', { name: FINGER_CHIP.sore }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
