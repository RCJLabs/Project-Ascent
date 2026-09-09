import { useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { FinderPage } from '@/features/finder/FinderPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';
import { TrainPage } from '@/features/train/TrainPage';
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
          <Route path="/train" component={TrainPage} />
          <Route path="/find" component={FinderPage} />
          <Route path="/train/:id" component={ProgramDetailPage} />
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
