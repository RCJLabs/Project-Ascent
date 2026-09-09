/**
 * Written programs, in the `programs` store that has been waiting for them
 * since M0. A record is the whole `Program` — the same shape the shipped
 * ones have, because everything downstream reads them the same way.
 */

import type { Program, ProgramId } from '@/content/types';
import { getDb } from './db';

export async function listCustomPrograms(): Promise<Program[]> {
  const db = await getDb();
  const rows = (await db.getAll('programs')) as unknown as Program[];
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export async function putCustomProgram(program: Program): Promise<Program> {
  const db = await getDb();
  await db.put('programs', program as never);
  return program;
}

export async function deleteCustomProgram(id: ProgramId): Promise<void> {
  const db = await getDb();
  await db.delete('programs', id);
}
