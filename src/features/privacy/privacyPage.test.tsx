// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { hydrate, renderAt, reset } from '@/test/render';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { PrivacyPage } from './PrivacyPage';

/**
 * The page is on the screen, not merely importable by one (PLAN.md M171).
 *
 * `privacy.test.ts` holds the claims against the source. This holds the page
 * against the app — M152's lesson, which three milestones this session have
 * now shipped a battery survivor for: an import satisfies a name check while
 * rendering nothing.
 */

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await hydrate();
});

const body = () => document.body.textContent ?? '';

describe('what a climber reads', () => {
  it('leads with the answer to the question they came with', async () => {
    renderAt('/privacy', <PrivacyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy' });
    expect(body()).toMatch(/Nothing you log leaves this device/);
    expect(body()).toMatch(/no account, no server, no sync and no analytics/i);
  });

  /**
   * And the awkward half, which is the half that makes the rest believable.
   * A page that says only the comfortable things is the kind this milestone
   * exists not to write.
   */
  it.each([
    [/whoever hosts it sees/, 'that hosting sees the requests'],
    [/no sync between your phone and your laptop/, 'that there is no sync'],
    [/no password reset because there is no password/, 'that nothing can be recovered'],
    [/copy of your whole log outside this app/, 'that a backup in the cloud is a copy'],
    [/share sheet/, 'that sharing hands an image to another app'],
  ])('says %s — %s', async (pattern) => {
    renderAt('/privacy', <PrivacyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy' });
    expect(body()).toMatch(pattern);
  });

  it('points at the two things a climber can actually do about it', async () => {
    renderAt('/privacy', <PrivacyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy' });
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    // Back up, and delete — both live in Settings.
    expect(links.filter((href) => href === '#/settings').length).toBeGreaterThanOrEqual(2);
    expect(body()).toMatch(/Export a backup/);
    expect(body()).toMatch(/behind a typed confirmation/);
  });

  it('names what is never asked for', async () => {
    renderAt('/privacy', <PrivacyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy' });
    expect(body()).toMatch(/No email address, no name, no sign-in/);
    expect(body()).toMatch(/No location, no contacts, no microphone/);
    // And the two it does ask the browser for, which a page claiming to ask
    // for nothing would be lying about.
    expect(body()).toMatch(/keep its storage/);
    expect(body()).toMatch(/hold the screen awake/);
  });

  it('has a way back, like every other page under Settings', async () => {
    renderAt('/privacy', <PrivacyPage />);
    await screen.findByRole('heading', { level: 1, name: 'Privacy' });
    const back = screen.getAllByRole('link').map((a) => (a.textContent ?? '').trim());
    expect(back).toContain('Settings');
  });
});

describe('where a climber finds it', () => {
  it('is linked from Settings, beside what is stored', async () => {
    renderAt('/settings', <SettingsPage />);
    await screen.findByRole('heading', { level: 1 });
    const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === '#/privacy');
    expect(link, 'no link to the privacy page in Settings').toBeTruthy();
    expect((link!.textContent ?? '').trim()).toBe('Privacy');
  });
});
