// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { getTheme } from '@/ui/palettes';
import { ALPINE, CONTRAST, DEFAULT_THEME_ID } from '@/ui/themes';

/**
 * The device's choices on the first frame, and only one palette in the first
 * load (PLAN.md M363).
 *
 * Measured before: a climber on Midnight in dark mode, or on the largest
 * text, saw three to five frames of Home in Alpine at the normal size on
 * every launch, because the store started on the defaults and learned the
 * device's choices only once the database had opened. And the first load
 * carried all ten palettes for a climber who paints one.
 */

const DEVICE = 'project-ascent:device';
const SNAPSHOT = 'project-ascent:palette';
const root = () => document.documentElement;
const painted = (name: string) => root().style.getPropertyValue(`--c-${name}`);

/** The settings store as it is created on a device that already chose. */
async function freshStore(device: Record<string, unknown> | string | null) {
  vi.resetModules();
  if (device === null) localStorage.removeItem(DEVICE);
  else localStorage.setItem(DEVICE, typeof device === 'string' ? device : JSON.stringify(device));
  return import('./settings');
}

beforeEach(() => {
  localStorage.clear();
  root().removeAttribute('style');
  delete root().dataset.theme;
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the store, before anything has run', () => {
  it('starts from what this device chose, not from the defaults', async () => {
    const { useSettings } = await freshStore({ theme: 'dark', themeId: 'midnight', textSize: 'largest', logView: 'full' });
    const state = useSettings.getState();
    expect(state.theme).toBe('dark');
    expect(state.themeId).toBe('midnight');
    expect(state.textSize).toBe('largest');
    expect(state.logView).toBe('full');
    expect(state.hydrated).toBe(false);
  });

  it('starts on the defaults on a device that chose nothing, or kept nonsense', async () => {
    for (const device of [null, 'not json', { theme: 'purple', textSize: 'huge', themeId: 7 }]) {
      const { useSettings } = await freshStore(device);
      const state = useSettings.getState();
      expect([state.theme, state.themeId, state.textSize], JSON.stringify(device)).toEqual(['system', DEFAULT_THEME_ID, 'normal']);
    }
  });
});

describe('painting before the first render', () => {
  it('puts the mode and the text size on the page at once', async () => {
    const { paintDeviceSettings } = await freshStore({ theme: 'dark', themeId: DEFAULT_THEME_ID, textSize: 'largest' });
    paintDeviceSettings();
    expect(root().dataset.theme).toBe('dark');
    expect(root().style.getPropertyValue('--text-scale')).toBe('1.3');
  });

  it('is what main.tsx does before it renders', () => {
    const main = readFileSync('src/main.tsx', 'utf8');
    expect(main.indexOf('paintDeviceSettings();')).toBeGreaterThan(-1);
    expect(main.indexOf('paintDeviceSettings();')).toBeLessThan(main.indexOf('createRoot('));
  });
});

describe('a palette the first load does not carry', () => {
  const midnight = getTheme('midnight');

  it('is painted from its snapshot at once, then from itself when it arrives', async () => {
    const { applyTheme } = await freshStore({ themeId: 'midnight' });
    // A snapshot that differs from the real palette, so which one is on the
    // page says which one painted it.
    localStorage.setItem(SNAPSHOT, JSON.stringify({ id: 'midnight', light: { ...midnight.light, accent: '#123456' }, dark: midnight.dark }));
    applyTheme('light', 'midnight');
    expect(painted('accent')).toBe('#123456');
    await vi.waitFor(() => expect(painted('accent')).toBe(midnight.light.accent));
    // And the snapshot now says what the palette does.
    expect(JSON.parse(localStorage.getItem(SNAPSHOT)!).light.accent).toBe(midnight.light.accent);
  });

  it('keeps a snapshot of the palette it applied, for the next launch', async () => {
    const { applyTheme } = await freshStore({ themeId: 'ice' });
    applyTheme('dark', 'ice');
    await vi.waitFor(() => expect(localStorage.getItem(SNAPSHOT)).not.toBeNull());
    const kept = JSON.parse(localStorage.getItem(SNAPSHOT)!);
    expect(kept.id).toBe('ice');
    expect(kept.dark).toEqual(getTheme('ice').dark);
  });

  it('is not painted from a snapshot of another palette', async () => {
    const { applyTheme } = await freshStore({ themeId: 'midnight' });
    localStorage.setItem(SNAPSHOT, JSON.stringify({ id: 'ice', light: getTheme('ice').light, dark: getTheme('ice').dark }));
    applyTheme('light', 'midnight');
    expect(painted('accent')).toBe('');
    await vi.waitFor(() => expect(painted('accent')).toBe(midnight.light.accent));
  });

  it('cannot undo a choice made after it was asked for', async () => {
    const { applyTheme } = await freshStore({ themeId: 'midnight' });
    applyTheme('light', 'midnight');
    applyTheme('light', DEFAULT_THEME_ID);
    // Long enough for the palette module to have arrived for the first call.
    await import('@/ui/palettes');
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(painted('accent')).toBe('');
  });
});

describe('the two the first load does carry', () => {
  it('paints High Contrast at once, chosen or asked for by the system', async () => {
    const { applyTheme } = await freshStore(null);
    applyTheme('light', CONTRAST.id);
    expect(painted('accent')).toBe(CONTRAST.light.accent);
  });

  it('leaves Alpine to index.css', async () => {
    const { applyTheme } = await freshStore(null);
    applyTheme('light', ALPINE.id);
    expect(painted('accent')).toBe('');
  });

  it('are the only two in themes.ts', () => {
    const source = readFileSync('src/ui/themes.ts', 'utf8');
    expect(source.match(/: Theme = \{/g)?.length).toBe(2);
    expect(source).not.toContain("from './palettes'");
    // And the store reaches the other eight only by loading them.
    const store = readFileSync('src/store/settings.ts', 'utf8');
    expect(store).toContain("import('@/ui/palettes')");
    expect(store).not.toMatch(/from '@\/ui\/palettes'/);
  });
});
