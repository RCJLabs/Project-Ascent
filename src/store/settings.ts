import { create } from 'zustand';
import { getDb } from '@/db';
import { DEFAULT_DISPLAY, type BoulderDisplay, type GradeDisplay, type RouteDisplay } from '@/engine/grades';
import { setCuesEnabled } from '@/lib/cues';
import { DEFAULT_THEME_ID, applyPalette, getTheme } from '@/ui/themes';
import type { UnitSystem } from '@/engine/units';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Body text size, as a multiplier on the root font size.
 *
 * A setting rather than "just zoom the browser", because a TWA has no
 * browser chrome to zoom from, and because zoom rescales the layout while
 * this rescales only the type — which is what someone who wants bigger text
 * usually means.
 */
export type TextSize = 'small' | 'normal' | 'large' | 'largest';

export const TEXT_SCALE: Record<TextSize, number> = {
  small: 0.92,
  normal: 1,
  large: 1.15,
  largest: 1.3,
};

export interface SettingsState {
  hydrated: boolean;
  theme: ThemePreference;
  /** Which palette. Independent of light/dark, which is the mode. */
  themeId: string;
  textSize: TextSize;
  /** How grades are read. Storage stays canonical V/YDS either way. */
  display: GradeDisplay;
  /**
   * Pounds and inches, or kilograms and centimetres (PLAN.md M48). Storage
   * stays imperial either way, for the same reason grades stay canonical:
   * the stored unit is invisible and migrating every logged benchmark would
   * buy nothing. Edge depth is millimetres in both, because it is
   * millimetres to every climber alive.
   */
  units: UnitSystem;
  /** Timer beeps, game sounds and haptics. */
  cues: boolean;
  setTheme: (theme: ThemePreference) => void;
  setThemeId: (id: string) => void;
  setTextSize: (size: TextSize) => void;
  setCues: (value: boolean) => void;
  setUnits: (value: UnitSystem) => void;
  setBoulderDisplay: (value: BoulderDisplay) => void;
  setRouteDisplay: (value: RouteDisplay) => void;
}

const SETTINGS_KEY = 'settings';
/** Device settings, and the flag that says this device has been here. */
const DEVICE_KEY = 'project-ascent:device';

/**
 * Two kinds of setting, split because they belong to different things
 * (PLAN.md M60).
 *
 * **The climber's** — how they read grades, whether they think in kilograms —
 * travel with them. They live in the `profile` store, which is exportable, so
 * a backup restored on a new phone brings them along.
 *
 * **The device's** — theme, palette, text size, whether the phone makes a
 * noise — belong to the phone in the hand. They used to sit in the same
 * exportable record, which meant importing anyone's backup changed your
 * theme, your text size and your sound. They live in `localStorage` now:
 * per-device by definition, synchronous, and never inside a backup.
 */
interface ClimberSettings {
  display: GradeDisplay;
  units: UnitSystem;
}

interface DeviceSettings {
  theme: ThemePreference;
  themeId: string;
  textSize: TextSize;
  cues: boolean;
}

function climberSettings(state: SettingsState): ClimberSettings {
  return { display: state.display, units: state.units };
}

function deviceSettings(state: SettingsState): DeviceSettings {
  return {
    theme: state.theme,
    themeId: state.themeId,
    textSize: state.textSize,
    cues: state.cues,
  };
}

/**
 * Every read and write guarded: `localStorage` throws outright in some
 * private-browsing modes rather than merely being empty, and a theme
 * preference is not worth a blank screen.
 */
function readDevice(): Partial<DeviceSettings> | null {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw) as unknown;
    return typeof value === 'object' && value !== null ? (value as Partial<DeviceSettings>) : {};
  } catch {
    return null;
  }
}

function writeDevice(value: DeviceSettings): void {
  try {
    localStorage.setItem(DEVICE_KEY, JSON.stringify(value));
  } catch {
    // Nothing to do and nothing worth saying: the app runs on defaults.
  }
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  theme: 'system',
  themeId: DEFAULT_THEME_ID,
  textSize: 'normal',
  display: DEFAULT_DISPLAY,
  // Imperial, matching the V/YDS grade defaults and the content as it is
  // authored, so the app is self-consistent out of the box. One line to
  // flip if the audience says otherwise.
  units: 'imperial',
  cues: true,
  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme, get().themeId);
    writeDevice(deviceSettings(get()));
  },
  setThemeId: (id) => {
    set({ themeId: id });
    applyTheme(get().theme, id);
    writeDevice(deviceSettings(get()));
  },
  setTextSize: (size) => {
    set({ textSize: size });
    applyTextSize(size);
    writeDevice(deviceSettings(get()));
  },
  setCues: (value) => {
    set({ cues: value });
    setCuesEnabled(value);
    writeDevice(deviceSettings(get()));
  },
  setUnits: (value) => {
    set({ units: value });
    void saveClimber(climberSettings(get()));
  },
  setBoulderDisplay: (value) => {
    set({ display: { ...get().display, boulder: value } });
    void saveClimber(climberSettings(get()));
  },
  setRouteDisplay: (value) => {
    set({ display: { ...get().display, route: value } });
    void saveClimber(climberSettings(get()));
  },
}));

