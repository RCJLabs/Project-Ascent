// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { getProgram } from '@/content/programs';
import { EQUIPMENT_LABELS } from '@/engine/customProgram';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProgramDetailPage } from './ProgramDetailPage';

/**
 * The program page on one screen (PLAN.md M121).
 *
 * What it is for, how long, what a week looks like, what you need, the
 * guide, and Start — and everything else a tap away rather than a scroll.
 */

async function page(id = 'iron_grip'): Promise<void> {
  await reset();
  await hydrate();
  renderAt(`/train/${id}`, <ProgramDetailPage params={{ id }} />);
  await screen.findByRole('heading', { level: 1 });
}

const titles = () => [...document.querySelectorAll('h2, h3')].map((h) => h.textContent?.trim());

describe('the overview', () => {
  it('says what, how long, the week, what you need, the guide and start', async () => {
    await page();
    const program = getProgram('iron_grip')!;
    const text = document.body.textContent ?? '';
    expect(text).toContain(program.intro.pitch);
    expect(screen.getByText('Weeks').previousElementSibling?.textContent).toBe(String(program.weeks));
    expect(text).toContain(`A week · ${program.recommendedLayout!.name}`);
    expect(text).toContain('What you need');
    for (const e of program.equipment) expect(text).toContain(EQUIPMENT_LABELS[e]);
    expect(screen.getByText('Read the full guide').closest('a')?.getAttribute('href')).toMatch(/^#\/guides\//);
    expect(screen.getByText('Start this program').closest('a')?.getAttribute('href')).toBe('#/train/iron_grip/start');
  });

  it('keeps the week-by-week behind What’s in it', async () => {
    await page();
    const t = titles();
    for (const folded of ['How it runs', 'Benchmarks tested', 'What comes next', 'Goals']) {
      expect(t, `${folded} should be folded`).not.toContain(folded);
    }
    expect(screen.queryByRole('button', { name: /Weeks 1-/ })).toBeNull();
    const button = screen.getByRole('button', { name: /What's in it/ });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('unfolds every session, phase by phase', async () => {
    await page();
    fireEvent.click(screen.getByRole('button', { name: /What's in it/ }));
    const program = getProgram('iron_grip')!;
    const t = titles();
    expect(t).toContain('How it runs');
    expect(t).toContain('Benchmarks tested');
    expect(t).toContain('What comes next');
    for (const type of program.sessionTypes.filter((s) => !s.isRest)) {
      expect(t, type.name).toContain(type.name);
    }
    expect(screen.getByRole('button', { name: /^Less/ }).getAttribute('aria-expanded')).toBe('true');
    // The phase tabs work inside the fold.
    const second = program.phases[1]!;
    // Phase names carry parentheses ("The Hammer (Max Hangs)"), so the name
    // is matched as text rather than as a pattern.
    fireEvent.click(screen.getByRole('button', { name: (n) => n.includes(second.name) }));
    expect(document.body.textContent).toContain(second.description);
  });

  it('keeps the prerequisites in view, because they are a reason not to start', async () => {
    const withPrereq = ['iron_grip', 'peak_performance', 'the_siege', 'lockdown'].find((id) => getProgram(id)?.prerequisites);
    expect(withPrereq, 'no program with prerequisites to test').toBeDefined();
    await page(withPrereq!);
    expect(screen.getByText('Before you start')).toBeTruthy();
    expect(document.body.textContent).toContain(getProgram(withPrereq!)!.prerequisites!.note);
  });

  it('says a log-only mode needs nothing at all, and has no start button', async () => {
    await page('general_training');
    expect(screen.queryByText('Start this program')).toBeNull();
    expect(document.body.textContent).toContain('What you need');
    expect(document.body.textContent).toContain(EQUIPMENT_LABELS.none);
  });
});
