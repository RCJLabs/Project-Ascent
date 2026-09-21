import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FIELDS } from './fields';
import { PROGRAMS } from './programs';

/**
 * Every number these two files state about the registry, re-taken
 * (PLAN.md M312).
 *
 * M307a's fifth finding was that `engine/sessionFields.ts` counted sixteen
 * fields where there are seventeen. It counted twenty-two session types
 * where there are twenty-seven, six numbers where there are seven, and
 * three retired where M169 made it four; `content/fields.ts` had four
 * numbers of its own and every one was stale. None of them was ever wrong
 * when written. They were measured once, in the milestone that put them
 * there, and nothing re-took them — which is the difference between a
 * measurement and a sentence that looks like one.
 *
 * So each claim is named here with what it should read, and a miss fails
 * rather than passing quietly: a reworded sentence stops matching, and the
 * floor at the bottom is what turns that from a silent pass into a failure.
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen',
];
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "seventeen" → 17, "twenty-seven" → 27. Null for anything else. */
function spelled(word: string): number | null {
  const lower = word.toLowerCase();
  const plain = ONES.indexOf(lower);
  if (plain >= 0) return plain;
  if (lower in TENS) return TENS[lower]!;
  const [tens, ones] = lower.split('-');
  if (tens !== undefined && ones !== undefined && tens in TENS) {
    const n = ONES.indexOf(ones);
    if (n > 0 && n < 10) return TENS[tens]! + n;
  }
  return null;
}

const all = Object.values(FIELDS);
const kind = (k: string) => all.filter((f) => f.kind === k).length;
const quantities = all.filter((f) => f.kind === 'number' || f.kind === 'scale');

const typesNaming = PROGRAMS.flatMap((p) => p.sessionTypes).filter((t) => (t.fields ?? []).length > 0);
const references = typesNaming.reduce((n, t) => n + t.fields!.length, 0);
const distinct = new Set(typesNaming.flatMap((t) => t.fields!)).size;
const programsNaming = PROGRAMS.filter((p) => p.sessionTypes.some((t) => (t.fields ?? []).length > 0)).length;

const NUM = String.raw`([A-Za-z]+(?:-[a-z]+)?)`;

interface Claim {
  file: string;
  /** One capture group per number, in the order they appear. */
  pattern: RegExp;
  expected: number[];
}

const CLAIMS: Claim[] = [
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`${NUM} field ids are declared`),
    expected: [all.length],
  },
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`${NUM} session types name one`),
    expected: [typesNaming.length],
  },
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`Of the ${NUM}, ${NUM} are a \`number\` and one is a \`scale\``),
    expected: [all.length, kind('number')],
  },
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`The ${NUM}\\s*\\n \\* \`text\` fields`),
    expected: [kind('text')],
  },
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`${NUM} of those ${NUM} quantities are charted`),
    expected: [quantities.filter((f) => f.retired === undefined).length, quantities.length],
  },
  {
    file: 'src/engine/sessionFields.ts',
    pattern: new RegExp(`the ${NUM} \`grade\` fields`),
    expected: [kind('grade')],
  },
  {
    file: 'src/features/progress/ProgressPage.tsx',
    pattern: new RegExp(`until M88 were asked on\\s*\\n\\s*${NUM} session types`),
    expected: [typesNaming.length],
  },
  {
    file: 'src/content/fields.ts',
    pattern: new RegExp(`${NUM} programs declare \`fields\``),
    expected: [programsNaming],
  },
  {
    file: 'src/content/fields.ts',
    pattern: new RegExp(`${NUM}\\s*\\n \\* declarations, ${NUM} references, ${NUM} distinct ids`),
    expected: [typesNaming.length, references, distinct],
  },
];

describe('the numbers these files state about the registry', () => {
  it('parses a spelled number, and refuses anything else', () => {
    expect(spelled('seventeen')).toBe(17);
    expect(spelled('Seventeen')).toBe(17);
    expect(spelled('twenty-seven')).toBe(27);
    expect(spelled('sixty')).toBe(60);
    expect(spelled('two')).toBe(2);
    // Not a number, and not a tens word with a nonsense tail.
    expect(spelled('registry')).toBeNull();
    expect(spelled('twenty-registry')).toBeNull();
    expect(spelled('twenty-ten')).toBeNull();
  });

  it('re-takes each one against the registry it describes', () => {
    let checked = 0;
    for (const claim of CLAIMS) {
      const source = readFileSync(claim.file, 'utf8');
      const found = claim.pattern.exec(source);
      expect(found, `${claim.file}: nothing matches ${claim.pattern.source}`).toBeTruthy();
      claim.expected.forEach((want, i) => {
        const word = found![i + 1]!;
        expect(spelled(word), `${claim.file}: "${word}" is not a number`).toBe(want);
        checked += 1;
      });
    }
    // The floor M309 had to add, and what it is actually for: a claim that
    // stops matching fails on its own `toBeTruthy` above, but an emptied
    // table runs the loop zero times and asserts nothing at all. Hardcoded
    // rather than derived from `CLAIMS`, because a number computed from the
    // table would be zero for an empty one and pass.
    expect(checked, 'the claims table stopped checking anything').toBe(13);
  });
});