async function saveClimber(value: ClimberSettings): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: SETTINGS_KEY, value });
}

export async function hydrateSettings(): Promise<void> {
  const stored = readDevice();
  try {
    const db = await getDb();
    const record = await db.get('profile', SETTINGS_KEY);
    const value = (record?.value ?? {}) as Partial<ClimberSettings & DeviceSettings>;

    // An install from before the split keeps its theme: the first hydrate on
    // a device reads the device fields out of the record it already has and
    // moves them. `stored === null` means this device has not been here
    // before — and at boot that is the only moment it can be true, so an
    // imported backup can never be the thing that gets migrated.
    const device: Partial<DeviceSettings> = stored ?? value;
    const cues = device.cues !== false;
    const next: DeviceSettings = {
      cues,
      themeId: typeof device.themeId === 'string' ? device.themeId : DEFAULT_THEME_ID,
      textSize:
        typeof device.textSize === 'string' && device.textSize in TEXT_SCALE
          ? (device.textSize as TextSize)
          : 'normal',
      theme:
        device.theme === 'light' || device.theme === 'dark' || device.theme === 'system'
          ? device.theme
          : 'system',
    };

    useSettings.setState({
      hydrated: true,
      ...next,
      display: { ...DEFAULT_DISPLAY, ...value.display },
      units: value.units === 'metric' ? 'metric' : 'imperial',
    });
    setCuesEnabled(cues);

    if (stored === null) {
      writeDevice(next);
      // And the record stops carrying them, so the next backup does not.
      if (record !== undefined) {
        await db.put('profile', {
          key: SETTINGS_KEY,
          value: { display: value.display ?? DEFAULT_DISPLAY, units: value.units ?? 'imperial' },
        });
      }
    }
  } catch {
    // Storage unavailable (private window, blocked) — run on defaults, but
    // honour anything the device did manage to remember.
    useSettings.setState({ hydrated: true, ...(stored ?? {}) });
  }
}

/**
 * Put the chosen theme on the page.
 *
 * `data-theme` still decides light versus dark, and removing it hands that
 * back to the CSS media query — so `system` keeps working with no script.
 * The palette is then painted as custom properties on top, which is why a
 * non-default theme is one style recalculation rather than a stylesheet
 * swap and a flash.
 *
 * Alpine is the exception: it is what index.css already contains, so
 * choosing it clears the inline properties instead of restating them, and
 * the first frame after a reload is correct with no JavaScript at all.
 */
export function applyTheme(theme: ThemePreference, themeId: string = DEFAULT_THEME_ID): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;

  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  // The OS asking for more contrast is a real request, and there is a theme
  // built for it. Only honoured while the climber is on the default — an
  // explicit choice outranks a system preference.
  const wantsContrast =
    themeId === DEFAULT_THEME_ID && window.matchMedia('(prefers-contrast: more)').matches;
  if (wantsContrast) {
    const slate = getTheme('slate');
    applyPalette(root, dark ? slate.dark : slate.light, dark ? 'dark' : 'light');
    return;
  }

  if (themeId === DEFAULT_THEME_ID) {
    for (const property of [...root.style]) {
      if (property.startsWith('--c-') || property.startsWith('--viz-')) {
        root.style.removeProperty(property);
      }
    }
    return;
  }
  const chosen = getTheme(themeId);
  applyPalette(root, dark ? chosen.dark : chosen.light, dark ? 'dark' : 'light');
}

/**
 * Scale the type, and the rem-based spacing around it.
 *
 * Applied to the root because that is the only thing that works: every size
 * in this app is a Tailwind utility in `rem`, so setting it on `body` would
 * leave `text-sm` and `text-xs` untouched.
 */
export function applyTextSize(size: TextSize): void {
  document.documentElement.style.setProperty('--text-scale', String(TEXT_SCALE[size]));
}
