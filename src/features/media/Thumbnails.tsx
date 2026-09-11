import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { mediaByIds, mediaOwners } from '@/db/media';
import type { MediaRecord } from '@/db/schema';

/**
 * Photos, read only when they are about to be looked at (PLAN.md M92).
 *
 * The journal renders every matching entry with no paging, so a strip that
 * loaded its blobs on mount would read the whole database on the way down
 * the page. These wait for the browser to say the strip is on screen, and
 * hand the blobs back when it leaves.
 *
 * **A callback ref, not a ref object in a dependency array.** The first
 * draft took a `RefObject` and set the observer up in an effect. On the
 * journal that effect ran before the owner index had resolved — so the
 * strip had no photos, rendered nothing, and the effect saw a null ref and
 * bailed. Nothing re-ran it, because a ref is not a dependency: its
 * `.current` changes without React noticing. Every strip on the page was
 * then stuck forever. A callback ref fires when the node actually attaches,
 * which is the event this needs and the only one that is reliably observed.
 *
 * `IntersectionObserver` is missing in jsdom and in old WebViews. Absent,
 * the strip loads immediately — the wrong trade for a phone and the right
 * one for a test, and either way a climber sees their pictures.
 */
function useOnScreen<T extends Element>(): [(node: T | null) => void, boolean] {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');
  const observer = useRef<IntersectionObserver | null>(null);

  const attach = useCallback((node: T | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    observer.current = new IntersectionObserver(
      (entries) => {
        // Once, and then never again: a strip that has been read does not
        // need re-reading when it scrolls back past.
        if (!entries.some((e) => e.isIntersecting)) return;
        setSeen(true);
        observer.current?.disconnect();
        observer.current = null;
      },
      { rootMargin: '200px' },
    );
    observer.current.observe(node);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);

  return [attach, seen];
}

/**
 * Object URLs for a set of records, revoked when the set changes or the
 * component goes.
 *
 * Keyed on the ids rather than the array, for the reason `MediaCard`
 * records: a blob for a given id never changes, so rebuilding the handles
 * because the array identity moved would reload every `<img>` for nothing.
 */
function useObjectUrls(records: MediaRecord[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const signature = records.map((r) => r.id).join(',');

  useEffect(() => {
    const made: Record<string, string> = {};
    for (const record of records) made[record.id] = URL.createObjectURL(record.blob);
    setUrls(made);
    return () => {
      for (const url of Object.values(made)) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls;
}

/** Load a handful of an owner's photos, once this is on screen. */
function useStrip(ids: readonly string[], on: boolean): MediaRecord[] {
  const [records, setRecords] = useState<MediaRecord[]>([]);
  const signature = ids.join(',');

  useEffect(() => {
    if (!on) return;
    let live = true;
    void mediaByIds(signature === '' ? [] : signature.split(',')).then((rows) => {
      // The climber's own order, which is `createdAt` — the ids come from
      // the index and carry no ordering worth showing.
      if (live) setRecords(rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
    });
    return () => {
      live = false;
    };
  }, [signature, on]);

  return records;
}

/**
 * A row of small thumbnails for one owner, with the overflow counted.
 *
 * Not a link of its own: it sits inside the card that already links to the
 * place the photos live, and a link inside a link is invalid and confusing.
 */
export function PhotoStrip({ ids, alt, max = 3 }: { ids: readonly string[]; alt: string; max?: number }) {
  const [attach, on] = useOnScreen<HTMLDivElement>();
  const shown = ids.slice(0, max);
  const records = useStrip(shown, on);
  const urls = useObjectUrls(records);
  const more = ids.length - shown.length;

  if (ids.length === 0) return null;
  return (
    <div ref={attach} data-testid="photo-strip" className="flex items-center gap-1.5 mt-2">
      {records.map((record) => (
        <img
          key={record.id}
          src={urls[record.id]}
          alt={record.caption ?? alt}
          loading="lazy"
          className="w-14 h-14 rounded-lg object-cover bg-sunken"
        />
      ))}
      {/* Reserved while the blobs are still coming, so the card does not
          jump under the reader's thumb as each strip fills in. */}
      {records.length === 0 &&
        shown.map((id) => <div key={id} className="w-14 h-14 rounded-lg bg-sunken" aria-hidden="true" />)}
      {more > 0 && <span className="text-xs text-ink-soft">+{more}</span>}
    </div>
  );
}

/** One square in the year's grid, linking to where the photo lives. */
export function PhotoTile({
  id,
  href,
  title,
  date,
}: {
  id: string;
  href: string;
  title: string;
  date: string;
}) {
  const [attach, on] = useOnScreen<HTMLAnchorElement>();
  const records = useStrip([id], on);
  const urls = useObjectUrls(records);
  const record = records[0];

  return (
    <Link
      ref={attach}
      href={href}
      className="focus-ring block aspect-square rounded-xl overflow-hidden bg-sunken"
      aria-label={`${record?.caption ?? title} — ${date}`}
    >
      {record && urls[record.id] && (
        <img src={urls[record.id]} alt="" loading="lazy" className="w-full h-full object-cover" />
      )}
    </Link>
  );
}

/**
 * Who has photos, loaded once per page.
 *
 * A hook rather than a store on purpose: a cached map goes stale the moment
 * a photo is added on the logger, and this is one index scan.
 */
export function useMediaOwners(): { owners: Map<string, string[]>; ready: boolean } {
  const [owners, setOwners] = useState<Map<string, string[]>>(() => new Map());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void mediaOwners().then((map) => {
      if (!live) return;
      setOwners(map);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return { owners, ready };
}
