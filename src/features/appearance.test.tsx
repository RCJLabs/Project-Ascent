// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { DEFAULT_PALETTE } from '@/engine/avatar';
import { FIGURES, HAIR_TONES, freeOutfits } from '@/engine/kits';
import { hydrateProfile, useProfile } from '@/store/profile';
import { writesSettled } from '@/store/writes';
import { getDb } from '@/db/db';
import { hydrate, renderAt, reset } from '@/test/render';
import { GamePage } from '@/features/game/GamePage';

/**
 * The two choices added in M225, on the card that holds them.
 *
 * The figure is asked for in the user's own words — "the ability to choose
 * between male and female" — and the hair is what makes that choice legible
 * at the size a profile picture is drawn. Both are stored, so both have to
 * survive a reload; the shop already proves the kits do.
 */
async function openTheCard(): Promise<void> {
  await reset();
  await hydrate();
  renderAt('/game', <GamePage />);
}

describe('choosing a figure', () => {
  it('offers both builds and starts on the one every install already has', async () => {
    await openTheCard();
    for (const { label } of FIGURES) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Male' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Female' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('changes the figure, and says which one is on', async () => {
    await openTheCard();
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    expect(useProfile.getState().avatarFigure).toBe('female');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Female' }).getAttribute('aria-pressed')).toBe('true'),
    );
  });

  it('survives a reload', async () => {
    await openTheCard();
    fireEvent.click(screen.getByRole('button', { name: 'Female' }));
    await writesSettled();
    // Forget it in memory, then load the way boot does.
    useProfile.setState({ avatarFigure: 'male' });
    await hydrateProfile();
    expect(useProfile.getState().avatarFigure).toBe('female');
  });

  it('reads anything else in the file as the default', async () => {
    // A backup is whatever was in the file, and every save written before
    // M225 has no key here at all.
    await reset();
    for (const stored of ['a horse', undefined, 42]) {
      const db = await getDb();
      await db.put('profile', { key: 'active-plan', value: { avatarFigure: stored } });
      useProfile.setState({ avatarFigure: 'female' });
      await hydrateProfile();
      expect(useProfile.getState().avatarFigure, String(stored)).toBe('male');
    }
    // The control: the one value that is not the default does come back.
    const db = await getDb();
    await db.put('profile', { key: 'active-plan', value: { avatarFigure: 'female' } });
    await hydrateProfile();
    expect(useProfile.getState().avatarFigure).toBe('female');
  });
});

describe('choosing hair', () => {
  it('offers every tone and changes only that colour', async () => {
    await openTheCard();
    const swatches = HAIR_TONES.map((tone) =>
      screen.getByRole('button', { name: `Hair colour ${tone}` }),
    );
    expect(swatches).toHaveLength(HAIR_TONES.length);
    const before = useProfile.getState().avatarPalette;
    fireEvent.click(swatches[4]!);
    const after = useProfile.getState().avatarPalette;
    expect(after.hair).toBe(HAIR_TONES[4]);
    expect({ ...after, hair: before.hair }).toEqual(before);
  });

  it('is not something a kit may set', async () => {
    // `wear()` patches the four colours an outfit owns. Hair is not one of
    // them, and neither is skin — a kit is clothing.
    await openTheCard();
    useProfile.getState().setAvatarPalette({ hair: HAIR_TONES[0] });
    fireEvent.click(screen.getByText(freeOutfits()[1]!.name).closest('button')!);
    await waitFor(() =>
      expect(useProfile.getState().avatarPalette.top).toBe(freeOutfits()[1]!.top),
    );
    expect(useProfile.getState().avatarPalette.hair).toBe(HAIR_TONES[0]);
  });

  it('starts on the default rather than on nothing', async () => {
    // A palette saved before M225 has no `hair` key; the hydrate merge is
    // what stops the figure being drawn with `fill="undefined"`.
    await reset();
    const db = await getDb();
    await db.put('profile', { key: 'active-plan', value: { avatarPalette: { top: '#123456' } } });
    await hydrateProfile();
    expect(useProfile.getState().avatarPalette.hair).toBe(DEFAULT_PALETTE.hair);
    expect(useProfile.getState().avatarPalette.top).toBe('#123456');
  });
});
