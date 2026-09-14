import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFERRED_NOTE } from '@/engine/offline';

/**
 * M19's "done when", made executable.
 *
 * The rules themselves are tested in `engine/offline.test.ts`. What is left
 * is the wiring, which is where this milestone's bug was: the app shipped
 * `registerSW({ immediate: true })`, so a deploy swapped the running app for
 * a new one with no prompt and no regard for what the climber was doing.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

describe('the app asks before it updates', () => {
  const CONFIG = read('vite.config.ts');
  const MAIN = read('src/main.tsx');

  it('does not let the service worker take over on its own', () => {
    expect(CONFIG).toContain("registerType: 'prompt'");
    expect(CONFIG).not.toContain("registerType: 'autoUpdate'");
  });

  it('never registers with immediate', () => {
    // `immediate: true` is the exact call that caused this: it reloads the
    // page the moment a new version is precached.
    expect(MAIN).not.toMatch(/immediate:\s*true/);
  });

  it('still downloads the update eagerly', () => {
    // Holding the *prompt* is the point, not holding the download — the
    // climber may well be somewhere with no signal by the time they say yes.
    expect(MAIN).toContain('onNeedRefresh');
  });

  it('keeps the pwa import out of everything but main', () => {
    // `virtual:pwa-register` does not resolve outside a Vite build, so a
    // store importing it takes every test that touches that store with it.
    const offenders = walk('src')
      .filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts') && p !== 'src/main.tsx')
      .filter((p) => /from 'virtual:pwa-register'/.test(read(p)));
    expect(offenders).toEqual([]);
  });
});

describe('an update never interrupts a session', () => {
  const SHELL = read('src/ui/AppShell.tsx');
  const PROMPT = read('src/ui/UpdatePrompt.tsx');

  it('tells the prompt whether a session is running', () => {
    expect(SHELL).toContain('<UpdatePrompt live={live} />');
    expect(SHELL).toMatch(/const live = banner\?\.kind === 'running'/);
  });

  it('asks the engine rather than deciding for itself', () => {
    // Duplicating the rule in the component is how the rule and its tests
    // drift apart.
    expect(PROMPT).toContain('updateVisible(');
  });

  it('offers a way out that is not "not now, forever"', () => {
    expect(PROMPT).toContain('DEFERRED_NOTE');
  });

  /**
   * The note used to say *"the next time you open the app"* — which is what
   * a climber does to an installed app daily without ever closing it, and
   * the waiting worker takes over on the closing (PLAN.md M154).
   */
  it('says what actually applies a held update', () => {
    expect(DEFERRED_NOTE).toMatch(/close/i);
    expect(DEFERRED_NOTE).not.toMatch(/next time you open/i);
  });
});

/**
 * The app asking whether there is one at all (PLAN.md M154).
 *
 * The rule is tested in `engine/offline.test.ts` and the loop in
 * `lib/swUpdate.test.ts`. What is left is the wiring, which is where this
 * milestone's bug was: `registerSW` took two callbacks and no
 * `onRegisteredSW`, so nothing in the app ever called `update()` and an
 * installed PWA — resumed rather than launched, hash-routed so it never
 * navigates — could run for a week on a replaced version.
 */
describe('the app asks whether there is an update', () => {
  const MAIN = read('src/main.tsx');

  it('takes the registration and watches it', () => {
    expect(MAIN).toContain('onRegisteredSW');
    expect(MAIN).toContain('watchForUpdates(registration)');
  });

  it('keeps the asking out of the registration callback', () => {
    // The loop has a clock and a visibility rule, both of which need to be
    // injectable; inline in `main.tsx` neither could be tested at all.
    expect(MAIN).toContain("from './lib/swUpdate'");
  });
});

describe('bytes are formatted in one place', () => {
  it('has exactly one implementation', () => {
    // There were three, and two of them stopped at megabytes — so a browser
    // offering a 60GB quota reported "61440.0 MB" in Settings.
    const implementations = walk('src')
      .filter((p) => /\.tsx?$/.test(p) && !p.endsWith('.test.ts'))
      .filter((p) => /function formatBytes\b/.test(read(p)));
    expect(implementations).toEqual(['src/engine/offline.ts']);
  });
});

describe('being offline is not an error', () => {
  it('shows no running offline indicator', () => {
    // Nothing in this app needs a network. A persistent "you are offline"
    // banner would report a problem that does not exist, and teach the
    // climber to ignore the place real warnings appear.
    const offenders = walk('src')
      .filter((p) => /\.tsx$/.test(p))
      .filter((p) => /navigator\.onLine|'offline'\s*,|addEventListener\('offline'/.test(read(p)));
    expect(offenders).toEqual([]);
  });

  it('confirms the opposite once it is true', () => {
    expect(read('src/features/settings/SettingsPage.tsx')).toContain('offlineReady');
  });

  it('does not decide it from a one-shot event', () => {
    // `onOfflineReady` fires on the first install and never again, so a build
    // that relied on it alone reported "caching the app" forever after the
    // first launch. `serviceWorker.ready` is the durable answer.
    expect(read('src/main.tsx')).toContain('navigator.serviceWorker.ready');
  });
});
