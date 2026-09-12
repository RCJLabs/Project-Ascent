/**
 * A file the operating system opened the app with (PLAN.md M111).
 *
 * `file_handlers` hands the app a file at launch, and the screens that know
 * what to do with one — the program importer and the backup importer —
 * are behind a route. Something has to hold the file across that
 * navigation, and it is deliberately this small: one slot, taken once.
 *
 * **Taken, not read.** `takeLaunchFile` clears as it returns, so a page
 * that mounts twice does not import twice — which is the failure a shared
 * "pending file" would otherwise have, since React mounts effects again in
 * development and a route can be revisited.
 */

import { OPENS_AT, kindOfFile } from '@/engine/openWith';
import { markLaunched } from './launchFlag';

let pending: File | null = null;

export function setLaunchFile(file: File): void {
  pending = file;
  markLaunched();
}

/** The file, once. Null on every call after the first. */
export function takeLaunchFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}

/**
 * Take delivery of a launched file, and say where it belongs.
 *
 * Null means the app could not place it, and nothing is stashed: a file
 * that is neither a program nor a backup should leave the app exactly where
 * it was, not open an importer that greets the climber with an error about
 * a file they may never have meant for this app.
 */
export async function receiveLaunch(file: File): Promise<string | null> {
  const kind = await kindOfFile(file);
  if (kind === null) return null;
  setLaunchFile(file);
  return OPENS_AT[kind];
}
