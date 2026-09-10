// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { getProgram, registerAdaptations } from '@/content/programs';
import { hydrateProfile, useProfile } from '@/store/profile';
import { getDb } from '@/db';
import { renderAt, reset } from '@/test/render';
import { StartProgramPage } from '@/features/plan/StartProgramPage';
import { GuidePage } from '@/features/guides/GuidePage';

/**
 * Running a program over fewer weeks (PLAN.md M56).
 *
 * The engine is tested where it lives. What matters here is the wiring: that
 * the length a climber picked reaches `getProgram`, which fourteen call
 * sites read and two pure engines depend on, and that the screens which
 * quote week numbers say which block they are quoting.
 */

beforeEach(() => {
  registerAdaptations({});
  useProfile.setState({ adaptations: {} });
});

describe('the length reaches the program registry', () => {
  it('hands back the adapted program to every caller of getProgram', async () => {
    await reset();
    expect(getProgram('gravity_defied')!.weeks).toBe(12);

    useProfile.getState().setProgramLength('gravity_defied', 6);
    const six = getProgram('gravity_defied')!;
    expect(six.weeks).toBe(6);
    expect(six.adaptedFrom).toBe(12);
    // Phases survive with their ids, or every per-phase prescription loses
    // the thing it is keyed by.
    useProfile.getState().setProgramLength('gravity_defied', null);
    const written = getProgram('gravity_defied')!;
    useProfile.getState().setProgramLength('gravity_defied', 6);
    expect(getProgram('gravity_defied')!.phases.map((p) => p.id)).toEqual(
      written.phases.map((p) => p.id),
    );

    useProfile.getState().setProgramLength('gravity_defied', null);
    expect(getProgram('gravity_defied')!.weeks).toBe(12);
    expect(getProgram('gravity_defied')!.adaptedFrom).toBeUndefined();
  });

  // A backup is a file, and a file can say anything. This is the path it
  // takes: stored record -> hydrateProfile -> the registry the engines read.
  it('ignores a nonsense length arriving from a stored record', async () => {
    await reset();
    const db = await getDb();
    const record = (await db.get('profile', 'active-plan'))?.value ?? {};
    await db.put('profile', {
      key: 'active-plan',
      value: {
        ...(record as object),
        adaptations: { gravity_defied: 'six', iron_grip: -3, lockdown: 0, the_siege: 6 },
      },
    });
    await hydrateProfile();

    expect(getProgram('gravity_defied')!.weeks).toBe(12);
    expect(getProgram('iron_grip')!.weeks).toBe(12);
    expect(getProgram('lockdown')!.weeks).toBe(12);
    // And the one that made sense still applies.
    expect(getProgram('the_siege')!.weeks).toBe(6);
    expect(useProfile.getState().adaptations).toEqual({ the_siege: 6 });
  });
});

describe('choosing a length', () => {
  async function start(id = 'gravity_defied') {
    await reset();
    useProfile.setState({ adaptations: {} });
    renderAt(`/train/${id}/start`, <StartProgramPage params={{ id }} />);
  }

  it('offers shorter blocks and the program as written', async () => {
    await start();
    expect(screen.getByText('How long you have')).toBeTruthy();
    expect(screen.getByText('12 weeks, as written')).toBeTruthy();
    expect(screen.getByText('6 weeks')).toBeTruthy();
  });

  it('never offers fewer weeks than the program has phases', async () => {
    await start();
    expect(screen.queryByText('3 weeks')).toBeNull();
  });

  it('says what the phases become and where the deload lands', async () => {
    await start();
    fireEvent.click(screen.getByText('6 weeks'));
    expect(screen.getByText(/run 2, 2, 2 weeks instead of 4, 4, 4/)).toBeTruthy();
    expect(screen.getByText(/Deload week 4\./)).toBeTruthy();
  });

  // The sessions are the same; there are fewer of them. Saying that before
  // the climber commits is the difference between an adaptation and a lie.
  it('warns that the guide still describes the written block', async () => {
    await start();
    fireEvent.click(screen.getByText('6 weeks'));
    expect(screen.getByText(/The written program is 12 weeks, and its guide still describes/)).toBeTruthy();
  });

  // The last mile: picking a length and never storing it looks identical on
  // this screen and is wrong everywhere else in the app.
  it('saves the length when the program starts', async () => {
    await start();
    fireEvent.click(screen.getByText('6 weeks'));
    fireEvent.click(screen.getByText('Start this program'));
    expect(useProfile.getState().adaptations['gravity_defied']).toBe(6);
    expect(getProgram('gravity_defied')!.weeks).toBe(6);
  });

  it('stores nothing when the program is started as written', async () => {
    await start();
    useProfile.getState().setProgramLength('gravity_defied', 6);
    renderAt('/train/gravity_defied/start', <StartProgramPage params={{ id: 'gravity_defied' }} />);
    fireEvent.click(screen.getByText('12 weeks, as written'));
    fireEvent.click(screen.getByText('Start this program'));
    expect(useProfile.getState().adaptations['gravity_defied']).toBeUndefined();
    expect(getProgram('gravity_defied')!.weeks).toBe(12);
  });

  it('does not warn when the program is run as written', async () => {
    await start();
    expect(screen.queryByText(/its guide still describes/)).toBeNull();
  });
});

describe('the guide of a program being run short', () => {
  it('says which block its week numbers belong to', async () => {
    await reset();
    useProfile.getState().setProgramLength('gravity_defied', 6);
    renderAt('/guides/gravity_defied', <GuidePage params={{ id: 'gravity_defied' }} />);
    expect(screen.getByText(/This guide describes the written 12-week block/)).toBeTruthy();
  });

  it('says nothing when the program is run as written', async () => {
    await reset();
    renderAt('/guides/gravity_defied', <GuidePage params={{ id: 'gravity_defied' }} />);
    expect(screen.queryByText(/This guide describes the written/)).toBeNull();
  });
});
