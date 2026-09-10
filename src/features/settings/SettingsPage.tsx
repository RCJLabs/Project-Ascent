import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { APP_VERSION } from '@/version';
import { exportAll, hasRealData, importAll, parseExportFile, SCHEMA_VERSION } from '@/db';
import { previewFile, type ImportPreview } from '@/db/importPreview';
import { clearSnapshot, readSnapshot, restoreSnapshot, takeSnapshot } from '@/db/snapshot';
import { ImportPreviewCard, UndoImportCard } from './ImportPreviewCard';
import { mediaBytes } from '@/db/media';
import type { BodyPart } from '@/content/warmups';
import type { Equipment } from '@/content/types';
import { displayGrade, type BoulderDisplay, type RouteDisplay } from '@/engine/grades';
import { formatBytes, storagePressure } from '@/engine/offline';
import { useAppUpdate } from '@/store/appUpdate';
import { unlock } from '@/lib/cues';
import { hydrateAll } from '@/store';
import {
  SEVERITY_LABEL,
  STATUS_LABEL,
  useProfile,
  type InjurySeverity,
  type InjuryStatus,
} from '@/store/profile';
import { rankTemplates } from '@/engine/templates';
import { useTemplates } from '@/store/templates';
import { TEXT_SCALE, useSettings, type TextSize, type ThemePreference } from '@/store/settings';
import { PageGrid } from '@/ui/PageGrid';
import { Button } from '@/ui/Button';
import { announce } from '@/ui/Announce';
import { Card } from '@/ui/Card';
import { Meter } from '@/ui/Meter';
import { Chip, SelectableCard } from '@/ui/Chip';
import { THEMES as PALETTES } from '@/ui/themes';
import { Input } from '@/ui/Field';
import { PageHeader } from '@/ui/PageHeader';

const GEAR: { value: Equipment; label: string }[] = [
  { value: 'wall', label: 'Climbing wall' },
  { value: 'hangboard', label: 'Hangboard' },
  { value: 'campus', label: 'Campus board' },
  { value: 'gym', label: 'Weights & bands' },
];

const PARTS: { value: BodyPart; label: string }[] = [
  { value: 'fingers', label: 'Fingers' },
  { value: 'pulley', label: 'Pulley' },
  { value: 'wrist', label: 'Wrist' },
  { value: 'elbow', label: 'Elbow' },
  { value: 'shoulder', label: 'Shoulder' },
  { value: 'back', label: 'Back' },
  { value: 'hip', label: 'Hip' },
  { value: 'knee', label: 'Knee' },
  { value: 'ankle', label: 'Ankle' },
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
  const injuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const updateInjury = useProfile((s) => s.updateInjury);
  const markExported = useProfile((s) => s.markExported);
  const [pendingImport, setPendingImport] = useState<{
    text: string;
    label: string;
    preview: ImportPreview;
  } | null>(null);
  const [snapshot, setSnapshot] = useState<{ takenAt: string; replacedWith: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
    const file = await exportAll({ media: withMedia });
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-ascent-backup-${file.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
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
      const text = await file.text();
      const parsed = parseExportFile(text); // validate before offering choices
      // Always preview, even on an empty device. "412 sessions will be added"
      // is worth reading whether or not there is anything to lose, and a
      // silent import gives a climber no way to notice they picked the wrong
      // file until the data is already in.
      const preview = await previewFile(parsed);
      const on = new Date(parsed.exportedAt);
      setPendingImport({
        text,
        label: `Exported ${on.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })} from app version ${parsed.appVersion || 'unknown'}.`,
        preview,
      });
      setMessage(null)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.', true);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
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
      await importAll(parseExportFile(pendingImport.text), mode);
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
            If your system asks for more contrast, the Slate palette is used automatically — unless
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

        <Card title="Injuries">
          <p className="text-sm text-ink-soft mb-3 leading-relaxed">
            How bad it is decides what happens: something you are healing is kept out of your
            warmups and blocked in the finder, while a niggle — or a part you are deliberately
            loading again — is flagged beside the exercises that load it, and left to you.
          </p>
          {injuries.length > 0 && (
            <ul className="grid grid-cols-1 gap-2 mb-3">
              {injuries.map((injury) => (
                <li key={injury.id} className="bg-sunken rounded-xl px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <span className="font-semibold text-sm capitalize">{injury.part}</span>
                      <span className="text-xs text-ink-soft ml-2">since {injury.since}</span>
                    </div>
                    <Link
                      href={`/injury/${injury.id}`}
                      className="text-sm font-semibold text-accent shrink-0 py-1.5"
                    >
                      Open
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {(Object.keys(SEVERITY_LABEL) as InjurySeverity[]).map((level) => (
                      <Chip
                        key={level}
                        active={injury.severity === level}
                        onClick={() => updateInjury(injury.id, { severity: level })}
                        className="text-xs"
                      >
                        {SEVERITY_LABEL[level].label}
                      </Chip>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_LABEL) as InjuryStatus[]).map((state) => (
                      <Chip
                        key={state}
                        active={injury.status === state}
                        onClick={() => updateInjury(injury.id, { status: state })}
                        className="text-xs"
                      >
                        {STATUS_LABEL[state].label}
                      </Chip>
                    ))}
                    {injury.part !== 'back' &&
                      (['left', 'right', 'both'] as const).map((side) => (
                        <Chip
                          key={side}
                          active={injury.side === side}
                          onClick={() =>
                            updateInjury(injury.id, { side: injury.side === side ? undefined : side })
                          }
                          className="text-xs capitalize"
                        >
                          {side}
                        </Chip>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {PARTS.filter((p) => !injuries.some((i) => i.part === p.value)).map((p) => (
              <Chip key={p.value} active={false} onClick={() => addInjury(p.value)}>
                + {p.label}
              </Chip>
            ))}
          </div>
        </Card>

        <TemplatesCard />

        <Card title="Your data">
          <p className="text-sm text-ink-soft mb-3">
            Everything lives on this device. Export a backup regularly — an offline app has no
            cloud copy to fall back on.
            {photoBytes > 0 && (
              <>
                {' '}Photos are included, which adds roughly {formatBytes(Math.round(photoBytes * 1.34))}
                {' '}— they are stored as text in the file, so they take about a third more room.
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
            <Input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void handleFilePicked(e.target.files)}
            />
          </div>
        </Card>

        {pendingImport && (
          <ImportPreviewCard
            preview={pendingImport.preview}
            fileLabel={pendingImport.label}
            busy={busy}
            onImport={(mode) => void confirmImport(mode)}
            onCancel={() => setPendingImport(null)}
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
function ScalePicker<T extends BoulderDisplay | RouteDisplay>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; sample: string[] }[];
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
            label={`${o.value}: ${o.sample.join(', ')}`}
            className="flex items-baseline gap-2 bg-sunken px-3 py-2.5"
          >
            <span className="font-semibold text-sm">{o.value}</span>
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
                  <Button variant="ghost" size="sm" onClick={() => void remove(t.id)} className="text-danger">
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
