import { useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { applyTheme, hydrateSettings, useSettings } from '@/store/settings';
import { AppShell } from '@/ui/AppShell';

export function App() {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    void hydrateSettings();
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <Router hook={useHashLocation}>
      <AppShell>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/train">
            <PlaceholderPage
              title="Train"
              subtitle="Programs, finder, and logging"
              body="The full program catalog lands in M1; the finder, weekly planning, and session logging in M2."
            />
          </Route>
          <Route path="/progress">
            <PlaceholderPage
              title="Progress"
              subtitle="Graphs, load, and projects"
              body="Grade progression, ACWR load management, pyramids, and project tracking land in M3."
            />
          </Route>
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />
          </Route>
        </Switch>
      </AppShell>
    </Router>
  );
}
