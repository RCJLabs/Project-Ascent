import { Suspense, lazy, useEffect, useState } from 'react';
import { reportDbError } from '@/db/db';
import { Route, Router, Switch, useLocation } from 'wouter';
import { RouteBoundary } from '@/ui/ErrorBoundary';
import { useHashLocation } from 'wouter/use-hash-location';
import { HomePage } from '@/features/home/HomePage';
import { PlaceholderPage } from '@/features/placeholder/PlaceholderPage';
import { TodayRedirect } from '@/features/log/TodayRedirect';
/**
 * Every route is its own chunk but the three you cannot defer.
 *
 * Home is where the app opens, `/today` is a launcher shortcut, and the
 * placeholder is a few lines. Everything else is a tap away at most, and
 * the service worker precaches every chunk — so after the first visit a
 * lazy route is a cache read, and the app is still fully offline.
 *
 * Onboarding was the fourth until M123: a new install used to be sent to
 * `/welcome` before it saw anything else, so the page had to be in the
 * entry chunk. It is opt-in now, reached from a card on Home, and lazy
 * like everything else that is a tap away.
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
const WeekPage = lazy(() => import('@/features/week/WeekPage').then((m) => ({ default: m.WeekPage })));
const CareerPage = lazy(() => import('@/features/career/CareerPage').then((m) => ({ default: m.CareerPage })));
const AchievementsPage = lazy(() => import('@/features/climber/AchievementsPage').then((m) => ({ default: m.AchievementsPage })));
const BodyPage = lazy(() => import('@/features/body/BodyPage').then((m) => ({ default: m.BodyPage })));
const CoachPage = lazy(() => import('@/features/coach/CoachPage').then((m) => ({ default: m.CoachPage })));
const FinderPage = lazy(() => import('@/features/finder/FinderPage').then((m) => ({ default: m.FinderPage })));
const FinishPage = lazy(() => import('@/features/finish/FinishPage').then((m) => ({ default: m.FinishPage })));
const DataPage = lazy(() => import('@/features/data/DataPage').then((m) => ({ default: m.DataPage })));
const PrivacyPage = lazy(() => import('@/features/privacy/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
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
const GamePage = lazy(() => import('@/features/game/GamePage').then((m) => ({ default: m.GamePage })));
const GlossaryPage = lazy(() => import('@/features/glossary/GlossaryPage').then((m) => ({ default: m.GlossaryPage })));
const DrillsPage = lazy(() => import('@/features/drills/DrillsPage').then((m) => ({ default: m.DrillsPage })));
const DrillPage = lazy(() => import('@/features/drills/DrillPage').then((m) => ({ default: m.DrillPage })));
const WelcomePage = lazy(() => import('@/features/onboarding/WelcomePage').then((m) => ({ default: m.WelcomePage })));
/** The logger, and by a distance the largest route. Lazy, and lazy for
 *  real again since M124: from M117 to M123 Home imported its body
 *  statically, so the whole editor sat in the entry chunk and this
 *  `lazy()` bought a wrapper and nothing else. Home shows the pre-session
 *  card now and the editor is behind the tap — the split M115 measured,
 *  with M117's finding honoured, since the *button* is still eager. */
const LogPage = lazy(() => import('@/features/log/LogPage').then((m) => ({ default: m.LogPage })));
const AttachPage = lazy(() => import('@/features/media/AttachPage').then((m) => ({ default: m.AttachPage })));

import { sweepOrphanMedia } from '@/db/media';
import { hydrateAll } from '@/store';
import { loadPrograms, programsLoaded } from '@/content/programs';
import { drillsLoaded, loadDrills } from '@/content/drills';
import { applyTextSize, applyTheme, useSettings } from '@/store/settings';
import { AppShell } from '@/ui/AppShell';

