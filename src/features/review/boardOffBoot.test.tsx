// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { newSession, putSession, type Session } from '@/db/sessions';
import { weeklyChallenges } from '@/engine/challenges';
import { addDays, startOfWeek, today } from '@/engine/dates';
import { getProgram } from '@/content/programs';
import { deriveClimberState } from '@/engine/derive';
import { weeklyTargetOf } from '@/engine/review';
import { useProfile } from '@/store/profile';
import { hydrate, renderAt, reset } from '@/test/render';
import { ReviewPage } from '@/features/review/ReviewPage';

/**
 * The board's engine came off the boot path (PLAN.md M230 withdrawn).
 *
 * `engine/review.ts` called `weeklyChallenges`, `ReviewCard` calls
 * `buildReview`, and `ReviewCard` is on Home — the one eager route. That put
 * the whole board engine in the entry chunk, 2.12KB gzipped, for a field
 * only the lazy review page reads. The resolution moved to that page, and
 * the risk of a move like that is losing the feature quietly.
 */

const TODAY = today();

function day(date: string, body: Partial<Session> = {}): Session {
  return {
    ...newSession(date, 0),
    completed: true,
    rewarded: true,
    rpe: 6,
    durationMin: 60,
    warmup: true,
    climbs: [{ id: 'c', grade: 'V3', scale: 'V', count: 1, result: 'send' }],
    ...body,
  };
}

beforeEach(async () => {
  await reset();
});

describe('the review page kept its challenges', () => {
  it('still lists the week, now that it resolves them itself', async () => {
    // The refactor that took the board engine off the boot path moved the
    // resolution from `buildReview` to this page. The risk of a move like
    // that is losing the feature quietly, so this is the guard.
    const sessions = [1, 3, 5].map((d) => day(addDays(startOfWeek(TODAY), d)));
    for (const s of sessions) await putSession(s);
    await hydrate();
    renderAt('/review', <ReviewPage />);
    const expected = weeklyChallenges(sessions, deriveClimberState(sessions), startOfWeek(TODAY), 3);
    expect(expected.length).toBeGreaterThan(0);
    for (const c of expected) expect(await screen.findByText(c.title)).toBeTruthy();
    expect(screen.getByText(/weekly challenges/)).toBeTruthy();
  });

  it('resolves them for the week being read, not for this one', async () => {
    /**
     * The page carries week navigation, so the anchor and today are only the
     * same thing on the current week. Resolving against `today()` would show
     * **this** week's board under a past week's heading — and every other
     * number on the page would be that past week's, which is worse than
     * showing nothing.
     *
     * Sessions in the earlier week only, so the progress tells the two
     * apart: the current week reads zero and the one before it does not.
     */
    const lastWeek = addDays(startOfWeek(TODAY), -7);
    for (const d of [1, 3, 5]) await putSession(day(addDays(lastWeek, d)));
    await hydrate();
    renderAt('/review', <ReviewPage />);

    /**
     * The row on this page is `<span>{title}</span><span>{n} / {target}</span>`
     * — the unit is not in it, so `3 / 3 sessions` matches nothing. The
     * progress is read off the row that holds the consistency title, which
     * is the one whose number moves with the week.
     */
    const counted = () => {
      const row = screen.getByText('3 sessions this week').closest('li');
      return row?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    };
    await screen.findByText('3 sessions this week');
    expect(counted()).toContain('0 / 3');

    fireEvent.click(screen.getByRole('button', { name: /Earlier/ }));
    await waitFor(() => expect(counted()).toContain('3 / 3'));
    expect(counted()).not.toContain('0 / 3');
  });

  it('scales them to the program the review is already counting against', async () => {
    /**
     * The target moved with the resolution, and a constant would look right
     * on a climber with no program — `weeklyTargetOf(undefined)` is 3. Iron
     * Grip asks for four, so the challenge the board writes says four, and
     * the adherence line above it says four: they cannot be scaled to two
     * different numbers on one screen.
     */
    const sessions = [1, 3, 5].map((d) => day(addDays(startOfWeek(TODAY), d)));
    for (const s of sessions) await putSession(s);
    await hydrate();
    useProfile.setState({ activeProgramId: 'iron_grip' });
    renderAt('/review', <ReviewPage />);

    const program = getProgram('iron_grip')!;
    const target = weeklyTargetOf(program);
    expect(target).toBe(4);
    const scaled = weeklyChallenges(
      sessions,
      deriveClimberState(sessions),
      startOfWeek(TODAY),
      target,
    );
    const counted = scaled.find((c) => c.target === target);
    expect(counted, 'one challenge counts the sessions').toBeDefined();
    // The title carries the number — `${weeklyTarget} sessions this week` —
    // so this is the target, not a paraphrase of it.
    expect(counted!.title).toContain(String(target));
    expect(await screen.findByText(counted!.title)).toBeTruthy();
    expect(screen.queryByText('3 sessions this week'), 'the default target leaked in').toBeNull();
  });
});
