// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadPrograms } from '@/content/programs';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { hydrate, renderAt, reset } from '@/test/render';
import { LogPage } from './LogPage';

/**
 * M112 on the page.
 *
 * The engine is tested in `engine/cooldown.test.ts`. What is left is the
 * wiring, and the two things the milestone insisted on: that the card reads
 * the session it sits on rather than a generic one, and that a rest day
 * does not get offered a cooldown for a session that did not happen.
 */

const DATE = '2026-03-07';

async function withSession(
  patch: Record<string, unknown> = {},
  activeProgramId?: string,
): Promise<void> {
  await loadPrograms();
  await reset();
  const created = await useSessions.getState().create(DATE);
  await useSessions.getState().update({ ...created, ...patch } as typeof created);
  await hydrate();
  // After `hydrate`, never before: it loads the stores from the database and
  // would discard this. The page resolves the session type out of the
  // *active* program rather than the session's own `programId`, so a rest
  // day only reads as one when that program is the one running.
  if (activeProgramId) useProfile.setState({ activeProgramId } as never);
}

const settle = () => new Promise((r) => setTimeout(r, 60));

const buttonSaying = (view: { container: HTMLElement }, re: RegExp) =>
  [...view.container.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''));

describe('the cooldown card', () => {
  it('offers itself on a session day', async () => {
    await withSession();
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();
    expect(view.container.textContent ?? '').toMatch(/Build me a cooldown/i);
  });

  it('sits below Effort, not above it', async () => {
    // The card is weighted by what the session loaded, and that is read out
    // of what the climber has entered. Above Effort it would be offering a
    // generic cooldown to someone who has not logged anything yet.
    await withSession();
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();
    const text = view.container.textContent ?? '';
    expect(text.indexOf('Build me a cooldown')).toBeGreaterThan(text.indexOf('Effort'));
  });

  it('builds one when asked', async () => {
    await withSession();
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();

    buttonSaying(view, /Build me a cooldown/i)!.click();
    await settle();

    const text = view.container.textContent ?? '';
    expect(text).toMatch(/stretches/i);
    expect(text).toMatch(/Swap/i);
  });

  it('names what the session worked, once there is something to read', async () => {
    // A climbing session loads fingers whether or not anything was written
    // down — that is `sessionParts`' rule, and this is the card proving it
    // reaches the page rather than staying in the engine.
    await withSession({
      climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    });
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();

    buttonSaying(view, /Build me a cooldown/i)!.click();
    await settle();

    expect(view.container.textContent ?? '').toMatch(/Weighted toward your/i);
  });

  it('claims nothing about what it does to you', async () => {
    await withSession({
      climbs: [{ id: 'c1', grade: 'V4', scale: 'V', count: 3, result: 'send' }],
    });
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();

    buttonSaying(view, /Build me a cooldown/i)!.click();
    await settle();

    // The milestone's own "never". The card is five minutes of stretching,
    // not a claim about injury, recovery or repair.
    const card = (view.container.textContent ?? '').slice(
      (view.container.textContent ?? '').indexOf('Cooldown'),
    );
    expect(card).not.toMatch(/prevents?|speeds? recovery|repairs?|heals?|protects? (you|your)/i);
  });

  it('leaves out what works an injured part, and says so', async () => {
    await withSession();
    useProfile.setState({
      injuries: [
        {
          id: 'i1',
          part: 'shoulder',
          status: 'injured',
          since: '2026-02-01',
          note: '',
          steps: [],
        },
      ],
    } as never);

    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();
    buttonSaying(view, /Build me a cooldown/i)!.click();
    await settle();

    expect(view.container.textContent ?? '').toMatch(/Left out because of your injuries/i);
  });
});

describe('the cost of the card', () => {
  it('keeps the stretches off the boot path', async () => {
    // `LogPage` cannot be deferred, so a static import here puts the twelve
    // stretches, their prose and the keyword scanner in the entry chunk of
    // every cold start — 1.59KB measured, for a card most visits never
    // open. `perf.test.ts` holds the number; this holds the mechanism.
    const { readFileSync } = await import('node:fs');
    const source = readFileSync('src/features/log/LogPage.tsx', 'utf8');
    expect(source).not.toMatch(/^import \{[^}]*\} from '@\/engine\/cooldown'/m);
    expect(source).not.toMatch(/^import \{[^}]*\} from '@\/engine\/tissueLoad'/m);
    expect(source).toContain("import('@/engine/cooldown')");
  });
});

describe('a rest day', () => {
  it('is not offered a cooldown', async () => {
    // Nothing happened to cool down from. The card lives in the branch for
    // days that had a session, which is the whole mechanism — but a branch
    // is easy to move and this is what notices.
    //
    // A rest day here is the session *type* resolving to one that declares
    // `isRest`, not a filled-in recovery checklist: the first draft of this
    // test set the checklist and got the ordinary session page, because
    // that is not what the page branches on.
    await withSession(
      {
        programId: 'base_camp',
        sessionTypeId: 'rest',
        restChecklist: { hydration: true, mobility: true, zone1: false, sleep: true },
      },
      'base_camp',
    );
    const view = renderAt(`/log/${DATE}`, <LogPage params={{ date: DATE }} />);
    await settle();
    expect(view.container.textContent ?? '').not.toMatch(/Build me a cooldown/i);
  });
});
