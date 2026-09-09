import { useEffect } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AltimeterPage } from '@/features/altimeter/AltimeterPage';
import { AscentPage } from '@/features/ascent/AscentPage';
import { ClimberPage } from '@/features/climber/ClimberPage';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { BoardPage } from '@/features/challenges/BoardPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { FinderPage } from '@/features/finder/FinderPage';
import { LogPage, TodayRedirect } from '@/features/log/LogPage';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';
import { JournalPage } from '@/features/journal/JournalPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
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
          <Route path="/climber" component={ClimberPage} />
          <Route path="/skills" component={SkillsPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/altimeter" component={AltimeterPage} />
          <Route path="/ascent" component={AscentPage} />
          <Route path="/train" component={TrainPage} />
          <Route path="/find" component={FinderPage} />
          <Route path="/train/:id/start" component={StartProgramPage} />
          <Route path="/train/:id" component={ProgramDetailPage} />
          <Route path="/board" component={BoardPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route path="/log/:date" component={LogPage} />
          <Route path="/today" component={TodayRedirect} />
          <Route path="/progress" component={ProgressPage} />
          <Route path="/journal" component={JournalPage} />
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
