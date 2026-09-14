// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, render, screen } from '@testing-library/react';
import { reportDbError, resetDbForTests } from '@/db/db';
import { DbFaultBanner } from './DbFaultBanner';

/**
 * Why the log looks empty, when it is not (PLAN.md M151).
 *
 * Eight stores catch their read and set `hydrated: true` with nothing in
 * hand, so a climber whose two years of sessions are on the device and
 * unreadable saw exactly what a fresh install looks like.
 */

const named = (name: string): Error => {
  const error = new Error('browser-shaped text');
  error.name = name;
  return error;
};

beforeEach(() => {
  cleanup();
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('the banner', () => {
  it('says nothing when the database is fine', () => {
    render(<DbFaultBanner />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /**
   * The two things this one has to get right: the data is *there*, and the
   * app is the *older* of the two. Saying it the other way round tells a
   * climber to do nothing about a thing an update fixes.
   */
  it('does not call a newer schema an empty app', () => {
    reportDbError(named('VersionError'));
    render(<DbFaultBanner />);
    expect(screen.getByText('This data was written by a newer version')).toBeTruthy();
    const body = screen.getByRole('alert').textContent ?? '';
    expect(body).toMatch(/intact/);
    expect(body).toMatch(/this version of the app is older/);
    expect(body).not.toMatch(/this version of the app is newer/);
    expect(body).toMatch(/[Uu]pdate the app/);
  });

  it('names the other tab rather than blaming the data', () => {
    reportDbError(named('InvalidStateError'));
    render(<DbFaultBanner />);
    expect(screen.getByText('The app cannot open its storage')).toBeTruthy();
  });

  it('points a full disk at the screen that says what is taking the room', () => {
    reportDbError(named('QuotaExceededError'));
    render(<DbFaultBanner />);
    expect(screen.getByText('The device is out of room')).toBeTruthy();
    expect(screen.getByRole('link', { name: /See what is stored/ }).getAttribute('href')).toBe('/data');
  });

  /**
   * Every one of these means *your training is not being saved*. A banner
   * that can be waved away is waved away once and forgotten for a
   * fortnight, which is the failure it exists to prevent.
   */
  it('offers no way to dismiss it', () => {
    reportDbError(named('VersionError'));
    render(<DbFaultBanner />);
    expect(screen.queryAllByRole('button')).toEqual([]);
  });

  it('is an alert, not a status, because it is already happening', () => {
    reportDbError(named('QuotaExceededError'));
    render(<DbFaultBanner />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('changes what it says when the fault changes', () => {
    reportDbError(named('QuotaExceededError'));
    const view = render(<DbFaultBanner />);
    expect(screen.getByText('The device is out of room')).toBeTruthy();
    reportDbError(named('VersionError'));
    view.rerender(<DbFaultBanner />);
    expect(screen.getByText('This data was written by a newer version')).toBeTruthy();
    expect(screen.queryByText('The device is out of room')).toBeNull();
  });
});
