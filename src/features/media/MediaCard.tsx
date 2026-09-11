import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Camera, Circle, Eraser, Pen, PenLine, Trash2, Undo2, X } from 'lucide-react';
import { MAX_PER_OWNER, addMedia, deleteMedia, listMedia, updateMedia } from '@/db/media';
import type { MediaRecord } from '@/db/schema';
import { formatBytes } from '@/engine/offline';
import { ACCEPTED, ImageError, prepareImage } from '@/lib/image';
import {
  DEFAULT_COLOR,
  MARK_COLORS,
  MAX_MARKS,
  addMark,
  colorOf,
  describeMarks,
  type Mark,
  type MarkColorId,
  type MarkKind,
} from '@/lib/marks';
import { Button } from '@/ui/Button';
import { SelectableCard } from '@/ui/Chip';
import { Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Card } from '@/ui/Card';
import { useDialog } from '@/ui/useDialog';
import { MarkPad } from './PhotoMarks';

/**
 * Photos on something. Projects have had them; sessions get them in M30,
 * and M71 lets you draw the beta on one.
 *
 * Takes an owner key rather than an id, because the two callers file their
 * pictures under different namespaces and the copy differs — a project photo
 * is beta you come back to, a session photo is the day itself. The mechanism
 * is identical, so there is one of these rather than two.
 *
 * Object URLs are created per record and revoked when the *set of photos*
 * changes — not when the array does. Before M71 the effect watched `items`,
 * so editing a caption rebuilt every handle in the card and reloaded every
 * `<img>`; drawing, which writes on every stroke, would have made the photo
 * flicker under the pen. The blob for a given id never changes here —
 * photos are immutable once added, and only the caption and the marks are
 * ever written — so the id list is a complete signature for the URLs.
 * Everything is re-encoded on the way in (lib/image.ts) — an offline app
 * cannot afford originals.
 */