export function App() {
  const theme = useSettings((s) => s.theme);
  const themeId = useSettings((s) => s.themeId);
  const textSize = useSettings((s) => s.textSize);

  useEffect(() => {
    void hydrateAll()
      .catch((error: unknown) => {
        // Boot must not end in an unhandled rejection (PLAN.md M151).
        // `hydrateAll` finishes with a project reconcile, which *writes* —
        // so a database that refuses takes the rest of boot down with it,
        // into a promise nothing was listening to. Every store's own read
        // is caught; this is the one step after them.
        reportDbError(error);
      })
      .then(() => {
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
        <Route path="/welcome">
          {/* Outside the shell — no tabs, no back link — so the shell's
              Suspense is not above it. The fallback matches the shell's:
              quiet, and never seen on a warm cache. */}
          <Suspense fallback={<div className="min-h-40" aria-busy="true" />}>
            <WelcomePage />
          </Suspense>
        </Route>
        <Route>
          <Shell />
        </Route>
      </Switch>
    </Router>
  );
}

/**
 * A file the operating system opened the app with (PLAN.md M111).
 *
 * `launchQueue` is how a file handler arrives, and it fires **once per
 * launch, before React has painted** — so the consumer is set as early as
 * an effect can run and the file is parked in `launchFile` for whichever
 * screen knows what to do with it.
 *
 * Both of the app's own files are `.json`, so the kind is read rather than
 * assumed: a shared program goes to the builder, a backup to settings, and
 * anything else goes nowhere at all rather than to whichever screen was
 * nearest.
 */
function useOpenedFile(): void {
  const [, navigate] = useLocation();

  useEffect(() => {
    const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
    if (!queue?.setConsumer) return;
    queue.setConsumer((params) => {
      void (async () => {
        const handle = params.files?.[0];
        if (!handle) return;
        // Where it goes is read out of the file, not guessed from its
        // name: `file_handlers` matches on extension and both of the app's
        // own JSON files are `.json`.
        // Loaded only once a file actually arrives: the sniffer and the
        // slot behind it are bytes every cold start would otherwise pay for
        // a launch that almost never happens.
        const { receiveLaunch } = await import('@/lib/launchFile');
        const target = await receiveLaunch(await handle.getFile());
        if (target !== null) navigate(target);
      })();
    });
  }, [navigate]);
}

/** The slice of the File Handling API this uses, which TypeScript has no
 *  lib for. Two calls, both guarded at the call site. */
interface LaunchQueue {
  setConsumer?: (consumer: (params: { files?: { getFile: () => Promise<File> }[] }) => void) => void;
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
  const [ready, setReady] = useState(() => programsLoaded() && drillsLoaded());
  useEffect(() => {
    if (ready) return;
    let live = true;
    // Both, because the drills are fetched too since M185 and a page that
    // reads `getDrill` on mount would otherwise render an empty library
    // once and never hear about it. One gate for the same reason there was
    // one before: gating the pages one by one is a chance to miss one.
    void Promise.all([loadPrograms(), loadDrills()]).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  return ready;
}

function Shell() {
  useOpenedFile();
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
          <Route path="/body" component={BodyPage} />
          <Route path="/achievements" component={AchievementsPage} />
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
          <Route path="/week/:start" component={WeekPage} />
          <Route path="/week" component={WeekPage} />
          {/* Gym mode was a route from M74 to M119; it is the logger's quick
              view now (PLAN.md M120), reached from Home's Quick log button
              (M124). The address stays for anyone who pinned the launcher
              shortcut. */}
          <Route path="/gym" component={TodayRedirect} />
          <Route path="/log/:date" component={LogPage} />
          <Route path="/attach" component={AttachPage} />
          <Route path="/today" component={TodayRedirect} />
          <Route path="/progress" component={ProgressPage} />
          <Route path="/journal" component={JournalPage} />
          <Route path="/assessments/:id" component={MetricDetailPage} />
          <Route path="/assessments" component={AssessmentsPage} />
          <Route path="/projects/:id" component={ProjectDetailPage} />
          <Route path="/projects" component={ProjectsPage} />
          <Route path="/injury/:id" component={InjuryPage} />
          <Route path="/game" component={GamePage} />
          <Route path="/guides/:id/:section" component={GuidePage} />
          <Route path="/guides/:id" component={GuidePage} />
          <Route path="/guides" component={GuideList} />
          <Route path="/glossary" component={GlossaryPage} />
          <Route path="/drills/:id" component={DrillPage} />
          <Route path="/drills" component={DrillsPage} />
          <Route path="/data" component={DataPage} />
          <Route path="/privacy" component={PrivacyPage} />
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
