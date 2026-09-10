// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { getDb, resetDbForTests } from '@/db/db';
import { hydrateSettings, useSettings } from './settings';

/**
 * Whose setting is it (PLAN.md M60)?
 *
 * Theme, palette, text size and sound belong to the phone in the hand.
 * Grade display and units belong to the climber. They used to share one
 * exportable record, which meant importing anyone's backup changed your
 * theme, your text size and your sound.
 */

const DEVICE_KEY = 'project-ascent:device';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  localStorage.clear();
  useSettings.setState({
    hydrated: false,
    theme: 'system',
    themeId: 'alpine',
    textSize: 'normal',
    cues: true,
  });
});

const stored = () => JSON.parse(localStorage.getItem(DEVICE_KEY) ?? '{}');
async function record(): Promise<Record<string, unknown>> {
  const db = await getDb();
  return ((await db.get('profile', 'settings'))?.value ?? {}) as Record<string, unknown>;
}

describe('a device setting', () => {
  it('is written to the device and not to the backup', async () => {
    await hydrateSettings();
    useSettings.getState().setTheme('dark');
    useSettings.getState().setTextSize('large');
    useSettings.getState().setCues(false);

    expect(stored()).toMatchObject({ theme: 'dark', textSize: 'large', cues: false });
    const saved = await record();
    expect(saved['theme']).toBeUndefined();
    expect(saved['textSize']).toBeUndefined();
    expect(saved['cues']).toBeUndefined();
  });

  it('comes back from the device on the next boot', async () => {
    await hydrateSettings();
    useSettings.getState().setTheme('dark');

    useSettings.setState({ theme: 'system' });
    await hydrateSettings();
    expect(useSettings.getState().theme).toBe('dark');
  });
});

describe('a climber setting', () => {
  it('is written to the backup, where it travels with them', async () => {
    await hydrateSettings();
    useSettings.getState().setUnits('metric');
    useSettings.getState().setBoulderDisplay('Font');
    // The store writes without awaiting; let the transaction land.
    await new Promise((r) => setTimeout(r, 0));

    const saved = await record();
    expect(saved['units']).toBe('metric');
    expect((saved['display'] as { boulder: string }).boulder).toBe('Font');
  });
});

describe('an install from before the split', () => {
  async function seedOldRecord(): Promise<void> {
    const db = await getDb();
    await db.put('profile', {
      key: 'settings',
      value: {
        theme: 'dark',
        themeId: 'ember',
        textSize: 'large',
        cues: false,
        units: 'metric',
        display: { boulder: 'Font', route: 'French' },
      },
    });
  }

  it('keeps the theme it already had', async () => {
    await seedOldRecord();
    await hydrateSettings();
    expect(useSettings.getState().theme).toBe('dark');
    expect(useSettings.getState().themeId).toBe('ember');
    expect(useSettings.getState().textSize).toBe('large');
    expect(useSettings.getState().cues).toBe(false);
    expect(useSettings.getState().units).toBe('metric');
  });

  it('moves them to the device, once', async () => {
    await seedOldRecord();
    await hydrateSettings();
    expect(stored()).toMatchObject({ theme: 'dark', themeId: 'ember', textSize: 'large', cues: false });
  });

  it('stops the record carrying them, so the next backup does not', async () => {
    await seedOldRecord();
    await hydrateSettings();
    const saved = await record();
    expect(saved['theme']).toBeUndefined();
    expect(saved['cues']).toBeUndefined();
    // What is the climber's stays.
    expect(saved['units']).toBe('metric');
    expect(saved['display']).toEqual({ boulder: 'Font', route: 'French' });
  });
});

describe('a backup someone else made', () => {
  // The whole point of the milestone.
  it('cannot change the theme of the device it lands on', async () => {
    // This device has been here: it booted, and chose a theme.
    await hydrateSettings();
    useSettings.getState().setTheme('light');

    // Now a backup arrives carrying somebody's dark theme and large text.
    const db = await getDb();
    await db.put('profile', {
      key: 'settings',
      value: { theme: 'dark', textSize: 'large', cues: false, units: 'metric' },
    });
    await hydrateSettings();

    expect(useSettings.getState().theme).toBe('light');
    expect(useSettings.getState().textSize).toBe('normal');
    expect(useSettings.getState().cues).toBe(true);
    // But their units do arrive, because those are the climber's.
    expect(useSettings.getState().units).toBe('metric');
  });
});

describe('when the device will not remember anything', () => {
  // A private window with an existing database still knows what theme this
  // climber chose — it is in the record. It cannot remember a new choice
  // past the session, but it should not forget the old one either.
  it('still reads the theme out of the database it can reach', async () => {
    const db = await getDb();
    await db.put('profile', {
      key: 'settings',
      value: { theme: 'dark', themeId: 'ember', textSize: 'large', units: 'metric' },
    });
    const realGet = Storage.prototype.getItem;
    const realSet = Storage.prototype.setItem;
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };
    try {
      await hydrateSettings();
      expect(useSettings.getState().theme).toBe('dark');
      expect(useSettings.getState().themeId).toBe('ember');
      expect(useSettings.getState().units).toBe('metric');
    } finally {
      Storage.prototype.getItem = realGet;
      Storage.prototype.setItem = realSet;
    }
  });

  it('runs on defaults rather than failing', async () => {
    const real = Storage.prototype.setItem;
    const realGet = Storage.prototype.getItem;
    Storage.prototype.setItem = () => {
      throw new Error('denied');
    };
    Storage.prototype.getItem = () => {
      throw new Error('denied');
    };
    try {
      await hydrateSettings();
      expect(useSettings.getState().hydrated).toBe(true);
      expect(useSettings.getState().theme).toBe('system');
      useSettings.getState().setTheme('dark');
      expect(useSettings.getState().theme).toBe('dark');
    } finally {
      Storage.prototype.setItem = real;
      Storage.prototype.getItem = realGet;
    }
  });
});
