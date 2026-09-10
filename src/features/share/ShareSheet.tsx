import { useState } from 'react';
import { useDialog } from '@/ui/useDialog';
import { Download, Share2, X } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { Button } from '@/ui/Button';
import { IconButton } from '@/ui/IconButton';
import { CARD, DARK_CARD, LIGHT_CARD, buildCardSvg, type CardContent } from '@/ui/shareCard';
import { shareImage, svgToPng, type ShareOutcome } from '@/ui/shareImage';

const MESSAGE: Record<ShareOutcome, string> = {
  shared: 'Shared.',
  saved: 'Saved to your downloads.',
  cancelled: 'Share cancelled.',
  failed: 'That did not work. Try saving it instead.',
};

/** Is the app currently painting the dark theme? */
function usingDark(preference: string): boolean {
  if (preference === 'dark') return true;
  if (preference === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function ShareSheet({
  content,
  filename,
  onClose,
}: {
  content: CardContent;
  filename: string;
  onClose: () => void;
}) {
  const preference = useSettings((s) => s.theme);
  const [dark, setDark] = useState(() => usingDark(preference));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const svg = buildCardSvg(content, dark ? DARK_CARD : LIGHT_CARD);
  const sheet = useDialog<HTMLDivElement>(onClose);


  async function run(save: boolean) {
    setBusy(true);
    setMessage(null);
    try {
      const blob = await svgToPng(svg, CARD.width, CARD.height);
      if (save) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        setMessage(MESSAGE.saved);
      } else {
        setMessage(MESSAGE[await shareImage(blob, filename, content.headline)]);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : MESSAGE.failed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Share card"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl p-4 w-full max-w-md max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Share card</h2>
          <IconButton onClick={onClose} label="Close">
            <X size={18} />
          </IconButton>
        </div>

        <div
          className="rounded-xl overflow-hidden border border-line mb-3 [&>svg]:block [&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />

        <div className="flex gap-2 mb-3">
          <Button size="sm" variant={dark ? 'outline' : 'primary'} onClick={() => setDark(false)}>
            Light
          </Button>
          <Button size="sm" variant={dark ? 'primary' : 'outline'} onClick={() => setDark(true)}>
            Dark
          </Button>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => void run(false)}>
            <Share2 size={16} /> Share
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void run(true)}>
            <Download size={16} /> Save
          </Button>
        </div>

        {message && <p className="text-sm text-ink-soft mt-3">{message}</p>}
      </div>
    </div>
  );
}

/** A button that opens the sheet, so callers wire one line. */
export function ShareButton({
  content,
  filename,
  label = 'Share',
  className = '',
}: {
  content: CardContent;
  filename: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className={`text-accent ${className}`}>
        <Share2 size={15} /> {label}
      </Button>
      {open && <ShareSheet content={content} filename={filename} onClose={() => setOpen(false)} />}
    </>
  );
}
