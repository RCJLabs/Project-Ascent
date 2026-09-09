/**
 * Share cards, built as standalone SVG (PLAN.md §6.4).
 *
 * No library and no `foreignObject`: the card is plain SVG shapes and text,
 * which rasterises reliably through an `Image` and a canvas. That matters
 * because an offline app cannot fall back to a server renderer, and because
 * `html-to-image` inlines the page's CSS — including custom properties that
 * do not survive the trip.
 *
 * The figure comes from `climberShapes`, so the climber on a card is the
 * same climber as the one in the app rather than a second drawing.
 */

import type { Project } from '@/db/projects';
import type { AltimeterState } from '@/engine/altimeter';
import type { AvatarConfig } from '@/engine/avatar';
import { shortLabel } from '@/engine/dates';
import type { ProjectSummary } from '@/engine/projects';
import type { WeekReview } from '@/engine/review';
import type { XpState } from '@/engine/xp';
import { CLIMBER_VIEWBOX, climberShapes, shapeToSvg } from './climberShapes';
import { RIDGE } from './MountainMeter';

export const CARD = { width: 1080, height: 1350 } as const;

export interface CardTheme {
  bg: string;
  surface: string;
  ink: string;
  inkSoft: string;
  line: string;
  accent: string;
}

export const LIGHT_CARD: CardTheme = {
  bg: '#f6f8fa',
  surface: '#ffffff',
  ink: '#17222b',
  inkSoft: '#5b6b78',
  line: '#dde3e9',
  accent: '#2f7bb0',
};

export const DARK_CARD: CardTheme = {
  bg: '#10181f',
  surface: '#182430',
  ink: '#e8eef3',
  inkSoft: '#93a4b2',
  line: '#263542',
  accent: '#5aa3d4',
};

export interface CardStat {
  label: string;
  value: string;
}

export interface CardContent {
  eyebrow: string;
  headline: string;
  subhead?: string;
  stats: CardStat[];
  footnote?: string;
  /** Drawn in the middle band, when the card has a figure. */
  avatar?: AvatarConfig;
  /** 0..1 mountain fill, for altimeter cards. */
  mountain?: number;
}

/** SVG text is markup: names with an ampersand are not a crash waiting. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Long headlines step down rather than running off the card. */
function headlineSize(text: string): number {
  if (text.length <= 6) return 210;
  if (text.length <= 12) return 150;
  if (text.length <= 20) return 104;
  return 76;
}

/** A stat value has one column to live in, so long ones step down too. */
function statSize(value: string): number {
  if (value.length <= 5) return 60;
  if (value.length <= 9) return 46;
  return 34;
}

