/**
 * Whether this run of the app began with a file (PLAN.md M111).
 *
 * Its own module, and two lines, so that the boot path can ask the question
 * without pulling in the sniffer and the importers behind it. `launchFile`
 * imports `openWith`, which is dead weight on every cold load of an app
 * that was not opened with a file — which is nearly all of them. The same
 * split M110 made for the demo flag, for the same reason.
 */

let launched = false;

export function markLaunched(): void {
  launched = true;
}

/**
 * Onboarding's redirect stands down for a launch.
 *
 * Without this, a climber setting up a new phone and tapping their backup
 * lands on the welcome screen: the redirect fires on an empty database,
 * wins the race against reading the file, and the backup is dropped. That
 * is the launch that matters most.
 *
 * Sticky rather than tied to the pending file: it stays true after the file
 * is taken, so cancelling the import preview leaves the climber in settings
 * rather than throwing them into onboarding a second later.
 */
export function launchedWithFile(): boolean {
  return launched;
}
