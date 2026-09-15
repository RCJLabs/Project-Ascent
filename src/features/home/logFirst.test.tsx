// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { getDb } from '@/db/db';
import { newSession, putSession } from '@/db/sessions';
import { today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { DayBody } from '@/features/log/LogPage';
import { HomePage } from './HomePage';

/**
 * Log first (PLAN.md M123).
 *
 * A new install used to be sent to `/welcome` before it saw anything —
 * six steps, seven questions, and a program picked at the end — and the
 * app it had installed was on the other side of all of it. Now the first
 * screen is today, with the button that logs a session, and what
 * onboarding front-loaded is three cards under it with a "not now" each.
 *
 * These drive that from the outside: what a fresh install sees, what each
 * card's buttons do, and that a wave-away is remembered across a reload.
 */

const TODAY = today();

/** A fresh install: nothing in the database, every store hydrated. */
async function fresh(): Promise<void> {
  await reset();
  window.location.hash = '';
}

const card = (title: string) => screen.queryByRole('heading', { name: title, level: 2 });

describe('a fresh install', () => {
  it('lands on today, with the button that logs a session', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
    await screen.findByRole('button', { name: /Log a session/ });
    // And stays there. The old redirect fired from the shell, which this
    // does not render; the source check below is what holds that.
    expect(window.location.hash).toBe('#/');
  });

  it('says it is the first session, once the log has loaded', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByText(/Your first session/);
    expect(screen.queryByText(/no program is running/)).toBeNull();
  });

  it('does not say so before the log has loaded', async () => {
    // An empty `byDate` before hydration is a log that has not arrived, not
    // a climber who has never logged. The store loads in an effect, so the
    // first paint is the one to look at.
    await fresh();
    useSessions.setState({ hydrated: false, byDate: {} });
    renderAt('/', <DayBody date={TODAY} />);
    expect(screen.queryByText(/Your first session/)).toBeNull();
    await screen.findByText(/Your first session/);
  });

  it('says nothing about a first session once any day is logged', async () => {
    await fresh();
    await putSession({ ...newSession('2026-01-06', 0), completed: true, climbs: [] });
    await hydrate();
    renderAt('/', <HomePage />);
    await screen.findByText(/no program is running/);
    expect(screen.queryByText(/Your first session/)).toBeNull();
  });

  it('carries the safety note, the setup and the programs as cards', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card('Before you train')).toBeTruthy();
    expect(card('Set up your climber')).toBeTruthy();
    expect(card('Pick a program')).toBeTruthy();
  });

  it('puts the cards under the session, not above it', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    const button = await screen.findByRole('button', { name: /Log a session/ });
    const note = card('Before you train')!;
    expect(button.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('links the setup to the guided flow and the programs to the finder and the catalogue', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(screen.getByRole('link', { name: /Set up/ }).getAttribute('href')).toBe('#/welcome');
    expect(screen.getByRole('link', { name: /Find my program/ }).getAttribute('href')).toBe('#/find');
    expect(screen.getByRole('link', { name: 'Browse' }).getAttribute('href')).toBe('#/train');
  });
});

describe('not now', () => {
  it('takes the safety note away on Got it', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(card('Before you train')).toBeNull();
    // The other two are untouched.
    expect(card('Set up your climber')).toBeTruthy();
    expect(card('Pick a program')).toBeTruthy();
  });

  it('takes the setup away, and only the setup', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    const notNow = screen.getAllByRole('button', { name: 'Not now' });
    expect(notNow).toHaveLength(2);
    fireEvent.click(notNow[0]!);
    expect(card('Set up your climber')).toBeNull();
    expect(card('Before you train')).toBeTruthy();
    expect(card('Pick a program')).toBeTruthy();
  });

  it('takes the programs away, and only the programs', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getAllByRole('button', { name: 'Not now' })[1]!);
    expect(card('Pick a program')).toBeNull();
    expect(card('Before you train')).toBeTruthy();
    expect(card('Set up your climber')).toBeTruthy();
  });

  it('is remembered across a reload', async () => {
    await fresh();
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Not now' })[0]!);
    // Reload from the database rather than trusting the store: the store
    // is what the click changed, the database is what survives the tab.
    await waitFor(async () => {
      await hydrate();
      // `safety:before` rather than `safety` (PLAN.md M181): the note is
      // waved away against the training it is about, so a climber who has
      // never loaded a finger sees it once more when they first do.
      expect(useProfile.getState().dismissedCards).toEqual(['safety:before', 'setup']);
    });
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card('Before you train')).toBeNull();
    expect(card('Set up your climber')).toBeNull();
    expect(card('Pick a program')).toBeTruthy();
  });

  it('records a card once however often it is waved away', async () => {
    await fresh();
    useProfile.getState().dismissCard('safety');
    useProfile.getState().dismissCard('safety');
    expect(useProfile.getState().dismissedCards).toEqual(['safety']);
  });
});

describe('the cards know when they no longer apply', () => {
  it('drops the setup once it has been finished', async () => {
    await fresh();
    useProfile.setState({ onboardedAt: '2026-09-01T09:00:00.000Z' });
    renderAt('/', <HomePage />);
    await screen.findByRole('button', { name: /Log a session/ });
    expect(card('Set up your climber')).toBeNull();
    expect(card('Before you train')).toBeTruthy();
    expect(card('Pick a program')).toBeTruthy();
  });

  it('drops the programs while a block is running, and keeps the safety note', async () => {
    await fresh();
    useProfile.setState({
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: TODAY },
      plans: { iron_grip: {} },
    });
    renderAt('/', <HomePage />);
    await screen.findByRole('heading', { name: 'Your week', level: 2 });
    expect(card('Pick a program')).toBeNull();
    // The note was only ever on the welcome screen, which a climber who
    // restored a backup never saw. A running block is not "Got it".
    expect(card('Before you train')).toBeTruthy();
  });
});

describe('the record', () => {
  it('reads a profile written before the field existed as nothing dismissed', async () => {
    await fresh();
    const db = await getDb();
    await db.put('profile', { key: 'active-plan', value: { activeProgramId: null } } as never);
    await hydrate();
    expect(useProfile.getState().dismissedCards).toEqual([]);
  });

  it('keeps only the strings from a backup', async () => {
    await fresh();
    const db = await getDb();
    await db.put('profile', {
      key: 'active-plan',
      value: { activeProgramId: null, dismissedCards: ['safety', 3, null, 'setup'] },
    } as never);
    await hydrate();
    expect(useProfile.getState().dismissedCards).toEqual(['safety', 'setup']);
  });
});

describe('the redirect is gone', () => {
  // The hook lived in the shell, which no page test renders; what a test
  // can hold is that nothing in the router sends anyone to the setup.
  it('nothing in the router navigates to the welcome screen', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    expect(app).not.toMatch(/useFirstRunRedirect/);
    expect(app).not.toMatch(/navigate\(['"]\/welcome/);
    expect(app).not.toMatch(/launchFlag/);
  });
});
