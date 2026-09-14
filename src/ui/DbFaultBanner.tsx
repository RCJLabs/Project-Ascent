import { useSyncExternalStore } from 'react';
import { Link } from 'wouter';
import { TriangleAlert } from 'lucide-react';
import { dbFault, watchDbFault, type DbFault } from '@/db/db';

/**
 * Why the log looks empty, when it is not (PLAN.md M151).
 *
 * Every way the database could refuse arrived at one appearance: an app with
 * nothing in it. Eight stores catch their read and set `hydrated: true` with
 * no data, which is byte-for-byte what a fresh install looks like — so a
 * climber whose two years of sessions are sitting on the device, unreadable,
 * was shown the same screen as someone who had never logged anything.
 *
 * **Never dismissible.** Every one of these means *your training is not
 * being saved*, and a banner that can be waved away is a banner that gets
 * waved away once and then forgotten for a fortnight. `StorageWarning` sits
 * beside this and is about a disk filling up; this is about a database that
 * will not answer.
 *
 * **Each one says what to do, because they need different things done.**
 * That is the whole reason for classifying rather than showing one message:
 * closing another tab, updating the app, freeing room and leaving a private
 * window have nothing in common except that the app cannot save.
 */
const SAID: Record<DbFault, { headline: string; body: string; action?: { label: string; href: string } }> = {
  blocked: {
    headline: 'Another tab has this app open',
    body: 'Two tabs are on different versions of Project Ascent, so neither can finish opening the database. Close the other tabs and reload this one. Nothing has been lost.',
  },
  'newer-schema': {
    headline: 'This data was written by a newer version',
    body: 'Your training log is on this device and intact, and this version of the app is older than the one that wrote it — so it will not open it rather than risk it. Update the app and reopen.',
  },
  'no-room': {
    headline: 'The device is out of room',
    body: 'Nothing new can be saved until something is freed. Photos are usually much the biggest thing, and the data screen says what is taking the space.',
    action: { label: 'See what is stored', href: '/data' },
  },
  unavailable: {
    headline: 'The app cannot open its storage',
    body: 'Nothing can be read or saved on this device right now. A private window, blocked site data, or a browser that is mid-restart are the usual causes — anything you log until this clears will not be kept.',
  },
};

export function DbFaultBanner() {
  const fault = useSyncExternalStore(watchDbFault, dbFault, () => null);
  if (fault === null) return null;
  const said = SAID[fault];

  return (
    <div
      role="alert"
      className="bg-surface border border-warn rounded-2xl p-3.5 flex items-start gap-3"
    >
      <TriangleAlert size={18} className="text-warn shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm">{said.headline}</p>
        <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">{said.body}</p>
        {said.action && (
          <Link href={said.action.href} className="text-xs font-bold text-accent mt-1.5 inline-block">
            {said.action.label} →
          </Link>
        )}
      </div>
    </div>
  );
}
