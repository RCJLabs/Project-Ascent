import { create } from 'zustand';
import { registerCustomPrograms } from '@/content/programs';
import type { Program, ProgramId } from '@/content/types';
import { deleteCustomProgram, listCustomPrograms, putCustomProgram } from '@/db/customPrograms';

/**
 * Programs the climber wrote.
 *
 * Two things are kept in step on every change: this store, which components
 * subscribe to, and the content registry, which `getProgram` reads. The
 * registry is what lets a written program work in the pure engines and in
 * the thirteen call sites that already existed; the store is what makes
 * React notice.
 */
export interface ProgramsState {
  hydrated: boolean;
  custom: Program[];
  load: () => Promise<void>;
  save: (program: Program) => Promise<void>;
  remove: (id: ProgramId) => Promise<void>;
}

function sync(custom: Program[]): Program[] {
  registerCustomPrograms(custom);
  return custom;
}

export const useCustomPrograms = create<ProgramsState>((set, get) => ({
  hydrated: false,
  custom: [],

  load: async () => {
    try {
      set({ custom: sync(await listCustomPrograms()), hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  save: async (program) => {
    await putCustomProgram(program);
    const rest = get().custom.filter((p) => p.id !== program.id);
    const next = [...rest, program].sort((a, b) => a.name.localeCompare(b.name));
    set({ custom: sync(next) });
  },

  remove: async (id) => {
    await deleteCustomProgram(id);
    set({ custom: sync(get().custom.filter((p) => p.id !== id)) });
  },
}));
