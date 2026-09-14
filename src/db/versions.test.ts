import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { APP_VERSION } from '@/version';
import { getDb, resetDbForTests } from './db';

/**
 * The version, and the write that only looked like it recorded one
 * (PLAN.md M159).
 *
 * M154 wrote that *"a stale install's stored version is indistinguishable
 * from a current one"* and blamed the hardcoded constant. The constant was
 * half of it; the other half is that `meta.appVersion` is written on **every
 * open**, so it equals the running version by construction and would have
 * gone on doing so however the constant was derived.
 */

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
});

describe('the version the app reports', () => {
  it('is a real version, not the absent-source placeholder', () => {
    // `version.ts` falls back to 'unknown' when the build-time define is
    // missing. Vitest shares the vite config, so a passing build defines it
    // here too — and a run that saw 'unknown' would mean the define is gone.
    expect(APP_VERSION).not.toBe('unknown');
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('matches package.json, which is the one place that names it', async () => {
    const pkg = JSON.parse(
      await import('node:fs').then((fs) => fs.readFileSync('package.json', 'utf8')),
    ) as { version: string };
    expect(APP_VERSION).toBe(pkg.version);
  });
});

describe('what the database records about versions', () => {
  it('stamps the version that created it, once', async () => {
    const db = await getDb();
    expect((await db.get('meta', 'createdWith'))?.value).toBe(APP_VERSION);
  });

  it('leaves createdWith alone on a later open, which is the whole point', async () => {
    const first = await getDb();
    await first.put('meta', { key: 'createdWith', value: '0.0.1-older' });
    resetDbForTests();

    const second = await getDb();
    // `appVersion` is overwritten — it is what opened it last.
    expect((await second.get('meta', 'appVersion'))?.value).toBe(APP_VERSION);
    // `createdWith` is not. This is the only one of the two that can ever
    // differ from the running version, and a reopen must not erase it.
    expect((await second.get('meta', 'createdWith'))?.value).toBe('0.0.1-older');
  });

  it('reports both to the page that describes the database', async () => {
    const db = await getDb();
    await db.put('meta', { key: 'createdWith', value: '0.0.1-older' });
    const { readDbHealth } = await import('./health');
    const health = await readDbHealth();
    expect(health.versions).toEqual({ createdWith: '0.0.1-older', running: APP_VERSION });
  });

  it('says so rather than guessing for a database made before this was recorded', async () => {
    const db = await getDb();
    await db.delete('meta', 'createdWith');
    const { readDbHealth } = await import('./health');
    expect((await readDbHealth()).versions.createdWith).toBeNull();
  });
});
