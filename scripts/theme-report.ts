/**
 * Every contrast rule, measured, for every theme (PLAN.md M61).
 *
 * `themes.test.ts` answers "does this palette pass". Authoring a theme needs
 * the other half: which pair is failing, by how much, and how much headroom
 * the ones that pass have left. Guessing at twenty-six colours and running
 * the suite to find out is how the accent ended up at 4.31:1 for months.
 *
 * The rules live in `src/ui/paletteRules.ts` so they can be tested — a
 * report that says "0 failing" because its own comparison is inverted is
 * worse than no report.
 *
 * Run: npm run themes:check          — failures only
 *      npm run themes:check -- --all — every pair, worst first
 */
import { checkTheme, failed } from '@/ui/paletteRules';
import { THEMES } from '@/ui/themes';

const checks = THEMES.flatMap(checkTheme);
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
