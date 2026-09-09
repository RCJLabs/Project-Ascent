import { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '@/version';
import { exportAll, hasRealData, importAll, parseExportFile, SCHEMA_VERSION } from '@/db';
import type { BodyPart } from '@/content/warmups';
import type { Equipment } from '@/content/types';
import { useProfile } from '@/store/profile';
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
  const [storage, setStorage] = useState<StorageStatus>({ persisted: null });
  const [message, setMessage] = useState<string | null>(null);
  const equipment = useProfile((s) => s.equipment);
  const setEquipment = useProfile((s) => s.setEquipment);
  const injuries = useProfile((s) => s.injuries);
  const addInjury = useProfile((s) => s.addInjury);
  const removeInjury = useProfile((s) => s.removeInjury);
  const [pendingImport, setPendingImport] = useState<{ text: string; hasData: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void refreshStorage();
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

  async function handleExport() {
    const file = await exportAll();
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `project-ascent-backup-${file.exportedAt.slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup exported.');
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
      <div className="grid gap-3">
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
          <p className="text-sm text-ink-soft mb-3">
            Anything listed here is kept out of your warmups, and the finder will steer you away from
            programs that load it.
          </p>
          {injuries.length > 0 && (
            <ul className="grid gap-2 mb-3">
              {injuries.map((injury) => (
                <li
                  key={injury.id}
                  className="flex items-center justify-between gap-2 bg-sunken rounded-xl px-3 py-2.5"
                >
                  <div>
                    <span className="font-semibold text-sm capitalize">{injury.part}</span>
                    <span className="text-xs text-ink-soft ml-2">since {injury.since}</span>
                  </div>
                  <button
                    onClick={() => removeInjury(injury.id)}
                    className="text-sm font-semibold text-accent"
                  >
                    Healed
                  </button>
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

        <Card title="Your data">
          <p className="text-sm text-ink-soft mb-3">
            Everything lives on this device. Export a backup regularly — an offline app has no
            cloud copy to fall back on.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void handleExport()}>Export backup</Button>
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
