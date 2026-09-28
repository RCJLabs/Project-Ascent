/**
 * Whether the timer's cues sound, which Settings decides at boot.
 *
 * The cues themselves — the audio context, the tones, the buzzes — are
 * `cueSounds.ts` (PLAN.md M344), loaded with the timers and the game that
 * play them. The switch stays here because the settings store sets it
 * before any of those pages exists, and the sounds read it when they play.
 */

let enabled = true;

export function setCuesEnabled(value: boolean): void {
  enabled = value;
}

export function cuesEnabled(): boolean {
  return enabled;
}
