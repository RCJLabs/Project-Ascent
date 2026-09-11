// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newProject, putProject } from '@/db/projects';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ENOUGH } from '@/engine/projectHistory';

/** What the projects cost, on the page that lists them (PLAN.md M69). */

/** A project sent after `burns` burns spread over `days` sessions. */
async function sendOne(id: string, grade: string, dates: string[], burns: number): Promise<void> {
  await putProject({
    ...newProject({ name: `Project ${id}`, grade, scale: 'V' }),
    id,
    status: 'sent',
    sentDate: dates.at(-1)!,
  });
  dates.forEach(async (date, i) => {
    const last = i === dates.length - 1;
    await putSession({
      ...newSession(date, 0, { completed: true }),
      projectAttempts: Array.from({ length: burns }, (_, n) => ({
        projectId: id,
        outcome: last && n === burns - 1 ? 'send' : 'fell-high',
      })),
    } as never);
  });
  await new Promise((r) => setTimeout(r, 0));
}

describe('the cost card', () => {
  it('says nothing until something has been sent', async () => {
    await reset();
    await putProject({ ...newProject({ name: 'Open', grade: 'V4', scale: 'V' }), id: 'open' });
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    expect(screen.queryByText('What they cost')).toBeNull();
  });

  it('shows a grade as soon as one is sent, and marks it as one climb', async () => {
    await reset();
    await sendOne('a', 'V5', ['2026-01-01', '2026-01-05'], 3);
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    expect(screen.getByText('What they cost')).toBeTruthy();
    expect(screen.getByText(new RegExp(`Fewer than ${ENOUGH} sends`))).toBeTruthy();
  });

  // Two sends is an anecdote; the card should not read as a pattern.
  it('only speaks in general once there is enough behind it', async () => {
    await reset();
    await sendOne('a', 'V5', ['2026-01-01'], 4);
    await sendOne('b', 'V5', ['2026-02-01'], 6);
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    expect(screen.queryByText(/Across \d+ sends/)).toBeNull();

    await sendOne('c', 'V5', ['2026-03-01'], 5);
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    expect(screen.getByText(/Across 3 sends/)).toBeTruthy();
  });
});
