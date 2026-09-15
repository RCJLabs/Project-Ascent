// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { deriveAvatar } from '@/engine/avatar';
import { Avatar } from './Avatar';
import { STANDING } from './climberShapes';

/**
 * The portrait faces you (PLAN.md M209).
 *
 * The figure was a back view everywhere until M209, which is right on a
 * wall and wrong on a character sheet. Nothing rendered this component in a
 * test before, so the one line that decides which way it points — `facing:
 * 'front'` — had no guard on it at all, and flipping it back would have
 * shipped silently.
 */
describe('the climber portrait', () => {
  const svg = (level: number) => {
    const { container } = render(
      <Avatar config={deriveAvatar({ level, vitality: 'worked', feet: 0 })} />,
    );
    return container.querySelector('svg')!;
  };

  it('draws a face, which the climbing figure does not have', () => {
    const eyes = [...svg(0).querySelectorAll('circle')].filter(
      (c) => Number(c.getAttribute('r')) < 5,
    );
    expect(eyes).toHaveLength(2);
    expect(eyes[0]!.getAttribute('cx')).not.toBe(eyes[1]!.getAttribute('cx'));
  });

  it('stands, rather than hanging off a hold', () => {
    const head = [...svg(0).querySelectorAll('circle')].find(
      (c) => c.getAttribute('r') === '15',
    )!;
    expect(Number(head.getAttribute('cy'))).toBe(STANDING.steady.head[1]);
  });

  it('keeps its label, which is what a screen reader has to go on', () => {
    expect(svg(40).getAttribute('aria-label')).toBe('Your climber: On the sharp end');
  });
});
