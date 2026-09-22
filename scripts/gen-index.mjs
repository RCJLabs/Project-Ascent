/**
 * Write INDEX.md: every milestone, and every file, from git and PLAN.md.
 *
 * PLAN.md is the only record of why anything is the way it is, and at
 * twenty-two thousand lines the way to use it is to grep. M298a's ninth
 * entry asked for an index, and asked for it to be derived rather than
 * maintained — which is the whole point: a hand-written index of a file
 * this long is a second record to keep in step with the first, and M312
 * has just finished showing what happens to those.
 *
 * Two questions it answers that grep answers badly:
 *
 *   1. What was M204 about, and where is it written up?
 *   2. Why is `src/engine/coach.ts` like this — which milestones touched it?
 *
 * The second is the one that costs most without an index: a file's history
 * is in `git log`, but the *reasons* are in PLAN.md under milestone numbers
 * you can only get from that log.
 *
 * ## Its own commit
 *
 * The index is built from the log, so it cannot describe the commit that
 * ships it — that commit does not exist when the generator runs. The order
 * is therefore: commit, regenerate, `git commit --amend`. The amend keeps
 * the subject and the date, which is all a row holds, so the file is right
 * about itself afterwards.
 *
 * `indexFresh.test.ts` is what makes that a rule rather than a habit: skip
 * the amend and the next run of the suite says so, by name.
 *
 * Run: npm run index
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** Milestones shown per file before the rest are counted rather than named. */
const RECENT = 12;

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * A commit subject names its milestone, in one of the separators this
 * project has used: `M314: title` and `M118 — title` are both real, and a
 * pattern that knows only the colon reports M118 as never built. Three of
 * my own parses of this log were wrong before the em dash turned up.
 */
const NAMES = /^(M\d+[a-z]?)\s*[:—–-]\s*(.+)$/;

/** `M12b` sorts after `M12` and before `M13`. */
const order = (id) => {
  const [, n, suffix] = /^M(\d+)([a-z]?)$/.exec(id);
  return [Number(n), suffix];
};
const byId = (a, b) => {
  const [an, as] = order(a);
  const [bn, bs] = order(b);
  return an - bn || as.localeCompare(bs);
};

// ── What shipped, from the log ────────────────────────────────────────────

const milestones = new Map();
const touched = new Map();

const log = git('log', '--reverse', '--format=%x00%H%x09%ad%x09%s', '--date=short', '--name-only');
for (const entry of log.split('\0').slice(1)) {
  const [header, ...files] = entry.split('\n');
  const [sha, date, subject] = header.split('\t');
  const named = NAMES.exec(subject);
  if (!named) continue;
  const [, id, title] = named;
  // The **first** commit's words, and the **last** commit's date. A
  // milestone shipped over several commits is headlined by the one that
  // opened it and finished on the day of the one that closed it — M1 ran
  // to four, and taking the last subject called it *"convert Peak
  // Performance and The Long Game"*, which is a quarter of what it was.
  const already = milestones.get(id);
  milestones.set(id, {
    id,
    title: already?.title ?? title,
    date,
    commits: (already?.commits ?? 0) + 1,
  });
  for (const file of files) {
    if (!file) continue;
    if (!touched.has(file)) touched.set(file, new Set());
    touched.get(file).add(id);
  }
}

/**
 * A number with no commit is not a hole.
 *
 * Some were withdrawn or refused, which the log says out loud. The rest
 * were proposed in a brainstorm and never built — renumbered, merged into
 * a neighbour, or decided against quietly. Either way the number is part
 * of the record, and an index that showed a gap would leave a reader to
 * guess which kind it was.
 *
 * `M200 withdrawn, and three more with it` names one of the four it
 * covers, so the other three land in the second list rather than the
 * first. That is the log being terser than this can read, not a gap.
 */
