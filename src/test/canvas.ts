// @vitest-environment jsdom
import { vi } from 'vitest';

/**
 * Playing a run to its end, in jsdom (PLAN.md M219, shared at M226).
 *
 * The frame loop bails on `canvas.getContext('2d')`, which jsdom returns
 * null for — so a test that clicks *Climb* and asserts on the store proves
 * nothing, because the run never starts. That is what M219's first version
 * did. A context that accepts every call, a measurable canvas and a clock
 * that advances per frame make the loop run for real.
 *
 * Here rather than inside one test file because M226 needed it a second
 * time, and a copy of this is a copy of every trap in it.
 */
export function playableCanvas(): () => void {
  const sink: unknown = new Proxy(function () {} as object, {
    get: () => sink,
    apply: () => sink,
    set: () => true,
  });
  const context = vi
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(sink as CanvasRenderingContext2D);
  const width = vi
    .spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get')
    .mockReturnValue(430);

  // jsdom has no Path2D, and the renderer builds one per climber limb.
  const hadPath2D = 'Path2D' in globalThis;
  const previousPath2D = (globalThis as { Path2D?: unknown }).Path2D;
  (globalThis as { Path2D?: unknown }).Path2D = class {};

  let clock = 0;
  const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
  const raf = vi
    .spyOn(globalThis, 'requestAnimationFrame')
    .mockImplementation((cb: FrameRequestCallback) => {
      // 16ms a frame, and queued rather than called inline: a synchronous
      // callback would recurse until the stack gave out.
      clock += 16;
      return setTimeout(() => cb(clock), 0) as unknown as number;
    });
  return () => {
    context.mockRestore();
    width.mockRestore();
    now.mockRestore();
    raf.mockRestore();
    if (hadPath2D) (globalThis as { Path2D?: unknown }).Path2D = previousPath2D;
    else delete (globalThis as { Path2D?: unknown }).Path2D;
  };
}
