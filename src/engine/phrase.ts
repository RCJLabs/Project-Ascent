/**
 * Joining a list into a sentence.
 *
 * Written for M84, where a hand-rolled version produced *"Max Hang,
 * Repeater Weight and Lock-Off and 2 more"* — the Oxford-less join and the
 * truncation each added their own "and". Seen in a browser, which is the
 * only place a sentence is really read.
 *
 * Three plain joins already exist in `plateau.ts`, `bodyLoad.ts` and
 * `review.ts`. None of them truncates and none of them is wrong, so they
 * are left alone rather than swept up in a milestone about assessments;
 * this is for the callers that cut a list short, where the two rules
 * interact.
 */

/** "A", "A and B", "A, B and C". */
/**
 * "a" or "an", by the sound the word starts with.
 *
 * Vowel letters, which is not the rule English actually uses — "an hour",
 * "a European" — but is right for every word the app puts after it: body
 * parts, grades and program names. Anything that needs the real rule needs
 * a dictionary, and a dictionary for one adjective is not worth carrying.
 *
 * Added at M110, when the sample climber put *"you have logged a elbow
 * injury"* on the home screen of a screenshot. Nothing had ever shown it,
 * because nothing had ever had an elbow injury and a plateau at once.
 */
export function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/**
 * The word, agreeing with the number in front of it (PLAN.md M268).
 *
 * The fifth copy of this, and the first one anybody can find: `skills.ts`,
 * `objectives.ts`, `season.ts` and `injuryLog.ts` each had a private
 * `plural`, two returning the word and two returning the count with it. A
 * rule kept in four places is a rule three of them can drift from, and the
 * defect that found this was in none of the four — the Progress header
 * spelled it inline and read *"1 sessions logged"*.
 *
 * `many` is a parameter because English does not always add an `s`: the
 * skills tree counts tries, not trys.
 */
export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** The count and the word that agrees with it: `3 sessions`, `1 session`. */
export function counted(n: number, one: string, many = `${one}s`): string {
  return `${n} ${plural(n, one, many)}`;
}

export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]!}`;
}

/**
 * The same, cut to `limit` with the remainder counted.
 *
 * The cut list takes a comma before "and N more", never a second "and":
 * the tail is a count, not another member of the list.
 */
export function joinCapped(parts: readonly string[], limit: number): string {
  if (parts.length <= limit) return joinList(parts);
  const rest = parts.length - limit;
  return `${parts.slice(0, limit).join(', ')} and ${rest} more`;
}
