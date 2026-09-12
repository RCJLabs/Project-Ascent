import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { APP_VERSION } from '@/version';
import { exportArchive, hasRealData, importAll, readBackupFile, SCHEMA_VERSION } from '@/db';
import { previewFile, type ImportPreview } from '@/db/importPreview';
import { clearSnapshot, readSnapshot, restoreSnapshot, takeSnapshot } from '@/db/snapshot';
import { ImportPreviewCard, UndoImportCard } from './ImportPreviewCard';
import { SpreadsheetImportCard, pendingFrom, type CsvPending } from './SpreadsheetImportCard';
import { CsvError, parseCsv } from '@/engine/csv';
import { canLoadDemo, demoInjuries, loadDemo, wipeDemo } from '@/db/demo';
import { hasDemo } from '@/db/demoFlag';
import { takeLaunchFile } from '@/lib/launchFile';
import { getProgram } from '@/content/programs';
import { layoutsFor, planFromLayout } from '@/engine/scheduler';
import type { Session } from '@/db/sessions';
import { useSessions } from '@/store/sessions';
import { mediaBytes } from '@/db/media';
import type { Equipment } from '@/content/types';
import { displayGrade } from '@/engine/grades';
import { formatBytes, storagePressure } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { unlock } from '@/lib/cues';
import { hydrateAll } from '@/store';
import { useProfile } from '@/store/profile';
import { rankTemplates } from '@/engine/templates';
import { useTemplates } from '@/store/templates';
import { TEXT_SCALE, useSettings, type TextSize, type ThemePreference } from '@/store/settings';
import { PageGrid } from '@/ui/PageGrid';
import { Button } from '@/ui/Button';
import { announce } from '@/ui/Announce';
import { Card } from '@/ui/Card';
import { Meter } from '@/ui/Meter';
import { CHIP_LINK, Chip, SelectableCard } from '@/ui/Chip';
import { THEMES as PALETTES } from '@/ui/themes';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';
import { readingProblems } from '@/db/sound';
import { describeProblem } from '@/engine/dataHealth';
import { downloadFile } from '@/lib/download';
import { offerUndo } from '@/store/undo';

const GEAR: { value: Equipment; label: string }[] = [
  { value: 'wall', label: 'Climbing wall' },
  { value: 'hangboard', label: 'Hangboard' },
  { value: 'campus', label: 'Campus board' },
  { value: 'gym', label: 'Weights & bands' },
  { value: 'weight', label: 'Added weight' },
];

/** Enough rungs to tell the two notations apart at a glance. */
const V_SAMPLE = ['V2', 'V5', 'V9'] as const;
const YDS_SAMPLE = ['5.9', '5.11c', '5.13a'] as const;

const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Large' },
  { value: 'largest', label: 'Largest' },
];

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

interface StorageStatus {
  persisted: boolean | null;
  usage?: number;
  quota?: number;
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const themeId = useSettings((s) => s.themeId);
  const setThemeId = useSettings((s) => s.setThemeId);
  const textSize = useSettings((s) => s.textSize);
  const setTextSize = useSettings((s) => s.setTextSize);
  const cues = useSettings((s) => s.cues);
  const setCues = useSettings((s) => s.setCues);
  const display = useSettings((s) => s.display);
  const units = useSettings((s) => s.units);
  const setUnits = useSettings((s) => s.setUnits);
  const setBoulderDisplay = useSettings((s) => s.setBoulderDisplay);
  const setRouteDisplay = useSettings((s) => s.setRouteDisplay);
  const [storage, setStorage] = useState<StorageStatus>({ persisted: null });
  const [photoBytes, setPhotoBytes] = useState(0);
  const offlineReady = useAppUpdate((s) => s.offlineReady);
  const [message, setMessageState] = useState<string | null>(null);

