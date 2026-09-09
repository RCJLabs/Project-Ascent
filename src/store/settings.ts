import { create } from 'zustand';
import { getDb } from '@/db';

export type ThemePreference = 'system' | 'light' | 'dark';

export interface SettingsState {
  hydrated: boolean;
  theme: ThemePreference;
  boulderScale: 'V'; // Font display conversion is a later feature
  routeScale: 'YDS'; // French display conversion is a later feature
  setTheme: (theme: ThemePreference) => void;
}

const SETTINGS_KEY = 'settings';

interface PersistedSettings {
  theme: ThemePreference;
}

function persisted(state: SettingsState): PersistedSettings {
  return { theme: state.theme };
}

export const useSettings = create<SettingsState>((set, get) => ({
  hydrated: false,
  theme: 'system',
  boulderScale: 'V',
  routeScale: 'YDS',
  setTheme: (theme) => {
    set({ theme });
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
    useSettings.setState({
      hydrated: true,
      ...(value.theme === 'light' || value.theme === 'dark' || value.theme === 'system'
        ? { theme: value.theme }
        : {}),
    });
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
