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

/**
 * And how far behind the copy in front of you is (PLAN.md M206).
 *
 * The prompt could only say a new version existed. `APP_VERSION` has read
 * `0.1.0` since the first commit, so there was nothing else it could say —
 * a build stamp is the part that moves.
 */
describe('how old the running copy is', () => {
  it('puts the age in the prompt', () => {
    // `__BUILT_AT__` is defined under vitest too — the config's `define`
    // applies to the test run — so this is the real sentence, not a shape.
    useAppUpdate.setState({ ready: true, apply: () => {} });
    render(<UpdatePrompt live={false} />);
    const said = screen.getByRole('status').textContent ?? '';
    expect(said).toMatch(/The copy you are running was built /);
    expect(said).toMatch(/today|yesterday|days ago|weeks ago|months ago/);
    expect(said).toMatch(/Updating reloads the app/);
  });

  it('never renders a gap where the age should be', () => {
    // The failure this is written against: a null age formatted into the
    // string rather than dropped from it.
    useAppUpdate.setState({ ready: true, apply: () => {} });
    render(<UpdatePrompt live={false} />);
    const said = screen.getByRole('status').textContent ?? '';
    expect(said).not.toMatch(/null|undefined|NaN|was \./);
  });

  // The one test a pinned clock cannot be asked (PLAN.md M299). `__BUILT_AT__`
  // is stamped by the real clock at build time and this compares it to the
  // clock the app is read on, so under `ASCENT_TODAY` the two are days apart
  // by construction and the failure would say nothing about the code. Every
  // other test in the suite holds on any day.
  it.skipIf(process.env.ASCENT_TODAY)('is a fresh build in a fresh checkout', () => {
    // The stamp is written at build time, so a test run minutes later
    // reads as today. A stamp that did not move would fail this the day
    // after it was written, which is the whole complaint about the version.
    useAppUpdate.setState({ ready: true, apply: () => {} });
    render(<UpdatePrompt live={false} />);
    expect(screen.getByRole('status').textContent).toMatch(/built today/);
  });
});
