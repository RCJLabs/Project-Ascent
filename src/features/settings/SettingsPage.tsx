import { useEffect, useRef, useState } from 'react';
import { APP_VERSION } from '@/version';
import { exportAll, hasRealData, importAll, parseExportFile, SCHEMA_VERSION } from '@/db';
import { applyTheme, useSettings, type ThemePreference } from '@/store/settings';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

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
