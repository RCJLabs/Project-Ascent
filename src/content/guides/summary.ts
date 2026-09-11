/**
 * Guides, without their bodies.
 *
 * `content/guides/index.ts` imports all fifteen guide modules, so any
 * import from it — even `guideFor`, to decide whether to show one link —
 * pulls about 150KB of prose into whatever chunk asked. The program detail
 * page did exactly that, and it is on the path from opening the app to
 * starting a program.
 *
 * This is the part a page needs before it has decided to show a guide: does
 * one exist, what is it called, how long is it. The bodies stay in the
 * guides chunk, which loads when someone actually opens one.
 *
 * Duplicated on purpose, and `guides.test.ts` asserts it matches — the same
 * bargain as index.css and the theme data.
 */
export interface GuideSummary {
  id: string;
  name: string;
  sections: number;
}

export const GUIDE_SUMMARIES: GuideSummary[] = [
  { id: 'new_to_climbing', name: 'New to Climbing', sections: 2 },
  { id: 'app_guide', name: 'Using the App', sections: 17 },
  { id: 'ground_zero', name: 'GROUND ZERO', sections: 11 },
  { id: 'base_camp', name: 'BASE CAMP', sections: 10 },
  { id: 'two_day_week', name: 'TWO DAYS A WEEK', sections: 6 },
  { id: 'gravity_defied', name: 'GRAVITY DEFIED', sections: 13 },
  { id: 'lockdown', name: 'LOCKDOWN', sections: 10 },
  { id: 'iron_grip', name: 'IRON GRIP', sections: 9 },
  { id: 'peak_performance', name: 'PEAK PERFORMANCE', sections: 10 },
  { id: 'the_long_game', name: 'THE LONG GAME', sections: 12 },
  { id: 'the_siege', name: 'THE SIEGE', sections: 11 },
  { id: 'trip_prep', name: 'TRIP PREP', sections: 6 },
  { id: 'the_cruiser', name: 'THE CRUISER', sections: 8 },
  { id: 'outdoor_climbing', name: 'Outdoor Climbing Guide', sections: 3 },
  { id: 'injury_management', name: 'Injury Management & ACWR', sections: 3 },
];

const BY_ID = new Map(GUIDE_SUMMARIES.map((guide) => [guide.id, guide]));

/** Whether a program has a guide, without loading any of them. */
export function guideSummaryFor(programId: string): GuideSummary | undefined {
  return BY_ID.get(programId);
}
