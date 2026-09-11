/**
 * What an offline-first app owes the climber (PLAN.md M19).
 *
 * Two things can interrupt someone mid-session, and neither is the network.
 * A service worker that swaps the app under them, and a browser that runs
 * out of room to store what they just logged. Both are decided here, as
 * pure functions, so the rules are testable without a browser.
 */

/** A new version is precached and waiting for the app to hand over. */
export interface UpdateGate {
  /** The waiting service worker has told us it is ready. */
  ready: boolean;
  /** A session is running right now. */
  live: boolean;
  /** The climber said "later" during this run of the app. */
  deferred: boolean;
}

export type UpdateHold = 'live' | 'deferred' | null;

/**
 * Why an update that is ready is not being offered.
 *
 * A live session outranks a deferral, because it is the reason the rule
 * exists: applying an update reloads the page, and a reload during a session
 * throws away the running clock. The climber is mid-hangboard set and the app
 * restarts — that is the failure M19 exists to prevent.
 */
export function updateHold(gate: UpdateGate): UpdateHold {
  if (!gate.ready) return null;
  if (gate.live) return 'live';
  if (gate.deferred) return 'deferred';
  return null;
}

/** Whether to put the update prompt in front of the climber now. */
export function updateVisible(gate: UpdateGate): boolean {
  return gate.ready && updateHold(gate) === null;
}

/**
 * A held update is not a lost one.
 *
 * A waiting service worker activates on its own once every tab of the app is
 * closed, so "later" costs nothing — the next launch is the new version. Say
 * that rather than nagging.
 */
export const DEFERRED_NOTE = 'It will be applied the next time you open the app.';

export interface StorageReading {
  /** Bytes in use, if the browser will say. */
  usage?: number | undefined;
  /** Bytes the browser is currently willing to grant, if it will say. */
  quota?: number | undefined;
  /** Whether the browser has promised not to evict. Null means unknown. */
  persisted: boolean | null;
}

export type PressureLevel = 'unknown' | 'evictable' | 'fine' | 'tight' | 'full';

export interface Pressure {
  level: PressureLevel;
  /** Fraction of the quota in use, or null when the browser will not say. */
  ratio: number | null;
  headline: string;
  detail: string;
}

/** Above this share of the quota, a long session's photos might not fit. */
export const TIGHT_RATIO = 0.8;
/** Above this, the next write is likely to fail. */
export const FULL_RATIO = 0.95;

/**
 * How worried to be about storage.
 *
 * Running out of quota is the loud failure, but it is not the likely one —
 * browsers grant hundreds of megabytes and this app stores text. The quiet
 * failure is eviction: an app that was never granted persistent storage can
 * have its whole database cleared by a browser reclaiming space, without
 * asking and without telling. That is a year of logs gone, so it outranks a
 * quota reading that is merely high.
 */
export function storagePressure(reading: StorageReading): Pressure {
  const { usage, quota, persisted } = reading;
  const ratio =
    usage !== undefined && quota !== undefined && quota > 0 ? usage / quota : null;

  if (persisted === false) {
    return {
      level: 'evictable',
      ratio,
      headline: 'Your data can be cleared without warning',
      detail:
        'This browser has not promised to keep it. If it needs space it may clear the whole app, logs included. Installing to your home screen usually fixes this, and exporting a backup covers you either way.',
    };
  }

  if (ratio === null) {
    return {
      level: 'unknown',
      ratio: null,
      headline: 'Storage use is unknown',
      detail: 'This browser will not report how much room it has given the app.',
    };
  }

  if (ratio >= FULL_RATIO) {
    return {
      level: 'full',
      ratio,
      headline: 'Almost out of room',
      detail:
        'The next thing you log may fail to save. Export a backup now, then delete photos from older sessions — they are far larger than the logs themselves.',
    };
  }

  if (ratio >= TIGHT_RATIO) {
    return {
      level: 'tight',
      ratio,
      headline: 'Storage is getting tight',
      detail:
        'Still working, but worth clearing space before it is not. Photos are almost all of it.',
    };
  }

  return {
    level: 'fine',
    ratio,
    headline: 'Plenty of room',
    detail: 'Your data is stored on this device and the browser has promised to keep it.',
  };
}

/** Whether this reading is worth interrupting someone over. */
export function pressureIsUrgent(pressure: Pressure): boolean {
  return pressure.level === 'full';
}

/**
 * Human bytes, for a number nobody wants in full.
 *
 * Goes as far as gigabytes, which the two implementations this replaced did
 * not: both stopped at MB, so a browser offering a 60GB quota reported
 * "61440.0 MB" in Settings.
 */
export function formatBytes(bytes: number | undefined): string {
  // `?` for "the browser would not say" — and for a total that arithmetic
  // turned into NaN, which is the same thing from the reader's side and was
  // previously printed as "NaN KB" (PLAN.md M80).
  if (bytes === undefined || !Number.isFinite(bytes)) return '?';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
