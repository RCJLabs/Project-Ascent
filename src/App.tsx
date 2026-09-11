import { Suspense, lazy, useEffect, useState } from 'react';
import { Route, Router, Switch, useLocation } from 'wouter';
import { RouteBoundary } from '@/ui/ErrorBoundary';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { LogPage, TodayRedirect } from '@/features/log/LogPage';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
/**
 * Every route is its own chunk but the four you cannot defer.
 *
 * Home is where the app opens, the logger is what it is for, onboarding is
 * the first thing a new install shows, and the placeholder is a few lines.
 * Everything else is a tap away at most, and the service worker precaches
 * every chunk — so after the first visit a lazy route is a cache read, and
 * the app is still fully offline.
 *
 * It started as six routes split by hand because they carried obvious
 * weight — the canvas game, the 844-line editor, the prose. That left
 * twenty-five pages in an entry chunk sitting at 894.6 KiB against its own
 * 900 KiB budget, with 0.6% of headroom for the next feature (PLAN.md M40).
 */
const AltimeterPage = lazy(() => import('@/features/altimeter/AltimeterPage').then((m) => ({ default: m.AltimeterPage })));
const AssessmentsPage = lazy(() => import('@/features/assessments/AssessmentsPage').then((m) => ({ default: m.AssessmentsPage })));
const BoardPage = lazy(() => import('@/features/challenges/BoardPage').then((m) => ({ default: m.BoardPage })));
const BuilderList = lazy(() => import('@/features/builder/BuilderList').then((m) => ({ default: m.BuilderList })));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage').then((m) => ({ default: m.CalendarPage })));
const CareerPage = lazy(() => import('@/features/career/CareerPage').then((m) => ({ default: m.CareerPage })));
const ClimberPage = lazy(() => import('@/features/climber/ClimberPage').then((m) => ({ default: m.ClimberPage })));
const CoachPage = lazy(() => import('@/features/coach/CoachPage').then((m) => ({ default: m.CoachPage })));
const FinderPage = lazy(() => import('@/features/finder/FinderPage').then((m) => ({ default: m.FinderPage })));
const FinishPage = lazy(() => import('@/features/finish/FinishPage').then((m) => ({ default: m.FinishPage })));
const GymPage = lazy(() => import('@/features/gym/GymPage').then((m) => ({ default: m.GymPage })));
const DataPage = lazy(() => import('@/features/data/DataPage').then((m) => ({ default: m.DataPage })));
const InjuryPage = lazy(() => import('@/features/injury/InjuryPage').then((m) => ({ default: m.InjuryPage })));
const JournalPage = lazy(() => import('@/features/journal/JournalPage').then((m) => ({ default: m.JournalPage })));
const MetricDetailPage = lazy(() => import('@/features/assessments/MetricDetailPage').then((m) => ({ default: m.MetricDetailPage })));
const ObjectiveDetailPage = lazy(() => import('@/features/objectives/ObjectiveDetailPage').then((m) => ({ default: m.ObjectiveDetailPage })));
const ObjectivesPage = lazy(() => import('@/features/objectives/ObjectivesPage').then((m) => ({ default: m.ObjectivesPage })));
const ProgramDetailPage = lazy(() => import('@/features/train/ProgramDetailPage').then((m) => ({ default: m.ProgramDetailPage })));
const ProgressPage = lazy(() => import('@/features/progress/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const ProjectDetailPage = lazy(() => import('@/features/projects/ProjectDetailPage').then((m) => ({ default: m.ProjectDetailPage })));
const ProjectsPage = lazy(() => import('@/features/projects/ProjectsPage').then((m) => ({ default: m.ProjectsPage })));
const ReviewPage = lazy(() => import('@/features/review/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const SkillsPage = lazy(() => import('@/features/skills/SkillsPage').then((m) => ({ default: m.SkillsPage })));
const StartProgramPage = lazy(() => import('@/features/plan/StartProgramPage').then((m) => ({ default: m.StartProgramPage })));
const TrainPage = lazy(() => import('@/features/train/TrainPage').then((m) => ({ default: m.TrainPage })));
const YearPage = lazy(() => import('@/features/career/YearPage').then((m) => ({ default: m.YearPage })));
const AscentPage = lazy(() => import('@/features/ascent/AscentPage').then((m) => ({ default: m.AscentPage })));
const BuilderPage = lazy(() => import('@/features/builder/BuilderPage').then((m) => ({ default: m.BuilderPage })));
const SessionEditorPage = lazy(() => import('@/features/builder/SessionEditorPage').then((m) => ({ default: m.SessionEditorPage })));
const GuideList = lazy(() => import('@/features/guides/GuidePage').then((m) => ({ default: m.GuideList })));
const GuidePage = lazy(() => import('@/features/guides/GuidePage').then((m) => ({ default: m.GuidePage })));
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((m) => ({ default: m.SearchPage })));
const GlossaryPage = lazy(() => import('@/features/glossary/GlossaryPage').then((m) => ({ default: m.GlossaryPage })));

import { sweepOrphanMedia } from '@/db/media';
import { hydrateAll } from '@/store';
import { loadPrograms, programsLoaded } from '@/content/programs';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { applyTextSize, applyTheme, useSettings } from '@/store/settings';
import { AppShell } from '@/ui/AppShell';

export function App() {
  const theme = useSettings((s) => s.theme);
  const themeId = useSettings((s) => s.themeId);
  const textSize = useSettings((s) => s.textSize);

  useEffect(() => {
    void hydrateAll().then(() => {
      // Photos outlive a deleted owner so an undo can hand them back
      // (PLAN.md M20, M30). Boot is the moment no undo can be pending, so
      // it is where the leftovers are collected. Deliberately not inside
      // `hydrateAll`: that also runs after an import, and a sweep there
      // would judge freshly-restored blobs against a half-written database.
      void sweepOrphanMedia().catch(() => {});
    });
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

/**
 * The router waits for the catalogue; the shell does not (PLAN.md M78).
 *
 * Twenty-two call sites read a program synchronously at render, and eight
 * pages do it with no hydration gate at all — a climber cold-loading
 * `#/train` would get an empty catalogue that never re-rendered. Gating
 * those eight one by one is eight chances to miss one. Gating the routes
 * here is one, and the nav still paints while the bodies are parsed.
 */
function useCatalogue(): boolean {
  const [ready, setReady] = useState(programsLoaded);
  useEffect(() => {
    if (ready) return;
    let live = true;
    void loadPrograms().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

function Shell() {
  useFirstRunRedirect();
  const [location] = useLocation();
  const catalogue = useCatalogue();
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
        {!catalogue ? (
          <div className="min-h-40" aria-busy="true" />
        ) : (
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
          <Route path="/finish/:id" component={FinishPage} />
          <Route path="/finish" component={FinishPage} />
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
          <Route path="/gym" component={GymPage} />
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
          <Route path="/guides/:id/:section" component={GuidePage} />
          <Route path="/guides/:id" component={GuidePage} />
          <Route path="/guides" component={GuideList} />
          <Route path="/glossary" component={GlossaryPage} />
          <Route path="/data" component={DataPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route>
            <PlaceholderPage title="Not found" subtitle="" body="That page does not exist." />
          </Route>
        </Switch>
        )}
        </Suspense>
        </RouteBoundary>
      </AppShell>
  );
}
