/**
 * Turning a card into something you can post.
 *
 * SVG string → data URL → Image → canvas → PNG blob. No library: the card is
 * plain SVG, so the browser's own rasteriser is enough, and an offline app
 * has nowhere to fall back to anyway.
 *
 * Sharing prefers the Web Share API with a file, which on a phone opens the
 * system sheet — Instagram, Messages, wherever. Where that is unavailable
 * (most desktops) it saves the file instead, and says which happened so the
 * UI can tell the truth about it.
 */

export type ShareOutcome = 'shared' | 'saved' | 'cancelled' | 'failed';

export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(url);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable in this browser.');
  context.drawImage(image, 0, 0, width, height);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The card could not be rendered.'))),
      'image/png',
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The card could not be drawn.'));
    image.src = src;
  });
}

export async function shareImage(blob: Blob, filename: string, title: string): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: 'image/png' });

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      // A dismissed system sheet is not a failure, and must not read as one.
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      return 'failed';
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return 'saved';
  } catch {
    return 'failed';
  }
}
