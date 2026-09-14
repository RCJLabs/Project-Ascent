// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, screen, waitFor } from '@testing-library/react';

/**
 * A write the climber asked for, on a database that will not take it
 * (PLAN.md M158).
 *
 * The reads on this page answer with an empty report now, because a count
 * nobody asked for is not worth an error. Tidy-up is the other case: a
 * button was pressed, something was meant to happen, and `try/finally` with
 * no `catch` left the rejection to nobody — the spinner stopped and the page
 * said nothing at all.
 */

vi.mock('@/db/media', async () => {
  const actual = await vi.importActual<typeof import('@/db/media')>('@/db/media');
  return {
    ...actual,
    sweepOrphanMedia: () => {
      const error = new DOMException('the device is full', 'QuotaExceededError');
      return Promise.reject(error);
    },
  };
});

const { resetDbForTests } = await import('@/db/db');
const { hydrate, renderAt, reset } = await import('@/test/render');
const { DataPage } = await import('./DataPage');

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await hydrate();
});

describe('the tidy-up that could not run', () => {
  it('says so, where the climber pressed the button', async () => {
    renderAt('/data', <DataPage />);
    const button = await screen.findByRole('button', { name: /tidy/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/could not be tidied up/i)).toBeTruthy();
    });
    // And the page is usable again rather than stuck on the spinner.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /tidy/i }).hasAttribute('disabled')).toBe(false);
    });
  });
});
