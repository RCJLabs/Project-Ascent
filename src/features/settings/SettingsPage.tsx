import { useEffect, useRef, useState } from 'react';
import { Link } from 'wouter';
import { APP_VERSION } from '@/version';
import { exportAll, hasRealData, importAll, parseExportFile, SCHEMA_VERSION } from '@/db';
import { mediaBytes } from '@/db/media';
import type { BodyPart } from '@/content/warmups';
import { GLOSSARY } from '@/content/glossary';
import { GUIDES } from '@/content/guides';
import type { Equipment } from '@/content/types';
import { displayGrade, type BoulderDisplay, type RouteDisplay } from '@/engine/grades';
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
import { applyTheme, useSettings, type ThemePreference } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
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

function formatBytes(n?: number): string {
  if (n === undefined) return '?';
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function SettingsPage() {
  const theme = useSettings((s) => s.theme);
  const setTheme = useSettings((s) => s.setTheme);
  const cues = useSettings((s) => s.cues);
  const setCues = useSettings((s) => s.setCues);
  const display = useSettings((s) => s.display);
  const setBoulderDisplay = useSettings((s) => s.setBoulderDisplay);
  const setRouteDisplay = useSettings((s) => s.setRouteDisplay);
  const [storage, setStorage] = useState<StorageStatus>({ persisted: null });
  const [photoBytes, setPhotoBytes] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const equipment = useProfile((s) => s.equipment);
  const setEquipment = useProfile((s) => s.setEquipment);
  const injuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const updateInjury = useProfile((s) => s.updateInjury);
  const markExported = useProfile((s) => s.markExported);
  const [pendingImport, setPendingImport] = useState<{ text: string; hasData: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshStorage();
    void mediaBytes().then(setPhotoBytes);
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
      parseExportFile(text); // validate before offering choices
      const existing = await hasRealData();
      if (existing) {
        setPendingImport({ text, hasData: true });
        setMessage(null);
      } else {
        await importAll(parseExportFile(text), 'replace');
        await hydrateAll();
        setMessage('Backup imported.');
        void refreshStorage();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function confirmImport(mode: 'replace' | 'merge') {
    if (!pendingImport) return;
    try {
      await importAll(parseExportFile(pendingImport.text), mode);
      await hydrateAll();
      setMessage(mode === 'replace' ? 'Backup imported — previous data replaced.' : 'Backup merged into existing data.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Import failed.');
    } finally {
      setPendingImport(null);
      void refreshStorage();
    }
  }

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid grid-cols-1 gap-3">
        <Card title="Appearance">
          <div className="flex gap-2">
            {THEMES.map((t) => (
              <Button
                key={t.value}
                variant={theme === t.value ? 'primary' : 'outline'}
                size="sm"
                onClick={() => {
                  setTheme(t.value);
                  applyTheme(t.value);
                }}
              >
                {t.label}
              </Button>
            ))}
          </div>
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
                <button
                  key={g.value}
                  onClick={() =>
                    setEquipment(on ? equipment.filter((e) => e !== g.value) : [...equipment, g.value])
                  }
                  className={`rounded-xl px-3 py-2.5 border text-sm text-left ${
                    on ? 'border-accent bg-accent/10' : 'border-line bg-sunken text-ink-soft'
                  }`}
                >
                  {g.label}
                </button>
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
                      <button
                        key={level}
                        onClick={() => updateInjury(injury.id, { severity: level })}
                        title={SEVERITY_LABEL[level].blurb}
                        className={`rounded-lg px-2.5 py-1.5 border text-xs ${
                          injury.severity === level
                            ? 'border-accent bg-accent/10 font-semibold'
                            : 'border-line text-ink-soft'
                        }`}
                      >
                        {SEVERITY_LABEL[level].label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(Object.keys(STATUS_LABEL) as InjuryStatus[]).map((state) => (
                      <button
                        key={state}
                        onClick={() => updateInjury(injury.id, { status: state })}
                        title={STATUS_LABEL[state].blurb}
                        className={`rounded-lg px-2.5 py-1.5 border text-xs ${
                          injury.status === state
                            ? 'border-accent bg-accent/10 font-semibold'
                            : 'border-line text-ink-soft'
                        }`}
                      >
                        {STATUS_LABEL[state].label}
                      </button>
                    ))}
                    {injury.part !== 'back' &&
                      (['left', 'right', 'both'] as const).map((side) => (
                        <button
                          key={side}
                          onClick={() =>
                            updateInjury(injury.id, { side: injury.side === side ? undefined : side })
                          }
                          className={`rounded-lg px-2.5 py-1.5 border text-xs capitalize ${
                            injury.side === side
                              ? 'border-accent bg-accent/10 font-semibold'
                              : 'border-line text-ink-soft'
                          }`}
                        >
                          {side}
                        </button>
                      ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {PARTS.filter((p) => !injuries.some((i) => i.part === p.value)).map((p) => (
              <button
                key={p.value}
                onClick={() => addInjury(p.value)}
                className="rounded-lg px-2.5 py-1.5 border border-line bg-sunken text-sm text-ink-soft"
              >
                + {p.label}
              </button>
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
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={(e) => void handleFilePicked(e.target.files)}
            />
          </div>
          {pendingImport && (
            <div className="mt-3 border border-warn/50 rounded-xl p-3">
              <p className="text-sm font-semibold mb-2">
                This device already has data. How should the backup be applied?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => void confirmImport('merge')}>
                  Merge
                </Button>
                <Button size="sm" variant="danger" onClick={() => void confirmImport('replace')}>
                  Replace everything
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card title="Storage">
          <div className="text-sm space-y-1">
            <p>
              Persistent storage:{' '}
              <span className={storage.persisted ? 'text-positive font-semibold' : 'text-warn font-semibold'}>
                {storage.persisted === null ? 'unknown' : storage.persisted ? 'granted' : 'not granted'}
              </span>
            </p>
            <p className="text-ink-soft">
              Used {formatBytes(storage.usage)} of {formatBytes(storage.quota)}
            </p>
          </div>
          {storage.persisted === false && (
            <Button size="sm" variant="outline" className="mt-3" onClick={() => void requestPersist()}>
              Request persistent storage
            </Button>
          )}
        </Card>

        <Card title="Reference">
          <Link href="/guides" className="flex items-center gap-3 mb-3 pb-3 border-b border-line">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">Guides</p>
              <p className="text-xs text-ink-soft mt-0.5">
                {GUIDES.length} long-form guides — one per program, plus outdoor climbing and
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
                {GLOSSARY.length} terms — grades, gear, grip types, technique, and every exercise
                the programs name.
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
      </div>
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
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`flex items-baseline gap-2 rounded-xl px-3 py-2.5 border text-left ${
              value === o.value ? 'border-accent bg-accent/10' : 'border-line bg-sunken'
            }`}
          >
            <span className="font-semibold text-sm">{o.value}</span>
            <span className="text-sm text-ink-soft tabular-nums ml-auto">{o.sample.join(' · ')}</span>
          </button>
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
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    aria-label={`Rename ${t.name}`}
                    autoFocus
                    className="flex-1 min-w-0 bg-surface border border-line rounded-lg px-2.5 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => {
                      void rename(t.id, draft);
                      setEditing(null);
                    }}
                    className="text-sm font-semibold text-accent px-1"
                  >
                    Done
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{t.name}</div>
                    <div className="text-xs text-ink-soft">
                      {t.uses === 0 ? 'Never used' : `Used ${t.uses}×`}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setEditing(t.id);
                      setDraft(t.name);
                    }}
                    className="text-sm text-ink-soft px-1"
                  >
                    Rename
                  </button>
                  <button onClick={() => void remove(t.id)} className="text-sm text-danger px-1">
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
