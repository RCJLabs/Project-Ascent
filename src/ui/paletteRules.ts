/**
 * Every contrast rule a palette has to satisfy, as data (PLAN.md M61).
 *
 * Written here rather than inside the report script so that the tool an
 * author trusts while tuning a palette can itself be tested. A report that
 * says "0 failing" because its own comparison is inverted is worse than no
 * report, and that is exactly the mutation that survived until this moved.
 *
 * `themes.test.ts` stays the authority on what ships — these rules and those
 * assertions are two readings of the same standard, and the suite holds them
 * to the same answer.
 */

import { contrast, CVD, distance, rgb } from './contrast';
import { FOREGROUNDS, STATUS, SURFACES, type Palette, type Theme } from './themes';

export interface Check {
  theme: string;
  mode: string;
  rule: string;
  ratio: number;
  need: number;
  /** Some rules are ceilings: `line` must stay *below* 3:1. */
  ceiling?: boolean;
}

/** A ceiling rule fails by being too strong; every other by being too weak. */
export function failed(c: Check): boolean {
  return c.ceiling ? c.ratio >= c.need : c.ratio < c.need;
}

/** Every check for one theme, both modes. */
export function checkTheme(theme: Theme): Check[] {
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  for (const mode of ['light', 'dark'] as const) {
    const p: Palette = theme[mode];
    for (const fg of FOREGROUNDS) {
      for (const surface of SURFACES) {
        add({ theme: theme.id, mode, rule: `${fg} on ${surface}`, ratio: contrast(p[fg], p[surface]), need: 4.5 });
      }
    }
    add({ theme: theme.id, mode, rule: 'accentInk on accent', ratio: contrast(p.accentInk, p.accent), need: 4.5 });
    for (const surface of SURFACES) {
      add({ theme: theme.id, mode, rule: `focus ring on ${surface}`, ratio: contrast(p.accentStrong, p[surface]), need: 3 });
    }
    add({ theme: theme.id, mode, rule: 'line on surface (must stay quiet)', ratio: contrast(p.line, p.surface), need: 3, ceiling: true });
    for (const viz of ['viz1', 'viz2'] as const) {
      add({ theme: theme.id, mode, rule: `${viz} on surface`, ratio: contrast(p[viz], p.surface), need: 3 });
    }
    for (const [name, simulate] of Object.entries(CVD)) {
      const apart = distance(simulate(rgb(p.viz1)), simulate(rgb(p.viz2)));
      add({ theme: theme.id, mode, rule: `viz1 vs viz2 under ${name}`, ratio: apart, need: 40 });
    }
    for (const key of ['good', 'warning', 'serious', 'critical'] as const) {
      add({ theme: theme.id, mode, rule: `status ${key} on surface`, ratio: contrast(STATUS[mode][key], p.surface), need: 4.5 });
    }
  }
  return checks;
}
