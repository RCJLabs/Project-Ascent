/**
 * What each program's own data says about which sessions matter (PLAN.md M64).
 *
 * Prints the declared order, the proposed order and the evidence behind
 * every line, so the coaching judgement starts from something. A tie means
 * the program has not said, and declaration order stands.
 *
 * Run: npm run priority
 */
import { PROGRAMS } from '@/content/programs';
import { movesAnything, proposePriority } from '@/engine/priority';

for (const program of PROGRAMS) {
  if (program.kind === 'mode') continue;
  const declared = program.sessionTypes.filter((t) => !t.isRest).map((t) => t.id);
  const proposed = proposePriority(program);
  const changed = movesAnything(program);

  console.log(`\n### ${program.id}${changed ? '  (order changes)' : '  (unchanged)'}`);
  console.log(`declared: ${declared.join(' > ')}`);
  console.log(`proposed: ${proposed.map((p) => `${p.id}${p.tied ? '*' : ''}`).join(' > ')}`);
  for (const p of proposed) {
    console.log(`  ${String(p.score).padStart(3)}  ${p.id.padEnd(6)} ${p.name}`);
    for (const why of p.why) console.log(`       ${why}`);
    if (p.tied) console.log(`       * tied — the program does not say, so declaration order stands`);
  }
}

const ties = PROGRAMS.filter((p) => p.kind !== 'mode' && proposePriority(p).some((s) => s.tied));
console.log(`\n${ties.length} programs contain a tie the data cannot settle: ${ties.map((p) => p.id).join(', ')}`);
