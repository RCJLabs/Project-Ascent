/**
 * Audio and haptic cues for the interval timer.
 *
 * Tones are synthesised with the Web Audio API rather than shipped as audio
 * files: no assets to cache, nothing to fail offline, and a few bytes of
 * code instead of a few hundred kilobytes of samples.
 *
 * Browsers refuse to start audio without a user gesture, so `unlock()` must
 * be called from the tap that starts the timer.
 */

let ctx: AudioContext | null = null;
let enabled = true;

type AudioContextCtor = new () => AudioContext;

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call from a user gesture so later cues are allowed to sound. */
export function unlock(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

export function setCuesEnabled(value: boolean): void {
  enabled = value;
}

export function cuesEnabled(): boolean {
  return enabled;
}

function tone(freq: number, ms: number, gain = 0.25, delayMs = 0): void {
  if (!enabled) return;
  const c = context();
  if (!c) return;
  const start = c.currentTime + delayMs / 1000;
  const osc = c.createOscillator();
  const vol = c.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  // Short attack and release so the beep does not click.
  vol.gain.setValueAtTime(0, start);
  vol.gain.linearRampToValueAtTime(gain, start + 0.01);
  vol.gain.linearRampToValueAtTime(0, start + ms / 1000);
  osc.connect(vol).connect(c.destination);
  osc.start(start);
  osc.stop(start + ms / 1000 + 0.02);
}

function buzz(pattern: number | number[]): void {
  if (!enabled) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration unsupported or blocked — cues are additive, never required.
  }
}

/** One of the three ticks counting into a work phase. */
export function cueCountdown(): void {
  tone(880, 90, 0.18);
  buzz(30);
}

/** A work phase begins — the one you must not miss. */
export function cueWork(): void {
  tone(1320, 220, 0.3);
  buzz([0, 120]);
}

/** A rest phase begins. */
export function cueRest(): void {
  tone(660, 180, 0.22);
  buzz(60);
}

/** The long rest between sets begins. */
export function cueSetRest(): void {
  tone(520, 260, 0.22);
  buzz([0, 80, 80, 80]);
}

/** The whole protocol is finished. */
export function cueDone(): void {
  tone(880, 160, 0.28);
  tone(1100, 160, 0.28, 180);
  tone(1320, 320, 0.3, 360);
  buzz([0, 150, 100, 150, 100, 300]);
}
