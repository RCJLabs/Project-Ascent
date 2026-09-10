import { TriangleAlert, Undo2 } from 'lucide-react';
import { STORE_LABEL, visibleRows, type ImportPreview } from '@/db/importPreview';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';

/**
 * What is about to happen, in records (PLAN.md M20).
 *
 * The old flow asked "replace or merge?" over a file the climber could not
 * see into. The two words do not mean anything until you know that replace
 * would delete 380 sessions this backup has never heard of — so that number
 * is the headline, and the per-store table is underneath for anyone who
 * wants to check it.
 */
export function ImportPreviewCard({
  preview,
  fileLabel,
  onImport,
  onCancel,
  busy,
}: {
  preview: ImportPreview;
  fileLabel: string;
  onImport: (mode: 'replace' | 'merge') => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const rows = visibleRows(preview);
  const destructive = preview.lostByReplace > 0;

  return (
    <Card title="Import this backup?">
      <p className="text-sm text-ink-soft leading-relaxed">
        {fileLabel}
      </p>

      <div className="mt-3 rounded-xl bg-sunken p-3">
        <p className="text-sm">
          <span className="font-semibold">{preview.arriving.toLocaleString()}</span> record
          {preview.arriving === 1 ? '' : 's'} would arrive.
        </p>
        {destructive ? (
          <p className="text-sm mt-1.5 flex items-start gap-2">
            <TriangleAlert size={15} className="text-critical shrink-0 mt-0.5" aria-hidden />
            <span>
              <span className="font-semibold text-critical">
                Replace would delete {preview.lostByReplace.toLocaleString()}
              </span>{' '}
              thing{preview.lostByReplace === 1 ? '' : 's'} this backup does not contain. Merge
              keeps them.
            </span>
          </p>
        ) : (
          <p className="text-sm text-ink-soft mt-1.5">
            Nothing on this device is missing from the backup, so replace and merge do the same
            thing here.
          </p>
        )}
        {preview.unreadable > 0 && (
          <p className="text-sm text-warn mt-1.5">
            {preview.unreadable} record{preview.unreadable === 1 ? '' : 's'} in the file could not
            be read and will be skipped.
          </p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">
              What each part of your data would look like after importing
            </caption>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-soft text-left">
                <th scope="col" className="font-semibold py-1 pr-3">
                  Data
                </th>
                <th scope="col" className="font-semibold py-1 px-2 text-right tabular-nums">
                  Now
                </th>
                <th scope="col" className="font-semibold py-1 px-2 text-right tabular-nums">
                  New
                </th>
                <th scope="col" className="font-semibold py-1 pl-2 text-right tabular-nums">
                  Lost by replace
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.store} className="border-t border-line">
                  <th scope="row" className="font-normal py-1.5 pr-3">
                    {STORE_LABEL[row.store]}
                  </th>
                  <td className="py-1.5 px-2 text-right tabular-nums text-ink-soft">
                    {row.existing.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {row.added > 0 ? `+${row.added.toLocaleString()}` : '—'}
                  </td>
                  <td
                    className={`py-1.5 pl-2 text-right tabular-nums ${
                      row.onlyHere > 0 ? 'text-critical font-semibold' : 'text-ink-soft'
                    }`}
                  >
                    {row.onlyHere > 0 ? row.onlyHere.toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
              {(preview.media.existing > 0 || preview.media.incoming > 0) && (
                <tr className="border-t border-line">
                  <th scope="row" className="font-normal py-1.5 pr-3">
                    Photos
                  </th>
                  <td className="py-1.5 px-2 text-right tabular-nums text-ink-soft">
                    {preview.media.existing.toLocaleString()}
                  </td>
                  <td className="py-1.5 px-2 text-right tabular-nums">
                    {preview.media.incoming > 0 ? `+${preview.media.incoming}` : '—'}
                  </td>
                  <td
                    className={`py-1.5 pl-2 text-right tabular-nums ${
                      !preview.media.fileHasMedia && preview.media.existing > 0
                        ? 'text-critical font-semibold'
                        : 'text-ink-soft'
                    }`}
                  >
                    {!preview.media.fileHasMedia && preview.media.existing > 0
                      ? preview.media.existing.toLocaleString()
                      : '—'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-ink-soft mt-3 leading-relaxed">
        Either way, a restore point is saved first, so you can undo this. The restore point does
        not include photos.
      </p>

      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" onClick={() => onImport('merge')} disabled={busy}>
          Merge
        </Button>
        <Button
          size="sm"
          variant={destructive ? 'outline' : 'primary'}
          onClick={() => onImport('replace')}
          disabled={busy}
        >
          Replace everything
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

/**
 * The way back, offered for as long as the restore point exists.
 *
 * Not a toast: an import is the kind of mistake a climber notices ten minutes
 * later, when they go looking for a session that is no longer there.
 */
export function UndoImportCard({
  takenAt,
  replacedWith,
  onUndo,
  onKeep,
  busy,
}: {
  takenAt: string;
  replacedWith: string;
  onUndo: () => void;
  onKeep: () => void;
  busy: boolean;
}) {
  const when = new Date(takenAt);
  return (
    <Card title="Undo the last import">
      <p className="text-sm text-ink-soft leading-relaxed">
        A restore point was saved before importing {replacedWith}, on{' '}
        {when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} at{' '}
        {when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}. Undoing puts
        your data back as it was — photos excepted, which the restore point does not hold.
      </p>
      <div className="flex flex-wrap gap-2 mt-3">
        <Button size="sm" variant="outline" onClick={onUndo} disabled={busy}>
          <Undo2 size={15} /> Undo the import
        </Button>
        {/* A restore point is a second copy of everything except photos.
            Keeping it forever is storage the climber may want back, and
            saying "I am happy with this import" is the moment to reclaim it. */}
        <Button size="sm" variant="ghost" onClick={onKeep} disabled={busy}>
          Keep the import
        </Button>
      </div>
    </Card>
  );
}
