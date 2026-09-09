import { useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { FinderPage } from '@/features/finder/FinderPage';
import { LogPage, TodayRedirect } from '@/features/log/LogPage';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { StartProgramPage } from '@/features/plan/StartProgramPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';
import { TrainPage } from '@/features/train/TrainPage';
import { hydrateAll } from '@/store';
import { applyTheme, useSettings } from '@/store/settings';
import { AppShell } from '@/ui/AppShell';

export function App() {
  const theme = useSettings((s) => s.theme);

  useEffect(() => {
    void hydrateAll();
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
          <Route path="/train/:id/start" component={StartProgramPage} />
          <Route path="/train/:id" component={ProgramDetailPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/log/:date" component={LogPage} />
          <Route path="/today" component={TodayRedirect} />
          <Route path="/progress" component={ProgressPage} />
          <Route path="/assessments/:id" component={MetricDetailPage} />
          <Route path="/assessments" component={AssessmentsPage} />
          <Route path="/projects/:id" component={ProjectDetailPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />
          </Route>
        </Switch>
      </AppShell>
    </Router>
  );
}
