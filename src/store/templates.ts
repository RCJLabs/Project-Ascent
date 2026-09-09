import { create } from 'zustand';
import { getDb } from '@/db';
import type { Session } from '@/db/sessions';
import {
  MAX_TEMPLATES,
  cleanName,
  createTemplate,
  markUsed,
  rankTemplates,
  suggestName,
  type Template,
} from '@/engine/templates';

/**
 * Saved session shapes, kept under one key in the `profile` store — the same
 * pattern as the active plan and the dismissed suggestions. The `programs`
 * store stays empty for the custom program builder it was created for.
 */
export interface TemplatesState {
  hydrated: boolean;
  templates: Template[];
  load: () => Promise<void>;
  save: (session: Session, name?: string, sessionTypeName?: string) => Promise<Template>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  use: (id: string) => Promise<void>;
}

const KEY = 'templates';

async function persist(templates: Template[]): Promise<void> {
  const db = await getDb();
  await db.put('profile', { key: KEY, value: templates });
}

export const useTemplates = create<TemplatesState>((set, get) => ({
  hydrated: false,
  templates: [],

  load: async () => {
    try {
      const db = await getDb();
      const record = await db.get('profile', KEY);
      const value = record?.value;
      set({ templates: Array.isArray(value) ? (value as Template[]) : [], hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  save: async (session, name, sessionTypeName) => {
    const template = createTemplate(session, cleanName(name ?? '', suggestName(session, sessionTypeName)));
    // Oldest unused first: a cap that dropped the one you rely on would be
    // worse than no cap.
    const kept = rankTemplates(get().templates).slice(0, MAX_TEMPLATES - 1);
    const next = [template, ...kept];
    await persist(next);
    set({ templates: next });
    return template;
  },

  rename: async (id, name) => {
    const next = get().templates.map((t) =>
      t.id === id ? { ...t, name: cleanName(name, t.name), updatedAt: new Date().toISOString() } : t,
    );
    await persist(next);
    set({ templates: next });
  },

  remove: async (id) => {
    const next = get().templates.filter((t) => t.id !== id);
    await persist(next);
    set({ templates: next });
  },

  use: async (id) => {
    const next = get().templates.map((t) => (t.id === id ? markUsed(t) : t));
    await persist(next);
    set({ templates: next });
  },
}));
