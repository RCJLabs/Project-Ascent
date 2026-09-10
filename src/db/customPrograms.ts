/**
 * Written programs, in the `programs` store that has been waiting for them
 * since M0. A record is the whole `Program` — the same shape the shipped
 * ones have, because everything downstream reads them the same way.
 */

import type { Program, ProgramId } from '@/content/types';
import { getDb } from './db';
import { recordReading, sound, type Shape } from './sound';

/**
 * A custom program is walked by the plan engine, the logger and the guides.
 * `phases` and `sessionTypes` are iterated on the program page before
 * anything is rendered, so an absent one is not a missing card, it is a
 * page. Their contents are validated by `parseProgramFile` on the way in.
 */
const PROGRAM_SHAPE: Shape = {
  needs: { id: 'string', name: 'string', weeks: 'number' },
  lists: { phases: { id: 'string', name: 'string' }, sessionTypes: { id: 'string', name: 'string' } },
};

export async function listCustomPrograms(): Promise<Program[]> {
  const db = await getDb();
  const reading = sound<Program>(await db.getAll('programs'), PROGRAM_SHAPE);
  recordReading('programs', reading);
  return reading.rows.sort((a, b) => a.name.localeCompare(b.name));
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
