// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { ProjectDetailPage } from './ProjectDetailPage';
import { hydrate, renderAt } from '@/test/render';

describe('a project that is not there', () => {
  it('names where you have landed', async () => {
    // M41. This branch had no heading of any kind, and the heading sweep in
    // `a11y.test.ts` passed the whole time because it reads whether the
    // *file* contains a `PageHeader` — which it does, on the happy path.
    await hydrate();
    const { findByRole } = renderAt('/projects/nope', <ProjectDetailPage params={{ id: 'nope' }} />);
    expect(await findByRole('heading', { level: 1 })).toHaveProperty('textContent', 'Not found');
  });
});