function clamp(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function buildCardSvg(content: CardContent, theme: CardTheme = LIGHT_CARD): string {
  const { width, height } = CARD;
  const pad = 88;
  const font = "'Helvetica Neue', Helvetica, Arial, sans-serif";
  const parts: string[] = [];

  parts.push(`<rect width="${width}" height="${height}" fill="${theme.bg}"/>`);
  parts.push(
    `<rect x="${pad / 2}" y="${pad / 2}" width="${width - pad}" height="${height - pad}" rx="48" fill="${theme.surface}"/>`,
  );

  const headline = clamp(content.headline, 30);
  parts.push(
    `<text x="${pad}" y="${pad + 84}" font-family="${font}" font-size="30" font-weight="700" letter-spacing="6" fill="${theme.inkSoft}">${escapeXml(content.eyebrow.toUpperCase())}</text>`,
  );
  parts.push(
    `<text x="${pad}" y="${pad + 84 + headlineSize(headline) * 0.92}" font-family="${font}" font-size="${headlineSize(headline)}" font-weight="800" fill="${theme.ink}">${escapeXml(headline)}</text>`,
  );
  if (content.subhead) {
    parts.push(
      `<text x="${pad}" y="${pad + 84 + headlineSize(headline) * 0.92 + 62}" font-family="${font}" font-size="40" font-weight="500" fill="${theme.inkSoft}">${escapeXml(clamp(content.subhead, 46))}</text>`,
    );
  }

  // ── Middle band: the figure, or the mountain ────────────────────────────
  const bandTop = 500;
  const bandHeight = 420;

  if (content.mountain !== undefined) {
    const level = Math.max(0, Math.min(1, content.mountain));
    const scale = bandHeight / 160;
    const y = 160 - level * 160;
    parts.push(`<g transform="translate(${pad} ${bandTop}) scale(${(width - pad * 2) / 320} ${scale})">`);
    parts.push(`<clipPath id="ridge"><path d="${RIDGE}"/></clipPath>`);
    parts.push(`<path d="${RIDGE}" fill="${theme.line}"/>`);
    parts.push(`<rect x="0" y="${y}" width="320" height="${160 - y}" fill="${theme.accent}" clip-path="url(#ridge)"/>`);
    parts.push(`</g>`);
  } else if (content.avatar) {
    const scale = bandHeight / CLIMBER_VIEWBOX.height;
    const drawn = CLIMBER_VIEWBOX.width * scale;
    parts.push(`<g transform="translate(${(width - drawn) / 2} ${bandTop}) scale(${scale})">`);
    for (const shape of climberShapes(content.avatar, {
      colors: { ground: theme.line, surface: theme.surface, accentGround: theme.inkSoft },
    })) {
      parts.push(shapeToSvg(shape));
    }
    parts.push(`</g>`);
  }

  // ── Stats row ──────────────────────────────────────────────────────────
  const stats = content.stats.slice(0, 4);
  if (stats.length > 0) {
    const statsY = 1072;
    const columnWidth = (width - pad * 2) / stats.length;
    parts.push(
      `<line x1="${pad}" x2="${width - pad}" y1="${statsY - 72}" y2="${statsY - 72}" stroke="${theme.line}" stroke-width="2"/>`,
    );
    stats.forEach((stat, i) => {
      const x = pad + columnWidth * i;
      const value = clamp(stat.value, 16);
      parts.push(
        `<text x="${x}" y="${statsY}" font-family="${font}" font-size="${statSize(value)}" font-weight="800" fill="${theme.ink}">${escapeXml(value)}</text>`,
      );
      parts.push(
        `<text x="${x}" y="${statsY + 44}" font-family="${font}" font-size="26" font-weight="700" letter-spacing="4" fill="${theme.inkSoft}">${escapeXml(stat.label.toUpperCase())}</text>`,
      );
    });
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  const footerY = height - pad - 8;
  if (content.footnote) {
    parts.push(
      `<text x="${pad}" y="${footerY - 62}" font-family="${font}" font-size="28" font-weight="500" fill="${theme.inkSoft}">${escapeXml(clamp(content.footnote, 64))}</text>`,
    );
  }
  parts.push(
    `<text x="${pad}" y="${footerY}" font-family="${font}" font-size="28" font-weight="800" letter-spacing="6" fill="${theme.accent}">PROJECT ASCENT</text>`,
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

// ── Card builders ─────────────────────────────────────────────────────────
//
// One function per moment worth sharing. They only shape content — the SVG
// is built above, so a card can be reviewed by reading a few strings.

export function recordCard(
  grade: string,
  date: string,
  avatar?: AvatarConfig,
  scale: 'V' | 'YDS' = 'V',
): CardContent {
  return {
    eyebrow: 'Personal record',
    headline: grade,
    subhead: `First ${scale === 'V' ? 'boulder' : 'route'} at this grade · ${shortLabel(date)}`,
    stats: [],
    ...(avatar ? { avatar } : {}),
    footnote: 'Logged, not claimed.',
  };
}

export function projectCard(
  project: Project,
  summary: ProjectSummary,
  avatar?: AvatarConfig,
): CardContent {
  return {
    eyebrow: 'Project sent',
    headline: project.name,
    subhead: `${project.grade} · ${project.setting === 'outdoor' ? 'outdoors' : 'indoors'}${project.location ? ` · ${project.location}` : ''}`,
    stats: [
      { label: 'Burns', value: String(summary.burns) },
      { label: 'Days', value: String(summary.days) },
      ...(summary.firstDate && summary.sendDate
        ? [{ label: 'Worked', value: `${daysApart(summary.firstDate, summary.sendDate)}d` }]
        : []),
    ],
    ...(avatar ? { avatar } : {}),
  };
}

function daysApart(from: string, to: string): number {
  return Math.max(
    0,
    Math.round((new Date(`${to}T00:00`).getTime() - new Date(`${from}T00:00`).getTime()) / 86_400_000),
  );
}

export function weekCard(review: WeekReview): CardContent {
  return {
    eyebrow: `${shortLabel(review.from)} – ${shortLabel(review.to)}`,
    headline: review.note.headline,
    subhead: `${review.sessions} of ${review.target} sessions`,
    stats: [
      { label: 'Sends', value: String(review.sends) },
      { label: 'Hours', value: (review.minutes / 60).toFixed(1) },
      { label: 'Feet', value: review.feet.toLocaleString() },
      { label: 'Load', value: String(review.load) },
    ],
    footnote: review.acwr === null ? undefined : `Acute:chronic ${review.acwr.toFixed(2)}`,
  };
}

export function altimeterCard(alt: AltimeterState): CardContent {
  const last = alt.reached.at(-1);
  return {
    eyebrow: 'Altimeter',
    headline: `${alt.feet.toLocaleString()} ft`,
    subhead: last ? `Past ${last.name}` : 'Every send, added up',
    stats: [
      { label: 'Metres', value: alt.meters.toLocaleString() },
      { label: 'Milestones', value: String(alt.reached.length) },
      ...(alt.next ? [{ label: 'Next', value: alt.next.name }] : []),
    ],
    mountain: alt.fraction,
    footnote: alt.next ? `${alt.toNext.toLocaleString()} ft to ${alt.next.name}` : 'The whole ladder is behind you',
  };
}

export function rankCard(xp: XpState, avatar?: AvatarConfig): CardContent {
  return {
    eyebrow: 'Rank',
    headline: xp.rank.title,
    subhead: `Level ${xp.progress.level}`,
    stats: [
      { label: 'XP', value: xp.total.toLocaleString() },
      ...(xp.next ? [{ label: 'Next rank', value: `Lvl ${xp.next.level}` }] : []),
    ],
    ...(avatar ? { avatar } : {}),
    footnote: 'Every point earned by climbing.',
  };
}
