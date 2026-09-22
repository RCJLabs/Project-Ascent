import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { addMedia, mediaOwners } from '@/db/media';
import { ACCEPTED, ImageError, prepareImage, type PreparedImage } from '@/lib/image';
import { attachTargets, describeEmpty, type Target } from '@/engine/attach';
import { takeSharedPhoto } from '@/lib/sharedPhoto';
import { today } from '@/engine/dates';
import { useProjects } from '@/store/projects';
import { useSessions, useAllSessions } from '@/store/sessions';
import { announce } from '@/ui/Announce';
import { BackLink } from '@/ui/BackLink';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { PageSkeleton } from '@/ui/Skeleton';

/**
 * A photo, and the question of where it belongs (PLAN.md M111b).
 *
 * `MediaCard` attaches photos and lives on exactly two pages, so adding one
 * has always meant already being on the page it belongs to. This asks the
 * other way round — here is a picture, which day or project is it? — which
 * is what a climber back from a crag with a camera roll actually has, and
 * what a shared photo will need when the share target lands.
 *
 * **The picture is prepared once, before the destination is chosen.**
 * `prepareImage` resizes and re-encodes, which takes long enough to notice
 * on a phone; doing it on the tap would put that delay between choosing a
 * day and seeing it land. Doing it up front also means a file the app
 * cannot read says so immediately, rather than after the climber has
 * answered a question about a photo that was never going to work.
 */