export function MediaCard({
  owner,
  title = 'Photos',
  blurb,
  fullNote,
}: {
  owner: string;
  title?: string;
  /** Shown instead of the grid while there are none. */
  blurb: string;
  /** Shown once the owner is at the cap. */
  fullNote: string;
}) {
  const [items, setItems] = useState<MediaRecord[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);
  const [tool, setTool] = useState<MarkKind | 'erase' | null>(null);
  const [color, setColor] = useState<MarkColorId>(DEFAULT_COLOR);
  const fileRef = useRef<HTMLInputElement>(null);
  const latest = useRef(items);
  latest.current = items;

  useEffect(() => {
    void listMedia(owner).then(setItems);
  }, [owner]);

  const ids = items.map((i) => i.id).join(' ');
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of latest.current) next[item.id] = URL.createObjectURL(item.blob);
    setUrls(next);
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url);
    };
  }, [ids]);

  async function onPicked(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareImage(file);
      await addMedia({ ownerId: owner, ...prepared });
      setItems(await listMedia(owner));
    } catch (e) {
      setError(e instanceof ImageError ? e.message : 'That photo could not be added.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function remove(id: string) {
    await deleteMedia(id);
    setItems(await listMedia(owner));
    setViewing(null);
  }

  async function caption(item: MediaRecord, text: string) {
    const trimmed = text.trim();
    const { caption: _dropped, ...rest } = item;
    await write(trimmed ? { ...rest, caption: trimmed } : rest);
  }

  /**
   * Marks are saved as they are drawn.
   *
   * The alternative is a Save button and a confirm-on-close, in a dialog
   * Escape already closes — which turns every stray keypress into a chance
   * to lose the line you just drew. Undo and Erase are the way back, and
   * they work the same before and after a reload, which a draft buffer
   * would not.
   */
  async function setMarks(item: MediaRecord, marks: Mark[]) {
    const { marks: _dropped, ...rest } = item;
    await write(marks.length > 0 ? { ...rest, marks } : rest);
  }

  /** Writes, then patches the row in place — see the note on object URLs. */
  async function write(next: MediaRecord) {
    setItems((current) => current.map((i) => (i.id === next.id ? next : i)));
    await updateMedia(next);
  }

  const bytes = items.reduce((n, i) => n + i.blob.size, 0);
  const full = items.length >= MAX_PER_OWNER;
  const open = viewing ? items.find((i) => i.id === viewing) : undefined;
  // This card stays mounted and renders the viewer conditionally, so the
  // trap has to be told when there is a dialog to trap.
  const viewer = useDialog<HTMLDivElement>(() => close(), open !== undefined);

  function close() {
    setViewing(null);
    setTool(null);
  }

  const marks = open?.marks ?? [];

  return (
    <Card title={title}>
      {items.length === 0 ? (
        <p className="text-sm text-ink-soft mb-3 leading-relaxed">{blurb}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {items.map((item) => (
            <SelectableCard
              key={item.id}
              selected={false}
              onClick={() => setViewing(item.id)}
              label={
                // The grid crops to a square, so the marks cannot be drawn
                // on the thumbnail without landing somewhere they were not
                // put. Saying so is honest; drawing them shifted is not.
                [item.caption || 'Open photo', item.marks?.length ? describeMarks(item.marks) : '']
                  .filter(Boolean)
                  .join(' — ')
              }
              padded={false}
              className="relative aspect-square rounded-xl overflow-hidden bg-sunken border border-line"
            >
              {urls[item.id] && (
                <img src={urls[item.id]} alt={item.caption ?? ''} className="w-full h-full object-cover" />
              )}
              {item.marks?.length ? (
                <span
                  aria-hidden="true"
                  className="absolute bottom-1 right-1 rounded-md bg-black/70 text-white p-1 leading-none"
                >
                  <PenLine size={13} />
                </span>
              ) : null}
            </SelectableCard>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" disabled={busy || full} onClick={() => fileRef.current?.click()}>
          <Camera size={15} /> {busy ? 'Adding…' : 'Add a photo'}
        </Button>
        {items.length > 0 && (
          <span className="text-xs text-ink-soft">
            {items.length} of {MAX_PER_OWNER} · {formatBytes(bytes)}
          </span>
        )}
        <Input
          ref={fileRef}
          type="file"
          accept={ACCEPTED}
          hidden
          onChange={(e) => void onPicked(e.target.files)}
        />
      </div>
      {full && <p className="text-xs text-ink-soft mt-2">{fullNote}</p>}
      {error && <p className="text-sm text-danger mt-2">{error}</p>}

      {open && (
        <div
          ref={viewer}
          tabIndex={-1}
          className="fixed inset-0 z-50 bg-black/95 flex flex-col p-4 outline-none"
          role="dialog"
          aria-modal="true"
          aria-label={open.caption ? `Photo: ${open.caption}` : 'Photo'}
        >
          <IconButton inline={false} onClick={close} label="Close photo" className="self-end text-white">
            <X size={22} />
          </IconButton>
          <div className="flex-1 flex items-center justify-center min-h-0">
            {urls[open.id] && (
              <MarkPad
                src={urls[open.id]!}
                alt={open.caption ?? ''}
                marks={marks}
                width={open.width}
                height={open.height}
                tool={tool}
                color={color}
                onCommit={(mark) => void setMarks(open, addMark(marks, mark))}
                onErase={(index) => void setMarks(open, marks.filter((_, i) => i !== index))}
              />
            )}
          </div>

          <MarkTools
            tool={tool}
            setTool={setTool}
            color={color}
            setColor={setColor}
            marks={marks}
            onUndo={() => void setMarks(open, marks.slice(0, -1))}
            onClear={() => void setMarks(open, [])}
          />

          <div className="flex gap-2 mt-3">
            <Input
              defaultValue={open.caption ?? ''}
              placeholder="Add a note about this photo"
              aria-label="Photo caption"
              onBlur={(e) => void caption(open, e.target.value)}
              className="flex-1 min-w-0 bg-surface"
            />
            <Button size="sm" variant="danger" onClick={() => void remove(open.id)}>
              <Trash2 size={15} />
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

const TOOLS: { id: MarkKind | 'erase'; label: string; icon: typeof Pen }[] = [
  { id: 'line', label: 'Draw', icon: Pen },
  { id: 'arrow', label: 'Arrow', icon: ArrowUpRight },
  { id: 'circle', label: 'Circle a hold', icon: Circle },
  { id: 'erase', label: 'Erase a mark', icon: Eraser },
];

/**
 * The pen tray.
 *
 * A tool is a toggle, not a mode you are stuck in: tapping the one you are
 * holding puts it down. That matters because the photo is the point — with
 * a tool up, a drag draws, and there has to be a way back to just looking
 * at the picture that is not closing and reopening it.
 */
function MarkTools({
  tool,
  setTool,
  color,
  setColor,
  marks,
  onUndo,
  onClear,
}: {
  tool: MarkKind | 'erase' | null;
  setTool: (tool: MarkKind | 'erase' | null) => void;
  color: MarkColorId;
  setColor: (color: MarkColorId) => void;
  marks: Mark[];
  onUndo: () => void;
  onClear: () => void;
}) {
  const full = marks.length >= MAX_MARKS;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-1.5">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <IconButton
            key={id}
            inline={false}
            label={label}
            aria-pressed={tool === id}
            disabled={id !== 'erase' && full}
            onClick={() => setTool(tool === id ? null : id)}
            className={
              tool === id ? 'bg-white text-black' : 'text-white bg-white/10 hover:bg-white/20'
            }
          >
            <Icon size={19} />
          </IconButton>
        ))}

        <span className="flex-1" />

        <IconButton
          inline={false}
          label="Undo the last mark"
          disabled={marks.length === 0}
          onClick={onUndo}
          className="text-white bg-white/10 hover:bg-white/20 disabled:bg-transparent"
        >
          <Undo2 size={19} />
        </IconButton>
        <Button
          size="sm"
          variant="outline"
          disabled={marks.length === 0}
          onClick={onClear}
          className="text-white border-white/40 hover:bg-white/10"
        >
          Clear
        </Button>
      </div>

      <div className="flex items-center gap-1.5">
        {MARK_COLORS.map((swatch) => (
          <IconButton
            key={swatch.id}
            inline={false}
            label={swatch.label}
            aria-pressed={color === swatch.id}
            onClick={() => setColor(swatch.id)}
            className="text-white"
          >
            <span
              aria-hidden="true"
              className={`block rounded-full border-2 ${
                color === swatch.id ? 'w-6 h-6 border-white' : 'w-4 h-4 border-white/30'
              }`}
              style={{ background: colorOf(swatch.id) }}
            />
          </IconButton>
        ))}
      </div>

      <p className="text-xs text-white/70" role="status">
        {tool
          ? full
            ? `That is ${MAX_MARKS} marks — erase one before drawing another.`
            : TOOL_HINT[tool]
          : marks.length > 0
            ? `${describeMarks(marks)} on this photo. Pick a tool to change them.`
            : 'Pick a tool and draw the beta straight onto the photo.'}
      </p>
    </div>
  );
}

const TOOL_HINT: Record<MarkKind | 'erase', string> = {
  line: 'Drag to draw a line.',
  arrow: 'Drag from where the move starts to where it ends.',
  circle: 'Start on the hold and drag out.',
  erase: 'Tap a mark to remove it.',
};
