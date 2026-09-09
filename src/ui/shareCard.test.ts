import { describe, expect, it } from 'vitest';
import { newProject } from '@/db/projects';
import { newSession, type Session } from '@/db/sessions';
import { deriveAltimeter } from '@/engine/altimeter';
import { deriveAvatar } from '@/engine/avatar';
import { summariseProject } from '@/engine/projects';
import { buildReview } from '@/engine/review';
import { deriveXp } from '@/engine/xp';
import {
  CARD,
  DARK_CARD,
  LIGHT_CARD,
  altimeterCard,
  buildCardSvg,
  escapeXml,
  projectCard,
  rankCard,
  recordCard,
  weekCard,
} from './shareCard';

const TODAY = '2026-09-09';
let counter = 0;

function session(date: string, climbs: Record<string, unknown>[] = []): Session {
  return newSession(date, counter++, {
    completed: true,
    rpe: 7,
    durationMin: 90,
    climbs: climbs.map((c) => ({
      id: `c${counter++}`,
      scale: 'V' as const,
      count: 1,
      result: 'send' as const,
      ...c,
    })) as Session['climbs'],
  });
}

describe('escaping', () => {
  it('makes a name safe to put inside markup', () => {
    expect(escapeXml('Rock & Roll <V7>')).toBe('Rock &amp; Roll &lt;V7&gt;');
    expect(escapeXml('The "Prow"')).toBe('The &quot;Prow&quot;');
  });

  it('carries an ampersand through a whole card without breaking it', () => {
    const svg = buildCardSvg(recordCard('V7', TODAY));
    expect(svg.startsWith('<svg')).toBe(true);
    const named = buildCardSvg({ eyebrow: 'x', headline: 'Sticks & Stones', stats: [] });
    expect(named).toContain('Sticks &amp; Stones');
    expect(named).not.toMatch(/headline.*&(?!amp;|lt;|gt;|quot;)/);
  });
});

describe('the card', () => {
  it('is a standalone SVG at the size it claims', () => {
    const svg = buildCardSvg({ eyebrow: 'Rank', headline: 'Crusher', stats: [] });
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`width="${CARD.width}"`);
    expect(svg).toContain(`height="${CARD.height}"`);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('never leaves an undefined in the markup', () => {
    const cards = [
      recordCard('V7', TODAY),
      weekCard(buildReview({ sessions: [session(TODAY, [{ grade: 'V4' }])], today: TODAY })),
      altimeterCard(deriveAltimeter([session(TODAY, [{ grade: 'V4' }])], { today: TODAY })),
      rankCard(deriveXp({ sessions: [session(TODAY)] })),
      { eyebrow: 'x', headline: 'y', stats: [] },
    ];
    for (const card of cards) {
      for (const theme of [LIGHT_CARD, DARK_CARD]) {
        const svg = buildCardSvg(card, theme);
        expect(svg).not.toContain('undefined');
        expect(svg).not.toContain('NaN');
        expect(svg).not.toContain('null');
      }
    }
  });

  it('paints both themes from their own tokens', () => {
    const card = { eyebrow: 'Rank', headline: 'Crusher', stats: [] };
    expect(buildCardSvg(card, LIGHT_CARD)).toContain(LIGHT_CARD.bg);
    expect(buildCardSvg(card, DARK_CARD)).toContain(DARK_CARD.bg);
    expect(buildCardSvg(card, DARK_CARD)).not.toContain(LIGHT_CARD.surface);
  });

  it('steps the headline down as it gets longer, and truncates the runaway', () => {
    const size = (headline: string) =>
      Number(buildCardSvg({ eyebrow: 'x', headline, stats: [] }).match(/font-size="(\d+)" font-weight="800"/)![1]);
    expect(size('V7')).toBeGreaterThan(size('Slab Technician'));
    expect(size('Slab Technician')).toBeGreaterThan(size('An extremely long project name'));

    const long = buildCardSvg({ eyebrow: 'x', headline: 'x'.repeat(80), stats: [] });
    expect(long).toContain('…');
  });

  it('draws the climber when given one, and the mountain when given a level', () => {
    const avatar = deriveAvatar({ level: 40, feet: 20_000 });
    expect(buildCardSvg(recordCard('V7', TODAY, avatar))).toContain('<polyline');

    const alt = altimeterCard(deriveAltimeter([session(TODAY, [{ grade: 'V4', count: 40 }])], { today: TODAY }));
    const svg = buildCardSvg(alt);
    expect(svg).toContain('clipPath');
    expect(svg).not.toContain('<polyline');
  });

  it('steps a long stat value down so it stays in its column', () => {
    const sizeOf = (value: string) => {
      const svg = buildCardSvg({ eyebrow: 'x', headline: 'y', stats: [{ label: 'L', value }] });
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return Number(svg.match(new RegExp(`font-size="(\\d+)"[^>]*>${escaped}</text>`))![1]);
    };
    expect(sizeOf('3,140')).toBeGreaterThan(sizeOf('Mt. Whitney'));
  });

  it('shows at most four stats', () => {
    const svg = buildCardSvg({
      eyebrow: 'x',
      headline: 'y',
      stats: Array.from({ length: 9 }, (_, i) => ({ label: `L${i}`, value: String(i) })),
    });
    expect(svg).toContain('L3');
    expect(svg).not.toContain('L4');
  });
});

describe('the builders', () => {
  it('describes a record', () => {
    const card = recordCard('5.12a', TODAY, undefined, 'YDS');
    expect(card.headline).toBe('5.12a');
    expect(card.subhead).toContain('route');
  });

  it('describes a project send from its own history', () => {
    const sessions = [
      newSession('2026-09-01', counter++, {
        completed: true,
        climbs: [],
        projectAttempts: [{ id: 'a', projectId: 'p1', outcome: 'fell-crux', count: 6 }],
      }),
      newSession('2026-09-07', counter++, {
        completed: true,
        climbs: [],
        projectAttempts: [{ id: 'b', projectId: 'p1', outcome: 'send', count: 1 }],
      }),
    ];
    const project = newProject({
      id: 'p1',
      name: 'The Prow',
      grade: 'V7',
      scale: 'V',
      setting: 'outdoor',
      location: 'Camp 4',
      status: 'sent',
      sentDate: '2026-09-07',
    });
    const card = projectCard(project, summariseProject('p1', sessions, TODAY));
    expect(card.headline).toBe('The Prow');
    expect(card.subhead).toBe('V7 · outdoors · Camp 4');
    expect(card.stats).toContainEqual({ label: 'Burns', value: '7' });
    expect(card.stats).toContainEqual({ label: 'Worked', value: '6d' });
  });

  it('leads a week card with the coaching note', () => {
    const review = buildReview({ sessions: [session(TODAY, [{ grade: 'V4' }])], today: TODAY });
    const card = weekCard(review);
    expect(card.headline).toBe(review.note.headline);
    expect(card.stats.map((s) => s.label)).toEqual(['Sends', 'Hours', 'Feet', 'Load']);
  });

  it('shows the altimeter with its mountain level', () => {
    const alt = deriveAltimeter([session(TODAY, [{ grade: 'V4', count: 100 }])], { today: TODAY });
    const card = altimeterCard(alt);
    expect(card.headline).toBe('1,500 ft');
    expect(card.mountain).toBeCloseTo(alt.fraction);
  });

  it('shows the rank, and says where the points came from', () => {
    const card = rankCard(deriveXp({ sessions: [session(TODAY)] }));
    expect(card.eyebrow).toBe('Rank');
    expect(card.footnote).toContain('climbing');
  });
});