export function AttachPage() {
  const sessionsReady = useSessions((s) => s.hydrated);
  const projects = useProjects((s) => s.projects);
  const projectsReady = useProjects((s) => s.hydrated);

  const [prepared, setPrepared] = useState<PreparedImage | null>(null);
  /** Whether a photo arrived by share rather than by the file picker. */
  const [shared, setShared] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [landed, setLanded] = useState<Target | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /**
   * Still on screen (PLAN.md M323).
   *
   * The same guard the shared-photo effect below already carries, at the one
   * place on this page that was missed: `refreshCounts` reads the database
   * and then writes the answer into state, and a page unmounted in between
   * writes into nothing. Harmless in a browser and fatal under a test runner,
   * where the environment is gone by then and React reads `window` on its way
   * into `dispatchSetState` — which is how CI went red at M322, on the
   * identical shape in `SettingsPage`.
   *
   * A ref rather than the effect-local `live` flag used below, because the
   * upload handler calls this too and an effect's flag does not reach it.
   */
  const onScreen = useRef(true);
  useEffect(() => () => void (onScreen.current = false), []);

  const refreshCounts = useCallback(async () => {
    const owners = await mediaOwners();
    const next = new Map([...owners].map(([owner, ids]) => [owner, ids.length] as const));
    if (onScreen.current) setCounts(next);
  }, []);

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  // Revoked on replace and on unmount. An object URL held past its blob is
  // the leak this app has hit before, in `MediaCard`'s own grid.
  useEffect(() => {
    if (preview === null) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  /**
   * A photo shared into the app lands here (PLAN.md M111b).
   *
   * The worker caught the `share_target` POST, left the file in a cache and
   * redirected here; this takes it. Unconditional rather than behind a flag
   * in the URL: `launch_handler` is `focus-existing`, so a share can arrive
   * at a tab that is already open and whose hash the redirect merely
   * changes — and a page that only looked when it saw `?shared` would miss
   * exactly that case. The take is one-shot, so looking costs one cache
   * miss and cannot double-file anything.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      const file = await takeSharedPhoto();
      if (!live || file === null) return;
      setShared(true);
      await accept(file);
    })();
    return () => {
      live = false;
    };
    // Once, on mount. `accept` closes over setters, which are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = useAllSessions();
  const targets = useMemo(
    () => attachTargets({ sessions, projects, counts: counts ?? new Map(), today: today() }),
    [sessions, projects, counts],
  );
  const empty = describeEmpty(targets, sessions.length > 0);

  /**
   * Prepare one file and hold it, wherever it came from.
   *
   * Shared photos and picked ones go through exactly this — the share is a
   * different doorway, not a different photo, and a second copy of the
   * resize-and-report path is how the two would drift.
   */
  async function accept(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setLanded(null);
    try {
      const image = await prepareImage(file);
      setPrepared(image);
      setPreview((old) => {
        if (old !== null) URL.revokeObjectURL(old);
        return URL.createObjectURL(image.blob);
      });
    } catch (e) {
      setPrepared(null);
      setError(e instanceof ImageError ? e.message : 'That photo could not be read.');
    } finally {
      setBusy(false);
    }
  }

  async function onPicked(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setShared(false);
    await accept(file);
    // Cleared so choosing the same file twice fires a change event. Without
    // it, a climber who picks the wrong photo, goes back and picks it again
    // gets nothing at all.
    if (fileRef.current) fileRef.current.value = '';
  }

  async function attach(target: Target) {
    if (prepared === null || target.full) return;
    setBusy(true);
    setError(null);
    try {
      await addMedia({ ownerId: target.owner, ...prepared });
      setLanded(target);
      setPrepared(null);
      setPreview((old) => {
        if (old !== null) URL.revokeObjectURL(old);
        return null;
      });
      await refreshCounts();
      announce(`Photo added to ${target.label}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That photo could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  if (!sessionsReady || !projectsReady || counts === null) return <PageSkeleton title="Add a photo" />;

  return (
    <>
      <BackLink />
      <PageHeader title="Add a photo" subtitle="Pick the picture, then say where it belongs" />

      <div className="grid grid-cols-1 gap-3">
        <Card title="The photo">
          {preview !== null ? (
            <div className="flex items-start gap-3">
              <img
                src={preview}
                alt="The photo you are about to attach"
                className="w-24 h-24 object-cover rounded-xl border border-line shrink-0"
              />
              <div className="min-w-0">
                <p className="text-sm text-ink-soft leading-relaxed">
                  {shared ? 'Shared to Ascent. Choose where it goes below.' : 'Ready. Choose where it goes below.'}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                >
                  Pick a different one
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                Photos live on this device and go into your backup. Pick one and the app will ask
                which session or project it belongs to.
              </p>
              <Button disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy ? 'Reading…' : 'Choose a photo'}
              </Button>
            </>
          )}
          {error !== null && <p className="text-sm text-warn mt-3">{error}</p>}
          <Input
            ref={fileRef}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => void onPicked(e.target.files)}
          />
        </Card>

        {landed !== null && (
          <Card title="Added">
            <p className="text-sm leading-relaxed">
              Added to <strong>{landed.label}</strong>.{' '}
              <Link href={landed.href} className="text-accent font-semibold">
                Open it
              </Link>
              , or pick another photo above.
            </p>
          </Card>
        )}

        {/* The list is always rendered, prepared photo or not. A climber who
            opens this cold should be able to see what their options *are*
            before committing to a picture — and the empty reading is the
            most useful thing on the page for someone who has none. */}
        <Card title="Where it goes">
          {empty !== null ? (
            <p className="text-sm text-ink-soft leading-relaxed">{empty}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-1.5">
              {targets.map((target) => (
                <li key={target.owner}>
                  <Button
                    variant="outline"
                    className="w-full justify-between text-left"
                    disabled={busy || prepared === null || target.full}
                    onClick={() => void attach(target)}
                  >
                    <span className="min-w-0 truncate">
                      {target.label}
                      <span className="text-ink-soft font-normal"> · {target.detail}</span>
                    </span>
                    {/* Said, not counted. A bare "1" on the right of a row
                        is a number a climber has to guess the units of —
                        the browser showed it reading as part of the grade
                        beside it, "The Nose · V7" and "1" running together
                        into V71. */}
                    <span className="text-xs text-ink-soft shrink-0">
                      {target.full
                        ? 'Full'
                        : target.count > 0
                          ? `${target.count} photo${target.count === 1 ? '' : 's'}`
                          : ''}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {empty === null && prepared === null && (
            <p className="text-xs text-ink-soft mt-3 leading-relaxed">
              Choose a photo first and these become tappable.
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
