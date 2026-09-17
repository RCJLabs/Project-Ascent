// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { putSession, type Session } from '@/db/sessions';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { TONE } from './weekNote';
import { ReviewPage } from './ReviewPage';

/**
 * One note, two screens (PLAN.md M184).
 *
 * `ReviewCard`, `useReview` and `TONE` lived in `ReviewPage.tsx`, and Home's
 * one import of the card pulled the page — its share sheet, the SVG card
 * builder behind it, its header and back link — into the entry chunk. The
 * fix was to move the card out, not to defer it: it never depended on the
 * page.
 *
 * `ui/wired.test.ts` guards the consequence — no page the router defers may
 * be reachable from `main.tsx` — and it is the guard that lasts, because it
 * asks the question of all forty-one routes rather than this one. What is
 * left for here is that the split did not change what a climber reads.
 *
 * **The card reads from Progress now, not Home (PLAN.md M239).** It had the
 * defect it was measuring: `note.headline` and the line under it can be the
 * same sentence — *"2 of 4 sessions"* over *"2 of 4 sessions · 8 sends this
 * week"* — with the week card below saying it a third time. Progress is the
 * way in M152 built for exactly this page, and the link there described the
 * note in the abstract where it can simply be it.
 */

const DAY = today();

async function aWeekOfTraining(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  for (let d = 6; d >= 0; d -= 2) {
    const date = addDays(DAY, -d);
    await putSession({
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      drillDone: false,
      climbs: [
        { id: `a${date}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session);
  }
  await hydrate();
  useProfile.setState({
    activeProgramId: null,
    startDates: {},
    injuries: [],
    dismissedTips: {},
    dismissedCards: ['safety', 'setup', 'programs'],
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the week note, split out of its page', () => {
  it('still reaches a screen, and it is its own page', async () => {
    await aWeekOfTraining();
    renderAt('/review', <ReviewPage />);
    await screen.findByRole('heading', { level: 1 });
    const body = document.body.textContent ?? '';
    expect(body, 'the page says nothing about the week').toMatch(/\d+\s*Sessions/);
    expect(body).toMatch(/\d+\s*Sends/);
  });

  /**
   * One hook, one tone table, one file — which is what is left of M184 now
   * that the card is gone. The page builds the note from `useReview` here
   * rather than from a copy, so there is nothing for the two to drift about.
   */
  it('builds the page\u2019s note from the shared hook', () => {
    const page = readFileSync('src/features/review/ReviewPage.tsx', 'utf8');
    expect(page, 'the page stopped reading the shared hook').toMatch(
      /import \{[^}]*useReview[^}]*\} from '\.\/weekNote'/,
    );
    expect(page, 'the page kept its own copy of the hook').not.toMatch(/function useReview/);
  });

  /**
   * Three tones, three colours. The table moved with the card, and a table
   * whose entries are the same colour is not a table — a battery mutant that
   * gave `good` the caution colour survived everything until this line.
   */
  it('keeps the three tones apart', () => {
    const colours = Object.values(TONE).map((t) => t.color);
    expect(colours).toHaveLength(3);
    expect(new Set(colours).size, `two tones share a colour: ${colours.join(', ')}`).toBe(3);
  });

  /**
   * The split stays one-directional. A card that imports its old page puts
   * the page back on the first-paint path, which is the whole defect, and it
   * is a convenience import away.
   */
  it('does not import the page back', () => {
    const card = readFileSync('src/features/review/weekNote.ts', 'utf8');
    expect(card).not.toMatch(/from '\.\/ReviewPage'/);
    const page = readFileSync('src/features/review/ReviewPage.tsx', 'utf8');
    expect(page, 'the page kept its own copy of the hook').not.toMatch(/function useReview/);
    expect(page, 'and the page re-exports the card, which is the leak again').not.toMatch(
      /export \{[^}]*ReviewCard/,
    );
    expect(page).toMatch(/import \{ TONE, useReview \} from '\.\/weekNote'/);
  });
});
