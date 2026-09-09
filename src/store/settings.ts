import { create } from 'zustand';
import { getDb } from '@/db';
import { DEFAULT_DISPLAY, type BoulderDisplay, type GradeDisplay, type RouteDisplay } from '@/engine/grades';
import { setCuesEnabled } from '@/lib/cues';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  hydrated: boolean;
  theme: ThemePreference;
  /** How grades are read. Storage stays canonical V/YDS either way. */
  display: GradeDisplay;
  /** Timer beeps, game sounds and haptics. */
  cues: boolean;
  setTheme: (theme: ThemePreference) => void;
  setCues: (value: boolean) => void;
  setBoulderDisplay: (value: BoulderDisplay) => void;
  setRouteDisplay: (value: RouteDisplay) => void;
}

const SETTINGS_KEY = 'settings';

interface PersistedSettings {
  theme: ThemePreference;
  cues: boolean;
  display: GradeDisplay;
}

function persisted(state: SettingsState): PersistedSettings {
  return { theme: state.theme, cues: state.cues, display: state.display };
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  theme: 'system',
  display: DEFAULT_DISPLAY,
  cues: true,
  setTheme: (theme) => {
    set({ theme });
    void saveSettings(persisted(get()));
  },
  setCues: (value) => {
    set({ cues: value });
    setCuesEnabled(value);
    void saveSettings(persisted(get()));
  },
  setBoulderDisplay: (value) => {
    set({ display: { ...get().display, boulder: value } });
    void saveSettings(persisted(get()));
  },
  setRouteDisplay: (value) => {
    set({ display: { ...get().display, route: value } });
    void saveSettings(persisted(get()));
  },
}));

async function saveSettings(value: PersistedSettings): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: SETTINGS_KEY, value });
}

export async function hydrateSettings(): Promise<void> {
  try {
    const db = await getDb();
    const record = await db.get('profile', SETTINGS_KEY);
    const value = (record?.value ?? {}) as Partial<PersistedSettings>;
    const cues = value.cues !== false;
    useSettings.setState({
      hydrated: true,
      cues,
      display: { ...DEFAULT_DISPLAY, ...value.display },
      ...(value.theme === 'light' || value.theme === 'dark' || value.theme === 'system'
        ? { theme: value.theme }
        : {}),
    });
    setCuesEnabled(cues);
  } catch {
    // Storage unavailable (private window, blocked) — run on defaults.
    useSettings.setState({ hydrated: true });
  }
}

/** Reflect the theme preference onto <html data-theme>. 'system' removes
 *  the attribute so the CSS media query decides. */
export function applyTheme(theme: ThemePreference): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}
