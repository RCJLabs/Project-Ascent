import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadPrograms } from '@/content/programs';
import type { Session } from '@/db/sessions';
import { buildReview } from '@/engine/review';
import { reviewYear } from '@/engine/yearReview';
import { partnerTally } from '@/engine/partners';
import { buildCardSvg, weekCard, yearCard } from './shareCard';

/**
 * A partner's name never leaves on a picture (PLAN.md M237).
 *
 * The backup and the CSV are the climber's own data going to their own disk,
 * and a name dropped from those would make a backup that silently loses
 * history. A **share card** is different in kind: it is an image made to be
 * posted, and the person named on it never installed this app and was never
 * asked.
 *
 * So this is the one hard rule of that milestone, and it is checked two ways
 * — against the rendered SVG of the cards the log can build, and against the
 * source, because a card type added later would pass the first check by not
 * existing yet.
 */

beforeAll(async () => {
  await loadPrograms();
});

/** A name no card could produce by accident. */
const NAME = 'Zmarglebeth';

/** Inside the logged span, so both cards have something to render. */
const DAY = '2026-02-23';

function log(): Session[] {
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(Date.UTC(2026, 1, 1 + i * 2)).toISOString().slice(0, 10);
    return {
      id: `${date}#0`,
      date,
      planned: false,
      completed: true,
      rewarded: true,
      mode: 'indoor',
      rpe: 7,
      durationMin: 60,
      warmup: true,
      partners: [NAME],
      notes: `Climbed with ${NAME}`,
      climbs: [
        { id: `a${i}`, grade: 'V4', scale: 'V', count: 3, result: 'send', style: 'redpoint' },
      ],
      createdAt: `${date}T18:00:00.000Z`,
      updatedAt: `${date}T18:00:00.000Z`,
    } as Session;
  });
}

describe('a card built from a log full of names', () => {
  const sessions = log();
  const week = buildReview({ sessions, today: DAY });
  const year = reviewYear({ sessions, records: [], today: DAY }, 2026);

  it('has the name in the log, and cards with something on them', () => {
    // The trap M195 exists for: a probe that cannot find a known-present
    // instance is not a probe. A card of an empty week would pass every
    // check below by having nothing on it at all.
    expect(partnerTally(sessions)[0]).toMatchObject({ name: NAME, sessions: 12 });
    expect(week.sessions).toBeGreaterThan(0);
    expect(year.totals.sessions).toBe(12);
  });

  it('never carries it on the week card', () => {
    expect(buildCardSvg(weekCard(week))).not.toContain(NAME);
  });

  it('never carries it on the year card', () => {
    expect(buildCardSvg(yearCard(year))).not.toContain(NAME);
  });

  /**
   * And the source, because the two checks above can only speak for the two
   * cards that read the log. The other five build from a project, an
   * altimeter, a rank — and a card added next year that read `partners`
   * would ship green against all of them.
   */
  it('is not something any card builder has ever read', () => {
    const source = readFileSync('src/ui/shareCard.ts', 'utf8');
    expect(source).not.toMatch(/\bpartners\b/);
    // Nor the notes, which are where a climber would have written a name
    // before this field existed — and still might.
    expect(source).not.toMatch(/\.notes\b/);
  });
});
