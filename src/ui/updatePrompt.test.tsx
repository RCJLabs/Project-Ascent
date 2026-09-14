// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFER_MS } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { UpdatePrompt } from './UpdatePrompt';

/**
 * "Later", and what happens after it (PLAN.md M19, M154).
 *
 * M19 made the deferral last for the run of the app, which was honest while
 * nothing polled — the next launch was the new version. Once the app can
 * notice an update days into a run, a deferral that never expires is the
 * same silence M154 exists to fix.
 */

const NOW = 1_700_000_000_000;

beforeEach(() => {
  cleanup();
  useAppUpdate.setState({
    ready: false,
    deferred: false,
    deferredAt: null,
    offlineReady: false,
    apply: null,
    lastCheckedAt: null,
  });
});

const waiting = () => useAppUpdate.getState().markReady(() => {});

describe('the update prompt', () => {
  it('appears once a version is waiting', () => {
    waiting();
    render(<UpdatePrompt live={false} />);
    expect(screen.getByText('A new version is ready')).toBeTruthy();
  });

  it('stays away while a session is running', () => {
    waiting();
    render(<UpdatePrompt live />);
    expect(screen.queryByText('A new version is ready')).toBeNull();
  });

  it('goes away when the climber says later, and stamps when', () => {
    waiting();
    render(<UpdatePrompt live={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByText('A new version is ready')).toBeNull();
    expect(useAppUpdate.getState().deferredAt).not.toBeNull();
  });

  it('comes back once that later has run out', () => {
    waiting();
    useAppUpdate.getState().defer(NOW - DEFER_MS);
    useAppUpdate.getState().expireDeferral(NOW);
    render(<UpdatePrompt live={false} />);
    expect(screen.getByText('A new version is ready')).toBeTruthy();
  });

  it('stays away while the later is still fresh', () => {
    waiting();
    useAppUpdate.getState().defer(NOW - DEFER_MS + 1);
    useAppUpdate.getState().expireDeferral(NOW);
    render(<UpdatePrompt live={false} />);
    expect(screen.queryByText('A new version is ready')).toBeNull();
  });

  it('says what applies a held update', () => {
    waiting();
    render(<UpdatePrompt live={false} />);
    expect(screen.getByText(/close the app and open it again/)).toBeTruthy();
  });
});