  /**
   * Show a result and say it.
   *
   * Import and export report through here and nowhere else: the message
   * used to render as a paragraph at the foot of a long page, which a
   * screen reader had no reason to revisit and no way to know had changed.
   * Failures interrupt; successes wait their turn.
   */
  const setMessage = useCallback((text: string | null, failed = false) => {
    setMessageState(text);
    if (text !== null) announce(text, failed ? 'assertive' : 'polite');
  }, []);
  const equipment = useProfile((s) => s.equipment);
  const setEquipment = useProfile((s) => s.setEquipment);
  const markExported = useProfile((s) => s.markExported);
  const [pendingImport, setPendingImport] = useState<{
    /** The file itself, re-read on confirm. Photos are bytes now, not text. */
    bytes: Uint8Array;
    label: string;
    preview: ImportPreview;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{ takenAt: string; replacedWith: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  /** The preview card, so a launched backup can be scrolled to (M111). */
  const previewRef = useRef<HTMLDivElement>(null);
  /** Whether this page was opened *with* a file rather than navigated to. */
  const [arrived, setArrived] = useState(false);
  const csvRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState<CsvPending | null>(null);
  const byDate = useSessions((s) => s.byDate);
  const [demo, setDemo] = useState<{ loaded: boolean; offerable: boolean }>({
    loaded: false,
    offerable: false,
  });
  // Every session key already in the log, so an imported day never lands on
  // one the climber wrote here. Memoised on the store rather than rebuilt
  // per keystroke in the preview.
  const occupiedIds = useMemo(
    () => new Set(Object.values(byDate).flat().map((s) => s.id)),
    [byDate],
  );

  useEffect(() => {
    void refreshStorage();
    void mediaBytes().then(setPhotoBytes);
    void readSnapshot().then(setSnapshot);
  }, []);

  async function refreshStorage() {
    if (!('storage' in navigator)) return;
    const persisted = await navigator.storage.persisted?.().catch(() => false);
    const estimate = await navigator.storage.estimate?.().catch(() => undefined);
    setStorage({ persisted: persisted ?? null, usage: estimate?.usage, quota: estimate?.quota });
  }

  async function requestPersist() {
    const granted = await navigator.storage.persist?.().catch(() => false);
    setMessage(
      granted
        ? 'Storage is now persistent — the browser will not evict your data.'
        : 'The browser declined for now. Installing the app to your home screen usually grants it.',
    );
    void refreshStorage();
  }

  async function handleExport(withMedia = true) {
    // A .zip holding backup.json and the photos as photos (PLAN.md M53).
    // The old single-JSON form base64'd every picture, which cost a third of
    // their size in the file and several copies of it in memory.
    const { bytes, file } = await exportArchive({ media: withMedia });
    // Sample data does not leave as a backup (PLAN.md M110). The file is
    // named for what it is, and `markExported` is not called: `lastExportAt`
    // feeds the coach's "you have never exported a backup" rule, and a year
    // of someone else's training is not the thing that rule is about.
    const sample = await hasDemo();
    downloadFile(
      new Blob([bytes as BlobPart], { type: 'application/zip' }),
      `project-ascent-${sample ? 'sample-data' : 'backup'}-${file.exportedAt.slice(0, 10)}.zip`,
    );
    if (sample) {
      setMessage('Exported as sample data — this is not a backup, because none of it is yours.');
      void refreshStorage();
      return;
    }
    markExported();
    setMessage(
      withMedia && file.media?.length
        ? `Backup exported, including ${file.media.length} photo${file.media.length === 1 ? '' : 's'}.`
        : 'Backup exported.',
    );
  }

  async function handleFilePicked(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      // Validates before offering choices, and takes either format: the
      // archive this app writes now, or the plain JSON it wrote before.
      const { file: parsed, photosMissing } = readBackupFile(bytes);
      // Always preview, even on an empty device. "412 sessions will be added"
      // is worth reading whether or not there is anything to lose, and a
      // silent import gives a climber no way to notice they picked the wrong
      // file until the data is already in.
      const preview = await previewFile(parsed);
      const on = new Date(parsed.exportedAt);
      setPendingImport({
        bytes,
        label: `Exported ${on.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} from app version ${parsed.appVersion || 'unknown'}.`,
        preview,
      });
      // Said before the import rather than discovered after it.
      setMessage(
        photosMissing > 0
          ? `${photosMissing} photo${photosMissing === 1 ? '' : 's'} listed in this backup ${photosMissing === 1 ? 'is' : 'are'} missing from the file. Everything else is intact.`
          : null,
        photosMissing > 0,
      )
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.', true);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  /** What the sample-data card can offer right now (PLAN.md M110). */
  const refreshDemo = useCallback(async () => {
    setDemo({ loaded: await hasDemo(), offerable: await canLoadDemo() });
  }, []);

  useEffect(() => {
    void refreshDemo();
  }, [refreshDemo, byDate]);

  /**
   * A backup the app was opened with (PLAN.md M111).
   *
   * Straight into the same preview a picked file gets: an import is never
   * one tap from a file manager, because M20's whole point is that
   * "replace" and "merge" mean nothing until you can see what they would do.
   */
  useEffect(() => {
    const opened = takeLaunchFile();
    if (!opened) return;
    setArrived(true);
    void handleFilePicked([opened] as unknown as FileList);
    // Once, on mount: `takeLaunchFile` clears as it returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Bring the preview to the climber, rather than the other way round.
   *
   * A picked file is previewed next to the button that picked it, already on
   * screen. A launched one arrives at the top of a long page — palettes,
   * text size, grade notation — with the thing they actually tapped several
   * screens below and no sign it is there.
   */
  useEffect(() => {
    if (!arrived || !pendingImport) return;
    previewRef.current?.scrollIntoView({ block: 'center' });
    setArrived(false);
  }, [arrived, pendingImport]);

  async function startDemo() {
    setBusy(true);
    try {
      const made = await loadDemo();
      const program = getProgram(made.programId);
      const profile = useProfile.getState();
      // Through the store's own actions, because they are what persist.
      // Writing the profile with `setState` and then re-hydrating threw the
      // whole thing away on the next read — the sample climber came back
      // with no program and no injury.
      //
      // The start date is seeded first: `startProgram` keeps an existing one
      // rather than stamping today, which is what backdates the block to
      // week six instead of week one.
      useProfile.setState((p) => ({
        startDates: { ...p.startDates, [made.programId]: made.startDate },
      }));
      // The program's own recommended week, which is what a climber picking
      // it from the catalogue gets offered first.
      const layout = program ? layoutsFor(program)[0] : undefined;
      profile.startProgram(made.programId, layout ? planFromLayout(layout) : {});
      for (const injury of demoInjuries()) profile.restoreInjury(injury);
      await hydrateAll();
      setMessage('Sample data loaded. Nothing in it happened.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not load the sample data.', true);
    } finally {
      setBusy(false);
      void refreshDemo();
      void refreshStorage();
    }
  }

  async function clearDemo() {
    setBusy(true);
    try {
      const gone = await wipeDemo();
      const profile = useProfile.getState();
      profile.stopProgram();
      for (const injury of demoInjuries()) profile.removeInjury(injury.id);
      await hydrateAll();
      setMessage(`Sample data cleared — ${gone} record${gone === 1 ? '' : 's'}. Anything you logged yourself is still here.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not clear the sample data.', true);
    } finally {
      setBusy(false);
      void refreshDemo();
      void refreshStorage();
    }
  }

  /**
   * A spreadsheet, read but not written (PLAN.md M105).
   *
   * Parsing happens here so a file the app cannot read fails before any
   * preview is drawn; everything after this is the climber correcting a
   * column mapping over rows already in hand.
   */
  async function handleCsvPicked(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    try {
      const table = parseCsv(await file.text());
      if (table.length < 2) {
        setMessage('That file has a header and no rows under it.', true);
        return;
      }
      setCsv(pendingFrom(file.name, table));
    } catch (e) {
      setMessage(e instanceof CsvError ? e.message : 'That file could not be read as a spreadsheet.', true);
    } finally {
      if (csvRef.current) csvRef.current.value = '';
    }
  }

  async function confirmCsv(sessions: Session[]) {
    setBusy(true);
    try {
      // The same restore point the backup import takes, for the same
      // reason — and only where there is something to restore.
      if (await hasRealData()) await takeSnapshot(`${sessions.length} days from a spreadsheet`);
      await importAll(
        {
          app: 'project-ascent',
          schemaVersion: SCHEMA_VERSION,
          appVersion: APP_VERSION,
          exportedAt: new Date().toISOString(),
          // Only sessions. A spreadsheet of climbs says nothing about a
          // program, a project or a metric, and a merge that wrote empty
          // arrays over them would be a replace wearing another word.
          data: { meta: [], sessions, profile: [], programs: [], projects: [], metrics: [], game: [] },
        },
        'merge',
      );
      await hydrateAll();
      setSnapshot(await readSnapshot());
      setMessage(`${sessions.length} day${sessions.length === 1 ? '' : 's'} imported. You can undo this below.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.', true);
    } finally {
      setBusy(false);
      setCsv(null);
      void refreshStorage();
    }
  }

  async function confirmImport(mode: 'replace' | 'merge') {
    if (!pendingImport) return;
    setBusy(true);
    try {
      // The restore point comes first, and only when there is something to
      // restore — snapshotting an empty database would offer an undo that
      // undoes to nothing.
      if (await hasRealData()) {
        await takeSnapshot(pendingImport.label.replace(/\.$/, ''));
      }
      const backup = readBackupFile(pendingImport.bytes);
      await importAll(backup.file, mode, { blobs: backup.blobs });
      await hydrateAll();
      setSnapshot(await readSnapshot());
      setMessage(
        mode === 'replace'
          ? 'Backup imported — previous data replaced. You can undo this below.'
          : 'Backup merged into existing data. You can undo this below.',
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.', true);
    } finally {
      setBusy(false);
      setPendingImport(null);
      void refreshStorage();
    }
  }

  async function keepImport() {
    await clearSnapshot();
    setSnapshot(null);
    setMessage('Restore point discarded.');
    void refreshStorage();
  }

  async function undoImport() {
    setBusy(true);
    try {
      const ok = await restoreSnapshot();
      await hydrateAll();
      setSnapshot(null);
      setMessage(ok ? 'Import undone — your data is back as it was.' : 'Nothing to undo.', !ok);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Undo failed.', true);
    } finally {
      setBusy(false);
      void refreshStorage();
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <PageGrid>
        <Card title="Appearance">
          <div className="text-xs font-semibold text-ink-soft mb-1.5">Light or dark</div>
          {/* wrap: three chips do not fit 320px at the largest text size. */}
          <div className="flex flex-wrap gap-2 mb-4">
            {THEMES.map((t) => (
              <Chip key={t.value} active={theme === t.value} onClick={() => setTheme(t.value)}>
                {t.label}
              </Chip>
            ))}
          </div>

          <div className="text-xs font-semibold text-ink-soft mb-1.5">Palette</div>
          <div className="grid grid-cols-1 gap-2 mb-4">
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

          <div className="text-xs font-semibold text-ink-soft mb-1.5">Text size</div>
          <div className="flex flex-wrap gap-2">
            {TEXT_SIZES.map((size) => (
              <Chip key={size.value} active={textSize === size.value} onClick={() => setTextSize(size.value)}>
                <span style={{ fontSize: `${TEXT_SCALE[size.value]}em` }}>{size.label}</span>
              </Chip>
            ))}
          </div>
          <p className="text-xs text-ink-soft mt-2.5 leading-relaxed">
            If your system asks for more contrast, the High Contrast palette is used automatically — unless
            you have picked one yourself, in which case yours wins.
          </p>
        </Card>

        <Card title="Grades">
          <p className="text-sm text-ink-soft mb-3">
            Which notation you read. Grades are always stored on the V and YDS ladders, so switching
            re-labels your whole history rather than changing it — and you can type either notation
            wherever a grade is entered.
          </p>
          <div className="grid grid-cols-1 gap-3">
            <ScalePicker
              label="Boulders"
              options={[
                { value: 'V', sample: V_SAMPLE.map((g) => displayGrade('V', g, { ...display, boulder: 'V' })) },
                { value: 'Font', sample: V_SAMPLE.map((g) => displayGrade('V', g, { ...display, boulder: 'Font' })) },
              ]}
              value={display.boulder}
              onChange={setBoulderDisplay}
            />
            <ScalePicker
              label="Routes"
              options={[
                { value: 'YDS', sample: YDS_SAMPLE.map((g) => displayGrade('YDS', g, { ...display, route: 'YDS' })) },
                { value: 'French', sample: YDS_SAMPLE.map((g) => displayGrade('YDS', g, { ...display, route: 'French' })) },
              ]}
              value={display.route}
              onChange={setRouteDisplay}
            />
          </div>
          <p className="text-xs text-ink-soft mt-3 leading-relaxed">
            Conversions between systems are approximate — the grades were never designed to line up,
            and any chart that says otherwise is rounding. One rung each way is normal.
          </p>
        </Card>

        <Card title="Weight & height">
          <p className="text-sm text-ink-soft mb-3">
            Added weight on hangs and pull-ups, box-jump height, and the altimeter's total. Stored
            one way and re-labelled either way, the same as grades — switching does not change a
            number you logged. Edge depth stays in millimetres, which is what climbers say
            everywhere.
          </p>
          <ScalePicker
            label="Units"
            options={[
              { value: 'imperial', name: 'Imperial', sample: ['lbs', 'in', 'ft'] },
              { value: 'metric', name: 'Metric', sample: ['kg', 'cm', 'm'] },
            ]}
            value={units}
            onChange={setUnits}
          />
        </Card>

        <Card title="Sound & haptics">
          <p className="text-sm text-ink-soft mb-3">
            Timer beeps, game sounds and vibration. Tones are generated on the fly, so nothing is
            downloaded and nothing plays until you tap something.
          </p>
          <div className="flex gap-2">
            <Button
              variant={cues ? 'primary' : 'outline'}
              size="sm"
              onClick={() => {
                // Turning it on is a gesture; use it to unlock audio now
                // rather than leaving the first cue silent.
                unlock();
                setCues(true);
              }}
            >
              On
            </Button>
            <Button variant={cues ? 'outline' : 'primary'} size="sm" onClick={() => setCues(false)}>
              Off
            </Button>
          </div>
        </Card>

        <Card title="What you can train on">
          <p className="text-sm text-ink-soft mb-3">
            Used by the program finder and to build your warmups.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {GEAR.map((g) => {
              const on = equipment.includes(g.value);
              return (
                <Chip
                  key={g.value}
                  active={on}
                  onClick={() =>
                    setEquipment(on ? equipment.filter((e) => e !== g.value) : [...equipment, g.value])
                  }
                >
                  {g.label}
                </Chip>
              );
            })}
          </div>
        </Card>

        <TemplatesCard />

        <Card title="Your data">
          {/* Read-time repairs, said out loud (PLAN.md M44). Records that
              arrive in a shape the app cannot walk are repaired where that is
              honest and left out where it is not, and a climber whose list is
              quietly shorter than it was deserves to know which part of their
              data it happened to. */}
          {/* One spelling of this, shared with the data page (PLAN.md M80).
              The warning stays here, where a climber is already standing
              next to the import button that fixes it. */}
          {readingProblems().map((problem) => (
            <p key={problem.store} className="text-sm text-warn mb-3">
              {describeProblem(problem)}
            </p>
          ))}
          <p className="text-sm text-ink-soft mb-3">
            Everything lives on this device. Export a backup regularly — an offline app has no
            cloud copy to fall back on. The backup also carries your climbs, sessions, project
            burns and benchmarks as spreadsheets, so the data is readable without this app.
            {photoBytes > 0 && (
              <>
                {' '}Photos are included, which adds roughly {formatBytes(photoBytes)} — the
                backup is a .zip, so they go in at their own size.
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleExport(true)}>Export backup</Button>
            {photoBytes > 0 && (
              <Button variant="ghost" onClick={() => void handleExport(false)}>
                Without photos
              </Button>
            )}
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Import backup
            </Button>
            {/* Your climbing before this app (PLAN.md M105). Next to the
                backup import because it is the same question — "I have
                history, can it come in?" — and a climber looking for one
                will look here for the other. */}
            <Button variant="outline" onClick={() => csvRef.current?.click()}>
              Import a spreadsheet
            </Button>
            <Link href="/data" className={CHIP_LINK}>
              What is stored
            </Link>
            <Input
              ref={fileRef}
              type="file"
              accept="application/zip,.zip,application/json,.json"
              hidden
              onChange={(e) => void handleFilePicked(e.target.files)}
            />
            <Input
              ref={csvRef}
              type="file"
              accept="text/csv,text/tab-separated-values,.csv,.tsv,.txt"
              hidden
              onChange={(e) => void handleCsvPicked(e.target.files)}
            />
          </div>
        </Card>

        {pendingImport && (
          <div ref={previewRef}>
          <ImportPreviewCard
            preview={pendingImport.preview}
            fileLabel={pendingImport.label}
            busy={busy}
            onImport={(mode) => void confirmImport(mode)}
            onCancel={() => setPendingImport(null)}
          />
          </div>
        )}

        {csv && (
          <SpreadsheetImportCard
            pending={csv}
            occupied={occupiedIds}
            busy={busy}
            onChange={setCsv}
            onImport={(sessions) => void confirmCsv(sessions)}
            onCancel={() => setCsv(null)}
          />
        )}

        {snapshot && (
          <UndoImportCard
            takenAt={snapshot.takenAt}
            replacedWith={snapshot.replacedWith}
            busy={busy}
            onUndo={() => void undoImport()}
            onKeep={() => void keepImport()}
          />
        )}

        {/* A climber who does not exist (PLAN.md M110). Offered only on an
            empty log, because sample data in a real one is the whole risk —
            the same `hasRealData` gate the backup import uses. */}
        {(demo.loaded || demo.offerable) && (
          <Card title="Sample data">
            {demo.loaded ? (
              <>
                <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                  A year of someone else's training is loaded: sessions, three projects, an injury
                  and a set of benchmarks. None of it happened. Clearing it takes out exactly what
                  it put in — anything you logged yourself stays.
                </p>
                <Button variant="outline" disabled={busy} onClick={() => void clearDemo()}>
                  Clear the sample data
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-ink-soft mb-3 leading-relaxed">
                  Fills the app with a year of plausible training so every screen has something to
                  show — for a look around, a screenshot or a video. Offered only while your log is
                  empty, and it never touches anything you write afterwards.
                </p>
                <Button variant="outline" disabled={busy} onClick={() => void startDemo()}>
                  Load a sample climber
                </Button>
              </>
            )}
          </Card>
        )}

        <StorageCard
          storage={storage}
          offlineReady={offlineReady}
          onRequestPersist={() => void requestPersist()}
        />

        <Card title="Reference">
          <Link href="/guides" className="flex items-center gap-3 mb-3 pb-3 border-b border-line">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Guides</p>
              <p className="text-xs text-ink-soft mt-0.5">
                One per program, plus how the app works, starting out, outdoor climbing and
                managing an injury.
              </p>
            </div>
            <span className="text-ink-soft shrink-0" aria-hidden>
              →
            </span>
          </Link>
          {/* The library has always been here and never had a front door
              (PLAN.md M107). */}
          <Link href="/drills" className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Drills</p>
              <p className="text-xs text-ink-soft mt-0.5">
                Every drill the programs prescribe, how to run each one, and how many times you
                have actually done it.
              </p>
            </div>
            <span className="text-ink-soft shrink-0" aria-hidden>
              →
            </span>
          </Link>
          <Link href="/glossary" className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Glossary</p>
              <p className="text-xs text-ink-soft mt-0.5">
                Grades, gear, grip types, technique, and the exercises the programs name.
              </p>
            </div>
            <span className="text-ink-soft shrink-0" aria-hidden>
              →
            </span>
          </Link>
        </Card>

        <Card title="About">
          <p className="text-sm text-ink-soft">
            Project Ascent v{APP_VERSION} · data schema v{SCHEMA_VERSION} · fully offline, no
            account, no tracking.
          </p>
        </Card>

        {message && <p className="text-sm text-ink-soft px-1">{message}</p>}
      </PageGrid>
    </>
  );
}

/** One ladder's notation, shown by example rather than by name alone. */
/**
 * Pick one notation out of two, with a sample of each so the choice is
 * legible without knowing the names.
 *
 * `T extends string`, not `BoulderDisplay | RouteDisplay` — the component
 * does nothing scale-specific, and the narrower constraint only meant the
 * units picker could not reuse it (PLAN.md M48). `name` is for a value
 * whose stored key is not what you would print: "imperial" reads poorly
 * beside "V" and "Font".
 */
function ScalePicker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; name?: string; sample: string[] }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-ink-soft mb-1.5">{label}</div>
      <div className="grid grid-cols-1 gap-2">
        {options.map((o) => (
          <SelectableCard
            key={o.value}
            selected={value === o.value}
            onClick={() => onChange(o.value)}
            label={`${o.name ?? o.value}: ${o.sample.join(', ')}`}
            className="flex items-baseline gap-2 bg-sunken px-3 py-2.5"
          >
            <span className="font-semibold text-sm">{o.name ?? o.value}</span>
            <span className="text-sm text-ink-soft tabular-nums ml-auto">{o.sample.join(' · ')}</span>
          </SelectableCard>
        ))}
      </div>
    </div>
  );
}

/** Rename or delete saved session shapes. Creating one happens in the log. */
function TemplatesCard() {
  const templates = useTemplates((s) => s.templates);
  const hydrated = useTemplates((s) => s.hydrated);
  const load = useTemplates((s) => s.load);
  const rename = useTemplates((s) => s.rename);
  const remove = useTemplates((s) => s.remove);
  const restore = useTemplates((s) => s.restore);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  return (
    <Card title="Session templates">
      {templates.length === 0 ? (
        <p className="text-sm text-ink-soft leading-relaxed">
          None yet. Finish a session and save it as a template to set the next one up in one tap.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-2">
          {rankTemplates(templates).map((t) => (
            <li key={t.id} className="flex items-center gap-2 bg-sunken rounded-xl px-3 py-2.5">
              {editing === t.id ? (
                <>
                  <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={`Rename ${t.name}`}
                    autoFocus
                    size="compact"
                    className="flex-1 min-w-0 bg-surface"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void rename(t.id, draft);
                      setEditing(null);
                    }}
                    className="text-accent"
                  >
                    Done
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{t.name}</div>
                    <div className="text-xs text-ink-soft">
                      {t.uses === 0 ? 'Never used' : `Used ${t.uses}×`}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(t.id);
                      setDraft(t.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const gone = t;
                      void remove(gone.id).then(() => offerUndo(gone.name, () => restore(gone)));
                    }}
                    className="text-danger"
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/**
 * What the browser has promised, and how close it is to breaking it.
 *
 * Reads as a verdict rather than two numbers: "used 12.4 MB of 60.0 GB" is
 * true and tells a climber nothing. `storagePressure` decides what the
 * numbers mean, and the numbers stay underneath for anyone who wants them.
 */
function StorageCard({
  storage,
  offlineReady,
  onRequestPersist,
}: {
  storage: StorageStatus;
  offlineReady: boolean;
  onRequestPersist: () => void;
}) {
  const pressure = storagePressure(storage);
  const tone =
    pressure.level === 'full' || pressure.level === 'evictable'
      ? 'text-critical'
      : pressure.level === 'tight'
        ? 'text-warn'
        : pressure.level === 'fine'
          ? 'text-positive'
          : 'text-ink-soft';

  return (
    <Card title="Storage">
      <p className={`font-semibold text-sm ${tone}`}>{pressure.headline}</p>
      <p className="text-sm text-ink-soft mt-1 leading-relaxed">{pressure.detail}</p>

      {pressure.ratio !== null && (
        <div className="mt-3">
          <Meter
            value={pressure.ratio}
            label="Storage used"
            valueText={`${formatBytes(storage.usage)} of ${formatBytes(storage.quota)}`}
            tone={pressure.level === 'full' ? 'warn' : pressure.level === 'tight' ? 'warn' : 'accent'}
          />
          <p className="text-xs text-ink-soft mt-1 tabular-nums">
            {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
          </p>
        </div>
      )}

      {storage.persisted === false && (
        <Button size="sm" variant="outline" className="mt-3" onClick={onRequestPersist}>
          Request persistent storage
        </Button>
      )}

      {/* Not a banner. This app needs the network for nothing at all, so a
          running "you are offline" indicator would report a problem that does
          not exist. What is worth confirming once is the opposite: that
          everything is cached, so a session in a basement gym works. */}
      <p className="text-xs text-ink-soft mt-3 pt-3 border-t border-line leading-relaxed">
        {offlineReady
          ? 'Ready to work offline — the whole app is cached on this device. Nothing here needs a network.'
          : 'Caching the app for offline use. Once this finishes it works with no network at all.'}
      </p>
    </Card>
  );
}
