/**
 * The suite, run as other days (PLAN.md M299).
 *
 * `today()` reads the clock, so a quarter of the test files build their
 * fixtures out of a date nobody chose. That is fine until a fixture says
 * something the day it is written and something else on a Sunday — and
 * seven of them did. The suite had been green on every push for two
 * hundred milestones and was red on four days in seven, on a Sunday and on
 * most of the calendar, because it had never been run as one.
 *
 * This runs the date-touching part of the suite as each of the next seven
 * days, and as the three days of a month whose shape is different: the
 * first, the twenty-eighth and the last. A failure names the day, which is
 * the whole difficulty otherwise — the same code, the same commit and a
 * different answer with nothing in the diff to point at.
 *
 * The file list is derived, not kept: every test that imports the date
 * engine is a test whose answer can depend on the day. That is a heuristic
 * and a generous one, and a test that reads the clock without importing
 * `@/engine/dates` is outside it — `updatePrompt.test.tsx` is the one the
 * app has, and it is the one test here that a pinned clock cannot be
 * asked at all.
 *
 * Run:  npm run test:dates
 */
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

/** Every test file that imports the date engine. */
function dateTouching(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...dateTouching(full));
    else if (/\.test\.tsx?$/.test(entry.name) && readFileSync(full, 'utf8').includes('@/engine/dates')) {
      found.push(path.relative(ROOT, full));
    }
  }
  return found;
}

const FILES = dateTouching(path.join(ROOT, 'src')).sort();
if (FILES.length < 40) throw new Error(`Only ${FILES.length} date-touching test files found — the scan has drifted`);

const key = (date) => date.toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return key(d);
};
/** The `day`th of the month `monthsOn` from this one, or its last day. */
const monthDay = (monthsOn, day) => {
  const d = new Date();
  // The first, before the month moves: the 31st of a month is the 1st of
  // the month after next when the next one has thirty days.
  d.setDate(1);
  // Day 0 of the month after is the last day of the one before it.
  d.setMonth(d.getMonth() + monthsOn + (day === 'last' ? 1 : 0));
  d.setDate(day === 'last' ? 0 : day);
  return key(d);
};

// Every weekday, and the three month positions a calendar month can put a
// week in: its first day, its twenty-eighth, and its last.
const DAYS = [...new Set([
  ...Array.from({ length: 7 }, (_, i) => shift(i)),
  monthDay(1, 1),
  monthDay(1, 28),
  monthDay(1, 'last'),
])].sort();
if (DAYS.length < 7) throw new Error(`Only ${DAYS.length} days — a week is seven of them`);

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? '';
};

// `--list` prints the days as JSON, so CI can fan them out over as many
// runners: ten of these one after another is twenty minutes on the way to a
// deploy, and ten at once is one of them.
if (args.includes('--list')) {
  console.log(JSON.stringify(DAYS));
  process.exit(0);
}

const only = flag('day');
if (only !== null && !DAYS.includes(only)) {
  console.error(`--day ${only} is not one of ${DAYS.join(', ')}`);
  process.exit(1);
}
const RUNNING = only === null ? DAYS : [only];

console.log(`${FILES.length} date-touching test files, as ${RUNNING.length} of ${DAYS.length} days`);

let failed = 0;
for (const day of RUNNING) {
  const started = Date.now();
  const run = spawnSync('npx', ['vitest', 'run', ...FILES], {
    cwd: ROOT,
    env: { ...process.env, ASCENT_TODAY: day },
    encoding: 'utf8',
  });
  const took = `${Math.round((Date.now() - started) / 1000)}s`;
  const weekday = new Date(`${day}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short' });
  if (run.status === 0) {
    console.log(`  ${day} ${weekday}  ok  ${took}`);
    continue;
  }
  failed++;
  console.log(`  ${day} ${weekday}  FAILED  ${took}`);
  for (const line of `${run.stdout}${run.stderr}`.split('\n')) {
    if (line.startsWith(' FAIL ')) console.log(`      ${line.trim()}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${RUNNING.length} days fail. The app runs on all of them.`);
  process.exit(1);
}
console.log(`\nthe same ${RUNNING.length === 1 ? 'suite' : 'suite on every day of the week, and at both ends of a month'}`);
