import { describe, expect, it } from 'vitest';
import { DRILLS } from './index';
import { PROGRAMS } from '@/content/programs';

/**
 * What a drill needs, against what it actually asks you to do (PLAN.md M39).
 *
 * `filterDrills` hides a drill unless the climber has **every** item it
 * declares, so an over-declared tag is invisible harm: nine drills that
 * prescribed nothing but bouldering — "pick 3-5 crimpy boulders", "climb
 * them back-to-back" — declared a hangboard because their rationale
 * mentioned one, and disappeared from the library for anyone without a
 * board. One of them declared a hangboard *and* a campus board while its own
 * description reads "Very easy climbing only. No hangboard this week."
 *
 * Two of them declared a hangboard or a campus board and **not a wall**,
 * which is the same mistake pointing the other way: a drill that is entirely
 * projecting on a wall, offered to a climber who has no wall.
 *
 * The tags were assigned by what the text is *about* rather than by what it
 * makes you do, and nothing checked either direction.
 *
 * ## What these rules do and do not catch
 *
 * Six of the nine were found by reading, not by a rule, and the vocabulary
 * check below would still not find them: their text mentions the kit in
 * passing. What it does catch is the blatant form — declaring equipment the
 * drill never names at all — and the two structural rules underneath it are
 * the ones with real teeth, because neither depends on prose: a scheduled
 * drill cannot need more than its program requires, and a drill about
 * projecting has to declare a wall.
 */

/**
 * Words that mean the climber is on the thing, not that the text mentions it.
 *
 * Deliberately only the kit that gates hardest. `wall` is excluded: almost
 * every drill happens on one, the vocabulary for it is the whole language of
 * climbing, and a check that flags "ARC for 15 minutes" for not saying
 * "wall" teaches people to ignore it.
 *
 * `repeater` and `edge` are excluded for the opposite reason — both are
 * ordinary context nouns here. "Repeater phase should not push into pain",
 * on a drill that is three to five crimpy boulders, was enough to satisfy an
 * earlier version of this list, which is exactly the mistake being checked
 * for. A word earns a place here only when its presence means the climber's
 * hands are on the thing.
 */
const VOCABULARY: Partial<Record<string, RegExp>> = {
  hangboard: /hangboard|fingerboard|max hang|dead ?hang|density hang|one-hang|20mm/i,
  campus: /campus board|campus(ing|-board)|\brungs?\b/i,
  gym: /barbell|dumbbell|\bDB\b|weights? room|machine|lat pulldown|cable/i,
  weight: /weight belt|added weight|weighted|\bplates?\b|backpack|\+\d+ ?(lb|kg)/i,
};

describe('drill equipment', () => {
  it('reads a library worth checking', () => {
    // The floor. A filter that stops resolving drills passes every rule
    // below trivially (PLAN.md M40).
    expect(DRILLS.length).toBeGreaterThan(120);
    expect(DRILLS.filter((d) => d.equipment.some((e) => VOCABULARY[e])).length).toBeGreaterThan(2);
  });

  it('never declares kit the drill does not put you on', () => {
    const wrong = DRILLS.flatMap((drill) =>
      drill.equipment
        .filter((kit) => {
          const words = VOCABULARY[kit];
          return words !== undefined && !words.test(`${drill.name} ${drill.focus} ${drill.description}`);
        })
        .map((kit) => `${drill.id} declares ${kit} but never asks you to use one`),
    );
    expect(wrong).toEqual([]);
  });

  it('never schedules a drill the program cannot equip', () => {
    // The invariant behind the whole tag: a program promises the climber
    // that its required equipment is enough for every week of it. A drill
    // needing more than that is a week they cannot do.
    const wrong: string[] = [];
    let scheduled = 0;
    for (const program of PROGRAMS) {
      if (program.kind !== 'program') continue;
      const required = new Set(program.equipment);
      for (const session of program.sessionTypes) {
        for (const [week, id] of Object.entries(session.drillsByWeek ?? {})) {
          const drill = DRILLS.find((d) => d.id === id);
          expect(drill, `${program.id}/${session.id} week ${week} points at a drill that does not exist: ${id}`).toBeDefined();
          scheduled += 1;
          const beyond = drill!.equipment.filter((kit) => kit !== 'none' && !required.has(kit));
          if (beyond.length > 0) {
            wrong.push(`${program.id} week ${week}: ${drill!.id} needs ${beyond.join(' + ')}, the program requires ${program.equipment.join(' + ')}`);
          }
        }
      }
    }
    expect(scheduled).toBeGreaterThan(100);
    expect(wrong).toEqual([]);
  });

  it('gives a drill that happens on a wall a wall', () => {
    // The under-declared direction, narrow enough to be mechanical: a drill
    // whose text is about projecting or bouldering has to say it needs a
    // wall, or it is offered to someone with nothing.
    const onTheWall = /\b(boulder|boulders|project|projects|projecting|route|routes|lap|laps|burn|burns|traverse)\b/i;
    const wrong = DRILLS.filter(
      (d) => !d.equipment.includes('wall') && onTheWall.test(`${d.name} ${d.description}`),
    ).map((d) => `${d.id} climbs but does not declare a wall (declares ${d.equipment.join(', ') || 'nothing'})`);
    expect(wrong).toEqual([]);
  });
});