const withdrawn = new Map();
for (const line of git('log', '--format=%s').split('\n')) {
  const said = /\b(M\d+[a-z]?)\b.*\b(withdrawn|refused)\b/i.exec(line);
  if (said && !milestones.has(said[1])) withdrawn.set(said[1], line.trim());
}

// ── Where PLAN.md writes each one up ──────────────────────────────────────

const plan = readFileSync('PLAN.md', 'utf8').split('\n');
const planLine = new Map();
plan.forEach((line, i) => {
  // Headings first and bullets second, so a milestone with a full write-up
  // points at that rather than at the one-line proposal above it.
  const heading = /^#{2,4} .*?\b(M\d+[a-z]?)\b/.exec(line);
  if (heading) { planLine.set(heading[1], i + 1); return; }
  const bullet = /^- \*\*(M\d+[a-z]?)[ —]/.exec(line);
  if (bullet && !planLine.has(bullet[1])) planLine.set(bullet[1], i + 1);
});

// ── Write it ──────────────────────────────────────────────────────────────

const ids = [...milestones.keys()].sort(byId);
const out = [];
out.push('# Index');
out.push('');
out.push('Generated by `npm run index` from the git log and PLAN.md. Do not edit by hand —');
out.push('`indexFresh.test.ts` regenerates it and fails on any difference.');
out.push('');
const live = [...touched.keys()].filter((f) => f && existsSync(f)).length;
out.push(`${ids.length} milestones, M0 to ${ids.at(-1)}, over ${live} of the files still here.`);
out.push('');
out.push('## By milestone');
out.push('');
out.push('| | shipped | what it was | PLAN.md |');
out.push('|---|---|---|---|');
for (const id of ids) {
  const m = milestones.get(id);
  const at = planLine.get(id);
  out.push(`| **${id}** | ${m.date} | ${m.title.replace(/\|/g, '\\|')} | ${at ? `L${at}` : '—'} |`);
}
out.push('');
out.push('### Numbers with no milestone');
out.push('');
out.push('Proposed and not built. The first list is the ones the log withdrew or refused');
out.push('by name; the rest were named in PLAN.md and never shipped.');
out.push('');
for (const id of [...withdrawn.keys()].sort(byId)) {
  out.push(`- **${id}** — ${withdrawn.get(id).replace(/\|/g, '\\|')}`);
}
const unbuilt = [...planLine.keys()].filter((id) => !milestones.has(id) && !withdrawn.has(id)).sort(byId);
if (unbuilt.length > 0) {
  out.push('');
  for (const id of unbuilt) out.push(`- **${id}** — proposed, PLAN.md L${planLine.get(id)}`);
}
out.push('');
out.push('## By file');
out.push('');
out.push('Which milestones touched a file, oldest first — the reasons are in PLAN.md');
out.push(`under those numbers. Capped at the ${RECENT} most recent, because a file the whole`);
out.push('project has touched answers "which milestones" with "nearly all of them", and');
out.push('the useful half of that answer is the recent half. PLAN.md and this file are');
out.push('left out: they change with every milestone by construction.');
out.push('');
// Files that are still here. A file the tree no longer has was touched by
// the milestone that deleted it, and the question this section answers —
// *why is this file like this* — is not one you ask of a file that is gone.
const present = new Set(git('ls-files').trim().split('\n'));
const RECORDS = new Set(['PLAN.md', 'INDEX.md']);
for (const file of [...touched.keys()].filter((f) => present.has(f) && !RECORDS.has(f)).sort()) {
  const all = [...touched.get(file)].sort(byId);
  const shown = all.slice(-RECENT);
  const more = all.length - shown.length;
  out.push(`- \`${file}\` — ${shown.join(', ')}${more > 0 ? ` *(+${more} earlier)*` : ''}`);
}
out.push('');

writeFileSync('INDEX.md', out.join('\n'));
console.log(`INDEX.md: ${ids.length} milestones, ${withdrawn.size} withdrawn, ${touched.size} files`);
