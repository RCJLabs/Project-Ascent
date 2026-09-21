// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { loadPrograms } from '@/content/programs';
import { resetDbForTests } from '@/db/db';
import { newSession, putSession, type Session } from '@/db/sessions';
import type { AwayKind } from '@/engine/away';
import { addDays, today } from '@/engine/dates';
import { hydrate, renderAt, reset } from '@/test/render';
import { useAway } from '@/store/away';
import { useSettings } from '@/store/settings';
import { ProgressPage } from './ProgressPage';

/**
 * The marked stretch is on the screen, not merely in the engine
 * (PLAN.md M305).
 *
 * `blockCompare.test.ts` holds the rule about which window explains which
 * direction. This holds the wiring, which is the half that was missing for
 * thirty milestones: `ProgressPage` has read the away list since M275 and
 * handed it to the heat grid alone, while the card beside it said the app
 * could not tell a holiday from an illness. A `compareBlocks` call that
 * drops the list again puts that sentence back and breaks nothing else.
 */

const DAY = today();

/** A busy four weeks, then a quiet four. */
async function tailedOff(): Promise<void> {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  // Every other day through the earlier window and one a week through the
  // recent one. Relative strides rather than named weekdays, for the reason
  // `loadCaveat.test.ts` gives: a fixture keyed on Mondays puts a different
  // number of sessions in a window depending on what day today is.
  const dates = [
    ...Array.from({ length: 24 }, (_, i) => 74 - i * 2),
    ...Array.from({ length: 4 }, (_, i) => 21 - i * 7),
  ];
  for (const ago of dates) {
    const session: Session = {
      ...newSession(addDays(DAY, -ago), 0),
      completed: true,
      rpe: 7,
      durationMin: 60,
    };
    await putSession(session);
  }
}

async function marked(fromAgo: number, toAgo: number, kind: AwayKind, note?: string) {
  await useAway.getState().save({
    id: 'away-test',
    from: addDays(DAY, -fromAgo),
    to: addDays(DAY, -toAgo),
    kind,
    ...(note ? { note } : {}),
    updatedAt: `${addDays(DAY, -fromAgo)}T09:00:00.000Z`,
  });
}

const body = () => document.body.textContent ?? '';

async function open(): Promise<void> {
  await hydrate();
  useSettings.setState({ progressView: 'block' });
  renderAt('/progress', <ProgressPage />);
  await screen.findByText('Against the four weeks before');
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('the block card and the days you were away', () => {
  it('names the stretch under the comparison', async () => {
    await tailedOff();
    await marked(14, 1, 'injured');
    await open();
    expect(body()).toMatch(/fewer sessions than the four weeks before/);
    expect(body()).toMatch(/14 of those days are marked injured/);
  });

  it('calls it what the climber called it', async () => {
    await tailedOff();
    await marked(14, 1, 'trip', "Font '26");
    await open();
    expect(body()).toContain("marked Font '26");
  });

  it('says nothing extra when the climber has marked nothing', async () => {
    await tailedOff();
    await open();
    expect(body()).toMatch(/fewer sessions than the four weeks before/);
    expect(body()).not.toMatch(/of those days are marked/);
  });

  it('leaves the table itself taking no side', async () => {
    // The sentence names a fact the climber typed; the rows stay neutral,
    // which is M28's rule and is not what this milestone changed.
    await tailedOff();
    await marked(14, 1, 'injured');
    await open();
    expect(body()).toContain('Up is not better and down is not worse');
  });
});
