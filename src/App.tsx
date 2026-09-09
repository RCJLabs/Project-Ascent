import { useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { AltimeterPage } from '@/features/altimeter/AltimeterPage';
import { AscentPage } from '@/features/ascent/AscentPage';
import { ClimberPage } from '@/features/climber/ClimberPage';
import { CoachPage } from '@/features/coach/CoachPage';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { InjuryPage } from '@/features/injury/InjuryPage';
import { BoardPage } from '@/features/challenges/BoardPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { CareerPage } from '@/features/career/CareerPage';
import { YearPage } from '@/features/career/YearPage';
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
import { BuilderList } from '@/features/builder/BuilderList';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { SessionEditorPage } from '@/features/builder/SessionEditorPage';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { ObjectivesPage } from '@/features/objectives/ObjectivesPage';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
import { hydrateAll } from '@/store';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
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
      <Switch>
        <Route path="/welcome" component={WelcomePage} />
        <Route>
          <Shell />
        </Route>
      </Switch>
    </Router>
  );
}

/**
 * Send a genuinely new install to the baseline flow, once. Anyone with data
 * — including a backup imported from before onboarding existed — is left
 * alone; `onboardedAt` being null is not by itself evidence of a fresh start.
 */
function useFirstRunRedirect(): void {
  const [location, navigate] = useLocation();
  const profileReady = useProfile((s) => s.hydrated);
  const onboardedAt = useProfile((s) => s.onboardedAt);
  const activeProgramId = useProfile((s) => s.activeProgramId);
  const sessionsReady = useSessions((s) => s.hydrated);
  const byDate = useSessions((s) => s.byDate);

  useEffect(() => {
    if (!profileReady || !sessionsReady) return;
    if (onboardedAt !== null || activeProgramId !== null) return;
    if (Object.keys(byDate).length > 0) return;
    if (location === '/welcome') return;
    navigate('/welcome', { replace: true });
  }, [profileReady, sessionsReady, onboardedAt, activeProgramId, byDate, location, navigate]);
}

function Shell() {
  useFirstRunRedirect();
  return (
      <AppShell>
        <Switch>
          <Route path="/" component={HomePage} />
          <Route path="/climber" component={ClimberPage} />
          <Route path="/skills" component={SkillsPage} />
          <Route path="/coach" component={CoachPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/altimeter" component={AltimeterPage} />
          <Route path="/ascent" component={AscentPage} />
          <Route path="/train" component={TrainPage} />
          <Route path="/find" component={FinderPage} />
          <Route path="/build/:id/session/:typeId" component={SessionEditorPage} />
          <Route path="/build/:id" component={BuilderPage} />
          <Route path="/build" component={BuilderList} />
          <Route path="/train/:id/start" component={StartProgramPage} />
          <Route path="/train/:id" component={ProgramDetailPage} />
          <Route path="/career" component={CareerPage} />
          <Route path="/year/:year" component={YearPage} />
          <Route path="/year" component={YearPage} />
          <Route path="/objectives/:id" component={ObjectiveDetailPage} />
          <Route path="/objectives" component={ObjectivesPage} />
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
          <Route path="/injury/:id" component={InjuryPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />
          </Route>
        </Switch>
      </AppShell>
  );
}
