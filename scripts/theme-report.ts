/**
 * Every contrast rule, measured, for every theme (PLAN.md M61).
 *
 * `themes.test.ts` answers "does this palette pass". Authoring a theme needs
 * the other half: which pair is failing, by how much, and how much headroom
 * the ones that pass have left. Guessing at twenty-six colours and running
 * the suite to find out is how the accent ended up at 4.31:1 for months.
 *
 * Run: npm run themes:check          — failures only
 *      npm run themes:check -- --all — every pair, worst first
 */
import { contrast, CVD, distance, rgb } from '@/ui/contrast';
import { FOREGROUNDS, STATUS, SURFACES, THEMES, type Palette } from '@/ui/themes';

interface Check {
  theme: string;
  mode: string;
  rule: string;
  ratio: number;
  need: number;
  /** Some rules are ceilings: `line` must stay *below* 3:1. */
  ceiling?: boolean;
}

const checks: Check[] = [];
const add = (c: Check) => checks.push(c);

for (const theme of THEMES) {
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
}

const failed = (c: Check) => (c.ceiling ? c.ratio >= c.need : c.ratio < c.need);
const all = process.argv.includes('--all');
const rows = (all ? checks : checks.filter(failed)).sort((a, b) => a.ratio - b.ratio);

const pad = (s: string, n: number) => s.padEnd(n);
for (const row of rows) {
  const mark = failed(row) ? 'FAIL' : '    ';
  const want = row.ceiling ? `< ${row.need}` : `>= ${row.need}`;
  console.log(
    `${mark} ${pad(row.theme, 14)} ${pad(row.mode, 5)} ${pad(row.rule, 34)} ${row.ratio.toFixed(2).padStart(7)}  (${want})`,
  );
}

const failures = checks.filter(failed).length;
console.log(
  `\n${THEMES.length} themes, ${checks.length} checks, ${failures} failing.` +
    (all || failures > 0 ? '' : ' Pass --all to see the headroom.'),
);
process.exitCode = failures > 0 ? 1 : 0;
