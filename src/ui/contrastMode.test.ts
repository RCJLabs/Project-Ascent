// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONTRAST_THEME_ID, CSS_VAR, DEFAULT_THEME_ID, getTheme } from './themes';
import { applyTheme } from '@/store/settings';

/**
 * What the system asking for more contrast actually gets (PLAN.md M61).
 *
 * This path reached for Slate, which was only the highest-contrast palette
 * that happened to exist. Nothing tested it, so nothing objected when a
 * theme built for the job arrived.
 */

const real = window.matchMedia;

function prefers(contrast: boolean, dark = false): void {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes('prefers-contrast') ? contrast : query.includes('dark') ? dark : false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia;
}

const painted = (key: keyof typeof CSS_VAR) =>
  document.documentElement.style.getPropertyValue(CSS_VAR[key]).trim();

afterEach(() => {
  window.matchMedia = real;
  document.documentElement.removeAttribute('style');
});

describe('a system asking for more contrast', () => {
  it('gets the theme built for it', () => {
    prefers(true);
    applyTheme('system', DEFAULT_THEME_ID);
    expect(painted('accent')).toBe(getTheme(CONTRAST_THEME_ID).light.accent);
  });

  it('gets its dark palette when the system is dark too', () => {
    prefers(true, true);
    applyTheme('system', DEFAULT_THEME_ID);
    expect(painted('accent')).toBe(getTheme(CONTRAST_THEME_ID).dark.accent);
  });

  // An explicit choice outranks a system preference.
  it('does not overrule a theme the climber picked', () => {
    prefers(true);
    applyTheme('light', 'gritstone');
    expect(painted('accent')).toBe(getTheme('gritstone').light.accent);
  });

  it('leaves the default alone when the system asks for nothing', () => {
    prefers(false);
    applyTheme('light', DEFAULT_THEME_ID);
    // The default is painted by index.css, so the inline properties are
    // cleared rather than set.
    expect(painted('accent')).toBe('');
  });

  // Two places have to agree about which palette this is: the code that
  // applies it, and the sentence that tells a climber what will happen.
  it('is the palette Settings says it is', () => {
    const copy = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8');
    expect(copy).toContain(`the ${getTheme(CONTRAST_THEME_ID).name} palette is used automatically`);
  });
});
