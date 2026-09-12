// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { newProject, putProject } from '@/db/projects';
import { hydrate, renderAt, reset } from '@/test/render';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { TrainPage } from './TrainPage';

/**
 * Projects live under Train (PLAN.md M117).
 *
 * They had a tab until the bar went to five. The way in is a card on Train
 * beside Objectives, and the way back is Train — both checked, because a
 * page that lost its tab and gained no card is a page that disappeared.
 */
describe('projects under train', () => {
  it('is a card on Train that names what is being worked', async () => {
    await reset();
    await putProject(newProject({ name: 'The Nose of It', grade: 'V6', scale: 'V' }));
    await hydrate();
    renderAt('/train', <TrainPage />);
    await screen.findByRole('heading', { level: 1, name: 'Train' });
    const link = screen.getByText('Projects').closest('a')!;
    expect(link.getAttribute('href')).toBe('#/projects');
    expect(link.textContent).toContain('The Nose of It');
  });

  it('says what a project is when there is none', async () => {
    await reset();
    await hydrate();
    renderAt('/train', <TrainPage />);
    await screen.findByRole('heading', { level: 1, name: 'Train' });
    expect(screen.getByText('Projects').closest('a')!.textContent).toMatch(/Climbs you are working/);
  });

  it('goes back to Train', async () => {
    await reset();
    await hydrate();
    renderAt('/projects', <ProjectsPage />);
    await screen.findByRole('heading', { level: 1, name: 'Projects' });
    expect(screen.getByRole('link', { name: /Train/ }).getAttribute('href')).toBe('#/train');
  });
});
