// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { ReactElement } from 'react';
import { hydrate, renderAt } from '@/test/render';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { SessionEditorPage } from '@/features/builder/SessionEditorPage';
import { GuidePage } from '@/features/guides/GuidePage';
import { InjuryPage } from '@/features/injury/InjuryPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';
import { StartProgramPage } from '@/features/plan/StartProgramPage';

/**
 * Every record route answers a missing record the same way (PLAN.md M41, M43).
 *
 * `notFound.test.ts` holds the same rule by reading source: does the file
 * render `<RecordNotFound`. That version passed when the JSX was replaced by
 * a bare card, because the leftover import still matched — and it can never
 * see what a climber actually gets. This one mounts each page on an id that
 * names nothing and reads the heading off the document.
 */
const PAGES: [string, string, ReactElement][] = [
  ['/build/:id', '/build/nope', <BuilderPage params={{ id: 'nope' }} />],
  ['/build/:id/session/:typeId', '/build/nope/session/nope', <SessionEditorPage params={{ id: 'nope', typeId: 'nope' }} />],
  ['/train/:id', '/train/nope', <ProgramDetailPage params={{ id: 'nope' }} />],
  ['/train/:id/start', '/train/nope/start', <StartProgramPage params={{ id: 'nope' }} />],
  ['/objectives/:id', '/objectives/nope', <ObjectiveDetailPage params={{ id: 'nope' }} />],
  ['/assessments/:id', '/assessments/nope', <MetricDetailPage params={{ id: 'nope' }} />],
  ['/projects/:id', '/projects/nope', <ProjectDetailPage params={{ id: 'nope' }} />],
  ['/injury/:id', '/injury/nope', <InjuryPage params={{ id: 'nope' }} />],
  ['/guides/:id', '/guides/nope', <GuidePage params={{ id: 'nope' }} />],
];

describe('a record that is not there', () => {
  it.each(PAGES)('%s says so, with a heading', async (_route, path, element) => {
    await hydrate();
    const view = renderAt(path, element);
    const h1 = await view.findByRole('heading', { level: 1 });
    expect(h1.textContent).toBe('Not found');
  });

  it.each(PAGES)('%s offers a way back', async (_route, path, element) => {
    await hydrate();
    const view = renderAt(path, element);
    await view.findByRole('heading', { level: 1 });
    const links = view.container.querySelectorAll('a[href]');
    expect(links.length, 'a dead end is not an answer').toBeGreaterThan(0);
  });

  it('does not navigate away from the address that failed', async () => {
    // Three of these used to replace the URL with the index — `/injury` with
    // *Settings* — which throws away the only evidence of what happened.
    for (const [, path, element] of PAGES) {
      await hydrate();
      renderAt(path, element);
      expect(window.location.hash, `${path} redirected`).toBe(`#${path}`);
    }
  });
});
