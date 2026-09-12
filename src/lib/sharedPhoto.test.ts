import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHARE_ACTION, SHARE_CACHE, SHARE_KEY, takeSharedPhoto } from './sharedPhoto';

/**
 * Picking up a shared photo (PLAN.md M111b).
 *
 * The worker half lives in `public/share-target.js`, which is plain
 * JavaScript outside the TypeScript build and cannot be imported. So the
 * checks here come in two kinds: the take itself, exercised against a stub
 * Cache API, and the constants, read out of both files and compared — a
 * rename on one side and not the other would break sharing silently, and
 * the only symptom would be a photo that never arrives.
 */

const WORKER = readFileSync('public/share-target.js', 'utf8');

interface Stub {
  entries: Map<string, Response>;
  opened: string[];
}

let stub: Stub;

function installCaches(overrides: Partial<Cache> = {}): void {
  stub = { entries: new Map(), opened: [] };
  const cache = {
    match: async (key: string) => stub.entries.get(key),
    put: async (key: string, response: Response) => void stub.entries.set(key, response),
    delete: async (key: string) => stub.entries.delete(key),
    ...overrides,
  };
  vi.stubGlobal('caches', {
    open: async (name: string) => {
      stub.opened.push(name);
      return cache;
    },
  });
}

const shared = (body: BodyInit, headers: Record<string, string> = {}) =>
  new Response(body, { headers: { 'content-type': 'image/png', ...headers } });

beforeEach(() => installCaches());
afterEach(() => vi.unstubAllGlobals());

describe('taking the photo', () => {
  it('returns nothing when none was shared', async () => {
    expect(await takeSharedPhoto()).toBeNull();
  });

  it('returns the file the worker left', async () => {
    stub.entries.set(SHARE_KEY, shared('bytes'));
    const file = await takeSharedPhoto();
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe('image/png');
    expect(await file?.text()).toBe('bytes');
  });

  it('takes it rather than reading it', async () => {
    // The rule `launchFile` follows. A refresh of the attach page must not
    // re-offer a photo that has already been filed, and React mounting an
    // effect twice must not produce two of them.
    stub.entries.set(SHARE_KEY, shared('bytes'));
    expect(await takeSharedPhoto()).not.toBeNull();
    expect(await takeSharedPhoto()).toBeNull();
  });

  it('deletes before it reads, not after', async () => {
    // A body that throws half-way would otherwise leave the entry behind to
    // fail again on every future visit — a share that poisons the page.
    stub.entries.set(SHARE_KEY, {
      headers: new Headers({ 'content-type': 'image/png' }),
      blob: () => Promise.reject(new Error('truncated')),
    } as unknown as Response);
    expect(await takeSharedPhoto()).toBeNull();
    expect(stub.entries.has(SHARE_KEY), 'the unreadable entry is still there').toBe(false);
  });

  it('opens the cache the worker writes to', async () => {
    await takeSharedPhoto();
    expect(stub.opened).toEqual([SHARE_CACHE]);
  });

  it('ignores an empty body', async () => {
    stub.entries.set(SHARE_KEY, shared(''));
    expect(await takeSharedPhoto()).toBeNull();
  });

  it('answers null rather than throwing when the cache refuses', async () => {
    // A private window can refuse `caches.open` outright. Nothing the
    // climber can act on, and the page reads the same either way: no photo
    // waiting, pick one.
    vi.stubGlobal('caches', {
      open: () => Promise.reject(new Error('denied')),
    });
    expect(await takeSharedPhoto()).toBeNull();
  });

  it('answers null where there is no Cache API at all', async () => {
    vi.stubGlobal('caches', undefined);
    expect(await takeSharedPhoto()).toBeNull();
  });
});

describe('the filename', () => {
  const named = async (header: string | null) => {
    stub.entries.set(
      SHARE_KEY,
      shared('bytes', header === null ? {} : { 'x-shared-name': header }),
    );
    return (await takeSharedPhoto())?.name;
  };

  it('comes back decoded', async () => {
    expect(await named(encodeURIComponent('The Nose, day 2.jpg'))).toBe('The Nose, day 2.jpg');
  });

  it('survives a name that will not decode', async () => {
    // `decodeURIComponent('%')` throws. Not worth failing a share over.
    expect(await named('%')).toBe('shared-photo');
  });

  it('falls back when the worker sent none', async () => {
    expect(await named(null)).toBe('shared-photo');
  });

  it('falls back on a name that is only spaces', async () => {
    expect(await named(encodeURIComponent('   '))).toBe('shared-photo');
  });
});

describe('the two halves agree', () => {
  /** The worker is plain JS in `public/`, so this is the only way to check. */
  const workerConst = (name: string): string | undefined =>
    new RegExp(`const ${name} = '([^']*)'`).exec(WORKER)?.[1];

  it('uses the same cache name', () => {
    expect(workerConst('SHARE_CACHE')).toBe(SHARE_CACHE);
  });

  it('uses the same key', () => {
    expect(workerConst('SHARE_KEY')).toBe(SHARE_KEY);
  });

  it('uses the same action path', () => {
    expect(workerConst('SHARE_ACTION')).toBe(SHARE_ACTION);
  });

  it('reads the worker at all', () => {
    // Without this the three checks above pass on `undefined === undefined`
    // the moment the worker is reformatted out of the regex's reach.
    expect(workerConst('SHARE_CACHE')).toBeDefined();
    expect(WORKER).toContain("addEventListener('fetch'");
  });

  it('sends the filename encoded', () => {
    // The decode above is only safe because of this.
    expect(WORKER).toContain('encodeURIComponent(file.name');
  });

  it('reads the form field the manifest declares', () => {
    const manifest = readFileSync('vite.config.ts', 'utf8');
    const field = /files: \[\{ name: '([^']+)'/.exec(manifest)?.[1];
    expect(field, 'no share_target file field in vite.config.ts').toBeDefined();
    expect(WORKER).toContain(`form.get('${field}')`);
  });

  it('points the manifest at the path the worker listens on', () => {
    const manifest = readFileSync('vite.config.ts', 'utf8');
    expect(manifest).toContain('action: `${BASE}share-target`');
    expect(SHARE_ACTION).toBe('/share-target');
  });
});

describe('the worker leaves workbox alone', () => {
  it('is imported rather than replacing the generated worker', () => {
    // M19's offline contract is workbox's generated code — precache the
    // shell, prompt rather than autoUpdate, never hand over mid-session.
    // `injectManifest` would move all of that into a file maintained by
    // hand for the sake of one fetch listener.
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("importScripts: ['/share-target.js']");
    expect(config).toContain("registerType: 'prompt'");
    // The configuration, not the prose: the comment beside it explains why
    // `injectManifest` was refused, and a plain `not.toContain` on the word
    // fails on that explanation. `strategies` is how the plugin is told.
    expect(config).not.toMatch(/strategies:\s*'injectManifest'/);
  });

  it('is denied the navigation fallback', () => {
    // `navigateFallback` answers every navigation with the shell, and a
    // share is a navigation.
    expect(readFileSync('vite.config.ts', 'utf8')).toContain('/^\\/share-target$/');
  });

  it('handles nothing but its own POST', () => {
    // The listener runs before workbox's on every request in the app. Two
    // early returns are what keep it from being in the way of any of them.
    expect(WORKER).toContain("if (request.method !== 'POST') return;");
    expect(WORKER).toContain('if (new URL(request.url).pathname !== SHARE_ACTION) return;');
  });
});
