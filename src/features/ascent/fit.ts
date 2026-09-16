/**
 * How wide to draw the wall (PLAN.md M226).
 *
 * Its own module because the arithmetic is the part that was wrong and the
 * measuring is the part a test cannot do: jsdom has no layout, so every
 * width and height a page reads there is zero. Split, the decision can be
 * checked against real numbers and the page is left with nothing but the
 * reading of them.
 *
 * The canvas is 360 by 640. It was `w-full`, so on a phone it came out 398
 * wide and **708 tall** — taller than the viewport before the heading and
 * the height read-out above it, which put the bottom of a running game below
 * the fold. Reported as "you have to scroll down to see the entire game",
 * and a game you have to scroll is a game you cannot play.
 *
 * Width was never the binding constraint. Height is.
 */

import { VIEW } from '@/engine/ascent/config';

/** Breathing room between the wall and whatever is under it. */
export const GAME_MARGIN = 12;

/**
 * The narrowest the wall may be squeezed to.
 *
 * It binds on a short landscape window, where fitting the height alone would
 * leave a strip too narrow to read three lanes in. Below this the page
 * scrolls again, which is the lesser of the two faults.
 */
export const MIN_GAME_WIDTH = 220;

/**
 * @param column how wide the content column is
 * @param room how much height is left below the HUD
 */
export function fitGameWidth(column: number, room: number): number {
  const fromRoom = room * (VIEW.width / VIEW.height);
  return Math.max(MIN_GAME_WIDTH, Math.min(column, fromRoom));
}

/** The height that width implies, which is what has to fit. */
export function gameHeight(width: number): number {
  return width * (VIEW.height / VIEW.width);
}
