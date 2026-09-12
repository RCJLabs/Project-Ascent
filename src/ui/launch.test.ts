import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OPENS_AT } from '@/engine/openWith';

/**
 * M111's wiring, made executable.
 *
 * A manifest is a file of strings nothing validates. A shortcut pointing at
 * a route that does not exist still installs, still appears in the launcher,
 * and quietly opens the home screen — which is how the fourth proposed
 * shortcut (a timer) was found to have no route at all: the timer is a sheet
 * inside the logger and needs a session to time.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const CONFIG = read('vite.config.ts');
const APP = read('src/App.tsx');

/** Every `<Route path>` the router actually defines. */
const ROUTES = [...APP.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1] as string);
/** Every shortcut URL in the manifest. The lookbehind is what keeps
 *  `start_url` — which is a bare path by design — out of the list. */
const SHORTCUTS = [...CONFIG.matchAll(/(?<!\w)url: '([^']+)'/g)].map((m) => m[1] as string);

const BASE = '/Project-Ascent/';

describe('the shortcuts a long-press offers', () => {
  it('offers some', () => {
    expect(SHORTCUTS.length).toBeGreaterThan(0);
  });

  it('gives every one of them somewhere to go', () => {
    // A shortcut entry without a `url` is not an error anywhere — it simply
    // does not appear in the launcher, which looks identical to the phone
    // not supporting shortcuts at all. Entry fields sit one level deeper
    // than the manifest's own.
    const entries = [...CONFIG.matchAll(/^ {12}name: /gm)].length;
    expect(SHORTCUTS.length).toBe(entries);
  });

  it('points every one at a route the app defines', () => {
    // The check that mattered: a shortcut is a string, and a wrong one fails
    // by loading the app and landing on Home.
    const paths = SHORTCUTS.map((url) => url.replace(`${BASE}#`, ''));
    expect(paths.filter((path) => !ROUTES.includes(path))).toEqual([]);
  });

  it('asks for no route that needs a parameter', () => {
    // `/log/:date` is a real route and a useless shortcut — there is no date
    // in a launcher entry. `/today` is the one that resolves one itself.
    expect(SHORTCUTS.filter((url) => url.includes(':'))).toEqual([]);
  });

  it('keeps every one inside the app’s own scope', () => {
    expect(SHORTCUTS.filter((url) => !url.startsWith(BASE))).toEqual([]);
  });

  it('routes every one through the hash', () => {
    // This app is served from GitHub Pages with a hash router. A shortcut
    // written as a real path is a 404 on a cold start and Home on a warm one.
    expect(SHORTCUTS.filter((url) => !url.startsWith(`${BASE}#/`))).toEqual([]);
  });

  it('names an icon file that the build actually ships', () => {
    const icons = [...CONFIG.matchAll(/src: '(icons\/[^']+)'/g)].map((m) => m[1] as string);
    expect(icons.length).toBeGreaterThan(0);
    expect(icons.filter((src) => !existsSync(`public/${src}`))).toEqual([]);
  });
});

describe('a file tapped in a file manager', () => {
  it('claims both of the extensions this app writes', () => {
    // `.json` for a shared program and a plain backup, `.zip` for an archive
    // backup. Claiming one and not the other means half the app's own output
    // cannot be opened by the app.
    expect(CONFIG).toContain("'application/json': ['.json']");
    expect(CONFIG).toContain("'application/zip': ['.zip']");
  });

  it('opens at a URL inside the app’s scope', () => {
    // The manifest spec requires a file handler's action to be within scope;
    // one outside it is dropped, and the handler never registers.
    const action = /action: '([^']+)'/.exec(CONFIG)?.[1];
    expect(action).toBeDefined();
    expect(action?.startsWith(BASE)).toBe(true);
  });

  it('brings the running app forward rather than starting a second copy', () => {
    // Two windows over one IndexedDB is two caches of the same records
    // disagreeing about which is current.
    expect(CONFIG).toContain("client_mode: 'focus-existing'");
  });

  it('decides where it goes by reading it, not by its extension', () => {
    // Both of the app's JSON files are `.json`, so the extension answers
    // nothing. This is the line that stops a shared program landing in the
    // screen that offers to replace the whole database.
    expect(APP).toContain('receiveLaunch(');
    expect(read('src/lib/launchFile.ts')).toContain('kindOfFile(');
  });

  it('actually goes where the file belongs', () => {
    // A text guard, and known to be the weak kind: it proves the call is
    // written, not that it runs. The behaviour itself was checked in a
    // browser with `launchQueue` stubbed — see PLAN.md M111 — because
    // rendering the whole `App` under jsdom hangs.
    expect(APP).toContain('navigate(target)');
  });

  it('sends each kind to a screen that exists', () => {
    expect(Object.values(OPENS_AT).filter((path) => !ROUTES.includes(path))).toEqual([]);
  });

  it('keeps the sniffer off the boot path', () => {
    // `lib/launchFile.ts` imports the sniffer; `App` needs the launched flag
    // synchronously for the onboarding redirect. Import the one to get the
    // other and the whole file-handling path is in the entry chunk of every
    // cold start, for a launch that almost never happens (0.16KB, measured
    // in `perf.test.ts`). A static import here is how that comes back.
    expect(APP).not.toMatch(/^import .*from '@\/lib\/launchFile'/m);
    expect(APP).toContain("await import('@/lib/launchFile')");
  });

  it('has exactly one screen waiting for each kind', () => {
    // Two claimants race for the same one-shot file and one of them loses
    // silently. The count is the invariant, not the identity of the files.
    const takers = ['src/features/builder/BuilderList.tsx', 'src/features/settings/SettingsPage.tsx'];
    expect(takers.filter((path) => read(path).includes('takeLaunchFile('))).toEqual(takers);
    expect(takers.length).toBe(Object.keys(OPENS_AT).length);
  });
});
