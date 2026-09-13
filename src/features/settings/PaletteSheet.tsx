import { X } from 'lucide-react';
import { useSettings } from '@/store/settings';
import { SelectableCard } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { THEMES as PALETTES } from '@/ui/themes';
import { useDialog } from '@/ui/useDialog';

/**
 * The palettes, in a sheet (PLAN.md M122).
 *
 * Nine of them were a column of cards in the middle of the Appearance
 * card, so the setting most people change once sat between the setting
 * they change never and the text size. The card names the one in use and
 * opens this; picking one applies at once so the page behind shows it,
 * and the sheet stays open so the next can be compared against it.
 */
export function PaletteSheet({ onClose }: { onClose: () => void }) {
  const themeId = useSettings((s) => s.themeId);
  const setThemeId = useSettings((s) => s.setThemeId);
  const sheet = useDialog<HTMLDivElement>(onClose);

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Palette"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-line rounded-2xl p-4 w-full max-w-md max-h-full overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="font-bold">Palette</h2>
          <IconButton label="Close" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {PALETTES.map((palette) => (
            <SelectableCard
              key={palette.id}
              selected={themeId === palette.id}
              onClick={() => setThemeId(palette.id)}
              label={`${palette.name}: ${palette.blurb}`}
              className="flex items-center gap-3 bg-sunken"
            >
              <span className="flex gap-1 shrink-0" aria-hidden>
                {([palette.light.accent, palette.light.ink, palette.light.sunken] as const).map((c) => (
                  <span key={c} className="w-4 h-4 rounded border border-line" style={{ background: c }} />
                ))}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-sm">{palette.name}</span>
                <span className="block text-xs text-ink-soft">{palette.blurb}</span>
              </span>
            </SelectableCard>
          ))}
        </div>
      </div>
    </div>
  );
}
