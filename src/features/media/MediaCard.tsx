import { useEffect, useRef, useState } from 'react';
import { Camera, Trash2, X } from 'lucide-react';
import { MAX_PER_OWNER, addMedia, deleteMedia, listMedia, updateMedia } from '@/db/media';
import type { MediaRecord } from '@/db/schema';
import { formatBytes } from '@/engine/offline';
import { ACCEPTED, ImageError, prepareImage } from '@/lib/image';
import { Button } from '@/ui/Button';
import { SelectableCard } from '@/ui/Chip';
import { Input } from '@/ui/Field';
import { IconButton } from '@/ui/IconButton';
import { Card } from '@/ui/Card';

/**
 * Photos on something. Projects have had them; sessions get them in M30.
 *
 * Takes an owner key rather than an id, because the two callers file their
 * pictures under different namespaces and the copy differs — a project photo
 * is beta you come back to, a session photo is the day itself. The mechanism
 * is identical, so there is one of these rather than two.
 *
 * Object URLs are created per record and revoked when the list changes, so
 * scrolling an owner with eight pictures does not leak eight handles a
 * render. Everything is re-encoded on the way in (lib/image.ts) — an offline
 * app cannot afford originals.
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
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void listMedia(owner).then(setItems);
  }, [owner]);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const item of items) next[item.id] = URL.createObjectURL(item.blob);
    setUrls(next);
    return () => {
      for (const url of Object.values(next)) URL.revokeObjectURL(url);
    };
  }, [items]);

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
    await updateMedia(trimmed ? { ...rest, caption: trimmed } : rest);
    setItems(await listMedia(owner));
  }

  const bytes = items.reduce((n, i) => n + i.blob.size, 0);
  const full = items.length >= MAX_PER_OWNER;
  const open = viewing ? items.find((i) => i.id === viewing) : undefined;

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
              label={item.caption || 'Open photo'}
              padded={false}
              className="aspect-square rounded-xl overflow-hidden bg-sunken border border-line"
            >
              {urls[item.id] && (
                <img src={urls[item.id]} alt={item.caption ?? ''} className="w-full h-full object-cover" />
              )}
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
          className="fixed inset-0 z-50 bg-black/80 flex flex-col p-4"
          role="dialog"
          aria-label="Photo"
        >
          <IconButton
            inline={false}
            onClick={() => setViewing(null)}
            label="Close photo"
            className="self-end text-white"
          >
            <X size={22} />
          </IconButton>
          <div className="flex-1 flex items-center justify-center min-h-0">
            {urls[open.id] && (
              <img src={urls[open.id]} alt={open.caption ?? ''} className="max-w-full max-h-full object-contain rounded-xl" />
            )}
          </div>
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
