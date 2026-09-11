import { describe, expect, it } from 'vitest';
import {
  FULL_RATIO,
  TIGHT_RATIO,
  formatBytes,
  pressureIsUrgent,
  storagePressure,
  updateHold,
  updateVisible,
} from './offline';

const gate = (patch: Partial<Parameters<typeof updateHold>[0]> = {}) => ({
  ready: true,
  live: false,
  deferred: false,
  ...patch,
});

describe('holding an update', () => {
  it('offers it when nothing is in the way', () => {
    expect(updateVisible(gate())).toBe(true);
    expect(updateHold(gate())).toBeNull();
  });

  it('never interrupts a live session', () => {
    // M19's whole "done when". Applying an update reloads the page, and a
    // reload mid-session throws away the running clock.
    expect(updateVisible(gate({ live: true }))).toBe(false);
    expect(updateHold(gate({ live: true }))).toBe('live');
  });

  it('says the session, not the deferral, when both apply', () => {
    // The live rule is the one worth explaining: "later" is a choice the
    // climber already made and does not need read back to them.
    expect(updateHold(gate({ live: true, deferred: true }))).toBe('live');
  });

  it('respects a deferral', () => {
    expect(updateVisible(gate({ deferred: true }))).toBe(false);
    expect(updateHold(gate({ deferred: true }))).toBe('deferred');
  });

  it('holds nothing when there is no update', () => {
    expect(updateHold(gate({ ready: false, live: true }))).toBeNull();
    expect(updateVisible(gate({ ready: false }))).toBe(false);
  });

  it('offers it again once the session ends', () => {
    const during = gate({ live: true });
    expect(updateVisible(during)).toBe(false);
    expect(updateVisible({ ...during, live: false })).toBe(true);
  });
});

describe('storage pressure', () => {
  const reading = (usage: number, quota: number, persisted: boolean | null = true) => ({
    usage,
    quota,
    persisted,
  });

  it('calls a browser that has not promised to keep the data the worst case', () => {
    // Eviction clears everything at once and without asking. A high quota
    // reading is a warning; this is the failure.
    const p = storagePressure(reading(1, 1_000_000, false));
    expect(p.level).toBe('evictable');
  });

  it('outranks a full disk with eviction', () => {
    const p = storagePressure(reading(99, 100, false));
    expect(p.level).toBe('evictable');
  });

  it('reads a comfortable device as fine', () => {
    expect(storagePressure(reading(10_000, 1_000_000)).level).toBe('fine');
  });

  it('warns before the writes start failing', () => {
    expect(storagePressure(reading(TIGHT_RATIO * 100, 100)).level).toBe('tight');
    expect(storagePressure(reading(TIGHT_RATIO * 100 - 1, 100)).level).toBe('fine');
  });

  it('calls it full only when the next write is at risk', () => {
    expect(storagePressure(reading(FULL_RATIO * 100, 100)).level).toBe('full');
    expect(storagePressure(reading(FULL_RATIO * 100 - 1, 100)).level).toBe('tight');
  });

  it('admits when it does not know', () => {
    expect(storagePressure({ persisted: true }).level).toBe('unknown');
    expect(storagePressure({ usage: 5, persisted: true }).level).toBe('unknown');
    expect(storagePressure({ usage: 5, quota: 0, persisted: true }).ratio).toBeNull();
  });

  it('does not divide by a quota of zero', () => {
    expect(storagePressure(reading(5, 0)).level).toBe('unknown');
  });

  it('interrupts only when the next write is at risk', () => {
    expect(pressureIsUrgent(storagePressure(reading(99, 100)))).toBe(true);
    expect(pressureIsUrgent(storagePressure(reading(85, 100)))).toBe(false);
    expect(pressureIsUrgent(storagePressure(reading(1, 100, false)))).toBe(false);
  });

  it('always says something a climber can act on', () => {
    const readings = [
      reading(1, 100, false),
      reading(1, 100),
      reading(85, 100),
      reading(99, 100),
      { persisted: null },
    ];
    for (const r of readings) {
      const p = storagePressure(r);
      expect(p.headline.length, JSON.stringify(r)).toBeGreaterThan(8);
      expect(p.detail.length, JSON.stringify(r)).toBeGreaterThan(20);
    }
  });
});

describe('formatBytes', () => {
  it('does not dress up small numbers', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('climbs units', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1024 * 1024 * 5.5)).toBe('5.5 MB');
    expect(formatBytes(1024 ** 3 * 2)).toBe('2.0 GB');
  });

  it('drops the decimal once it is noise', () => {
    expect(formatBytes(1024 * 512)).toBe('512 KB');
  });

  it('stops at gigabytes rather than inventing a unit', () => {
    expect(formatBytes(1024 ** 4)).toBe('1024 GB');
  });
});

describe('a byte count that is not a number', () => {
  it('reads as unknown rather than as NaN (PLAN.md M80)', () => {
    // One media record whose blob lost its size turned the whole total into
    // NaN, and the settings page printed "NaN KB".
    expect(formatBytes(Number.NaN)).toBe('?');
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe('?');
    expect(formatBytes(undefined)).toBe('?');
    expect(formatBytes(0)).toBe('0 B');
  });
});
