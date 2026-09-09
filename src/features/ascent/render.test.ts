import { describe, expect, it } from 'vitest';
import { THEME_UNLOCKS, WALL_THEMES, buildWall, themeForHeight } from './render';

describe('wall themes', () => {
  it('unlock by height, keeping the best one earned', () => {
    expect(themeForHeight(0, false)).toBe(WALL_THEMES.granite);
    expect(themeForHeight(2_899, false)).toBe(WALL_THEMES.granite);
    expect(themeForHeight(2_900, false)).toBe(WALL_THEMES.sandstone);
    expect(themeForHeight(500_000, false)).toBe(WALL_THEMES.alpine);
  });

  it('give a rest day its own sky, whatever you have unlocked', () => {
    expect(themeForHeight(0, true)).toBe(WALL_THEMES.recovery);
    expect(themeForHeight(500_000, true)).toBe(WALL_THEMES.recovery);
  });

  it('are all complete palettes, so no colour is ever undefined', () => {
    const keys = Object.keys(WALL_THEMES.granite!);
    for (const [name, palette] of Object.entries(WALL_THEMES)) {
      expect(Object.keys(palette).sort(), name).toEqual(keys.sort());
      for (const value of Object.values(palette)) expect(value, name).toBeTruthy();
    }
    for (const unlock of THEME_UNLOCKS) expect(WALL_THEMES[unlock.id], unlock.id).toBeDefined();
  });
});

describe('the wall pattern', () => {
  it('is the same for one seed and different for another', () => {
    expect(buildWall(42)).toEqual(buildWall(42));
    expect(buildWall(42)).not.toEqual(buildWall(43));
  });

  it('never cuts more than a lane out of the screen', () => {
    const wall = buildWall(7, 64);
    for (const depth of [...wall.left, ...wall.right]) {
      expect(depth).toBeGreaterThan(0);
      expect(depth).toBeLessThan(60);
    }
  });
});
