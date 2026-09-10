import { Suspense, lazy, useEffect } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { RouteBoundary } from '@/ui/ErrorBoundary';
import { useHashLocation } from 'wouter/use-hash-location';
import { AltimeterPage } from '@/features/altimeter/AltimeterPage';
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
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { ObjectivesPage } from '@/features/objectives/ObjectivesPage';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
/**
 * Split off the routes that carry weight and are not where anyone starts.
 *
 * The Ascent bundles a canvas game loop; the builder is 844 lines of
 * editor; the glossary and guides carry a few hundred KB of prose. None of
 * them is on the path from opening the app to logging a session, and all of
 * them were in the single 1,038KB chunk every visitor downloaded first.
 */
const AscentPage = lazy(() => import('@/features/ascent/AscentPage').then((m) => ({ default: m.AscentPage })));
const BuilderPage = lazy(() => import('@/features/builder/BuilderPage').then((m) => ({ default: m.BuilderPage })));
const SessionEditorPage = lazy(() => import('@/features/builder/SessionEditorPage').then((m) => ({ default: m.SessionEditorPage })));
const GuideList = lazy(() => import('@/features/guides/GuidePage').then((m) => ({ default: m.GuideList })));
const GuidePage = lazy(() => import('@/features/guides/GuidePage').then((m) => ({ default: m.GuidePage })));
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((m) => ({ default: m.SearchPage })));
const GlossaryPage = lazy(() => import('@/features/glossary/GlossaryPage').then((m) => ({ default: m.GlossaryPage })));

import { hydrateAll } from '@/store';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { applyTextSize, applyTheme, useSettings } from '@/store/settings';
import { AppShell } from '@/ui/AppShell';

export function App() {
  const theme = useSettings((s) => s.theme);
  const themeId = useSettings((s) => s.themeId);
  const textSize = useSettings((s) => s.textSize);

  useEffect(() => {
    void hydrateAll();
  }, []);

  useEffect(() => {
    applyTheme(theme, themeId);
  }, [theme, themeId]);

  useEffect(() => {
    applyTextSize(textSize);
  }, [textSize]);

  // A themed palette depends on which mode the system is in, so it has to be
  // repainted when that changes — otherwise switching the OS to dark at
  // 'system' leaves the light palette on top of the dark defaults.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const repaint = () => applyTheme(theme, themeId);
    query.addEventListener('change', repaint);
    return () => query.removeEventListener('change', repaint);
  }, [theme, themeId]);

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
  const [location] = useLocation();
  return (
      <AppShell>
        {/* Inside the shell, so a page that throws leaves the nav — and so a
            way out — standing. Keyed on the location: without that, a page
            that threw once stays broken for the rest of the run, even after
            navigating away and back. */}
        <RouteBoundary resetKey={location}>
        {/* A split route arrives a frame later. The fallback is deliberately
            quiet rather than a spinner: on a warm cache it is never seen,
            and a spinner that flashes for 20ms is worse than nothing. */}
        <Suspense fallback={<div className="min-h-40" aria-busy="true" />}>
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
          <Route path="/search" component={SearchPage} />
          <Route path="/guides/:id" component={GuidePage} />
          <Route path="/guides" component={GuideList} />
          <Route path="/glossary" component={GlossaryPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />
          </Route>
        </Switch>
        </Suspense>
        </RouteBoundary>
      </AppShell>
  );
}
