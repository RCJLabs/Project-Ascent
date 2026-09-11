// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { ReactElement } from 'react';
import { getDb } from '@/db/db';
import { newProject, putProject } from '@/db/projects';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { hydrate, renderAt } from '@/test/render';

import { AltimeterPage } from '@/features/altimeter/AltimeterPage';
import { AscentPage } from '@/features/ascent/AscentPage';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';
import { BoardPage } from '@/features/challenges/BoardPage';
import { BuilderList } from '@/features/builder/BuilderList';
import { BuilderPage } from '@/features/builder/BuilderPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { CareerPage } from '@/features/career/CareerPage';
import { AchievementsPage } from '@/features/climber/AchievementsPage';
import { ClimberPage } from '@/features/climber/ClimberPage';
import { CoachPage } from '@/features/coach/CoachPage';
import { FinderPage } from '@/features/finder/FinderPage';
import { DataPage } from '@/features/data/DataPage';
import { GlossaryPage } from '@/features/glossary/GlossaryPage';
import { GymPage } from '@/features/gym/GymPage';
import { GuideList } from '@/features/guides/GuidePage';
import { GuidePage } from '@/features/guides/GuidePage';
import { HomePage } from '@/features/home/HomePage';
import { InjuryPage } from '@/features/injury/InjuryPage';
import { JournalPage } from '@/features/journal/JournalPage';
import { LogPage } from '@/features/log/LogPage';
import { MetricDetailPage } from '@/features/assessments/MetricDetailPage';
import { ObjectiveDetailPage } from '@/features/objectives/ObjectiveDetailPage';
import { ObjectivesPage } from '@/features/objectives/ObjectivesPage';
import { ProgramDetailPage } from '@/features/train/ProgramDetailPage';
import { FinishPage } from '@/features/finish/FinishPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { ProjectDetailPage } from '@/features/projects/ProjectDetailPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { SearchPage } from '@/features/search/SearchPage';
import { SessionEditorPage } from '@/features/builder/SessionEditorPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
import { StartProgramPage } from '@/features/plan/StartProgramPage';
import { TrainPage } from '@/features/train/TrainPage';
import { WelcomePage } from '@/features/onboarding/WelcomePage';
import { YearPage } from '@/features/career/YearPage';

/**
 * Every page mounts, empty and full (PLAN.md M43).
 *
 * The cheapest net over 12,934 lines that had 362 lines of test. It asserts
 * almost nothing about any single page — only that mounting it renders a
 * top-level heading and throws nothing — which is exactly the failure this
 * app kept shipping: a page that dies on the shape of the data behind it.
 * Two passes, because empty and full break differently: a chart with no
 * points and a chart with two years of them are different code paths, and
 * so are "no active program" and "mid-week-7".
 *
 * A third pass seeds records the app cannot read, because that is what an
 * older backup restores and what took `/journal` and `/search` down before
 * M44 checked shapes at the read boundary.
 */

const PAGES: [string, string, ReactElement][] = [
  ['home', '/', <HomePage />],
  ['climber', '/climber', <ClimberPage />],
  ['skills', '/skills', <SkillsPage />],
  ['achievements', '/achievements', <AchievementsPage />],
  ['coach', '/coach', <CoachPage />],
  ['review', '/review', <ReviewPage />],
  ['altimeter', '/altimeter', <AltimeterPage />],
  ['ascent', '/ascent', <AscentPage />],
  ['train', '/train', <TrainPage />],
  ['finder', '/find', <FinderPage />],
  ['builder list', '/build', <BuilderList />],
  ['career', '/career', <CareerPage />],
  ['year', '/year', <YearPage params={{}} />],
  ['objectives', '/objectives', <ObjectivesPage />],
  ['board', '/board', <BoardPage />],
  ['calendar', '/calendar', <CalendarPage />],
  ['log', '/log/2026-03-04', <LogPage params={{ date: '2026-03-04' }} />],
  ['gym', '/gym', <GymPage />],
  ['progress', '/progress', <ProgressPage />],
  ['finish', '/finish', <FinishPage />],
  ['journal', '/journal', <JournalPage />],
  ['assessments', '/assessments', <AssessmentsPage />],
  ['benchmark', '/assessments/dead_hang', <MetricDetailPage params={{ id: 'dead_hang' }} />],
  ['projects', '/projects', <ProjectsPage />],
  ['search', '/search', <SearchPage />],
  ['guides', '/guides', <GuideList />],
  ['guide', '/guides/iron_grip', <GuidePage params={{ id: 'iron_grip' }} />],
  ['glossary', '/glossary', <GlossaryPage />],
  ['settings', '/settings', <SettingsPage />],
  ['data', '/data', <DataPage />],
  ['program', '/train/iron_grip', <ProgramDetailPage params={{ id: 'iron_grip' }} />],
  ['start a program', '/train/iron_grip/start', <StartProgramPage params={{ id: 'iron_grip' }} />],
  ['welcome', '/welcome', <WelcomePage />],
];

/** Pages that only exist once there is a record to point them at. */
const WITH_RECORDS: [string, string, ReactElement][] = [
  ['project', '/projects/seeded', <ProjectDetailPage params={{ id: 'seeded' }} />],
  ['custom program', '/build/nope', <BuilderPage params={{ id: 'nope' }} />],
  ['session editor', '/build/nope/session/nope', <SessionEditorPage params={{ id: 'nope', typeId: 'nope' }} />],
  ['injury', '/injury/nope', <InjuryPage params={{ id: 'nope' }} />],
  ['objective', '/objectives/nope', <ObjectiveDetailPage params={{ id: 'nope' }} />],
];

async function fill(): Promise<void> {
  const grades = ['V2', 'V3', 'V4', 'V5', 'V6'];
  for (let i = 0; i < 120; i += 1) {
    const day = new Date(2025, 0, 2 + i * 2);
    const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    await putSession({
      ...newSession(date, 0),
      completed: true,
      rewarded: true,
      mode: i % 5 === 0 ? 'outdoor' : 'indoor',
      rpe: 4 + (i % 6),
      durationMin: 60 + (i % 60),
      warmup: i % 4 !== 0,
      notes: i % 9 === 0 ? 'Felt strong on the crimps.' : undefined,
      climbs: [
        { id: `s${i}`, grade: grades[i % 5]!, scale: 'V', count: 1 + (i % 3), result: 'send' },
        { id: `a${i}`, grade: grades[(i + 2) % 5]!, scale: 'V', count: 1, result: 'attempt' },
      ],
    });
  }
  await putProject({ ...newProject({ name: 'The Nose of It', grade: 'V6', scale: 'V' }), id: 'seeded' });
  for (const [i, metricId] of ['dead_hang', 'max_pushups', 'core_plank'].entries()) {
    await putMetricEntry({ metricId, date: `2025-0${i + 1}-15`, value: 30 + i * 10 });
    await putMetricEntry({ metricId, date: `2025-0${i + 4}-15`, value: 40 + i * 10 });
  }
}

/**
 * Records in the shape an older export leaves them.
 *
 * Every one still carries its key. That is not a courtesy: each store has a
 * `keyPath`, so IndexedDB rejects a record without one outright — from
 * `importAll` exactly as from here. A record missing its *identifier* can
 * never reach the database; a record missing anything else always can, and
 * those are the ones the app walked into.
 */
async function corrupt(): Promise<void> {
  const db = await getDb();
  const project = { ...newProject({ name: 'Missing Its Beta', grade: 'V5', scale: 'V' }), id: 'halfProject' };
  const { beta: _beta, ...noBeta } = project;
  await db.put('projects', noBeta as never);
  // No name: nothing to label it with, so it is dropped rather than shown blank.
  await db.put('projects', { id: 'noName', grade: 'V4', scale: 'V', createdAt: '2025-01-01' } as never);
  // A beta note with no date reached the journal as an entry with no date.
  await db.put('projects', {
    ...project,
    id: 'undatedNote',
    beta: [{ id: 'n', text: 'no date on this one' }],
  } as never);
  const { climbs: _climbs, ...noClimbs } = newSession('2025-06-06', 1);
  await db.put('sessions', noClimbs as never);
  // A benchmark with no number: nothing to plot.
  await db.put('metrics', { metricId: 'dead_hang', date: '2025-05-05' } as never);
}

async function mounts(path: string, element: ReactElement): Promise<void> {
  const view = renderAt(path, element);
  const h1 = await view.findByRole('heading', { level: 1 });
  expect(h1.textContent, `${path} rendered a heading with no words in it`).toBeTruthy();
}

describe('every page mounts', () => {
  describe('on a new install', () => {
    it.each(PAGES)('%s', async (_name, path, element) => {
      await hydrate();
      await mounts(path, element);
    });
  });

  describe('with a couple of years of logs', () => {
    it.each([...PAGES, ...WITH_RECORDS])('%s', async (_name, path, element) => {
      await fill();
      await hydrate();
      await mounts(path, element);
    });
  });

  describe('with records an older backup left broken', () => {
    it.each([...PAGES, ...WITH_RECORDS])('%s', async (_name, path, element) => {
      await fill();
      await corrupt();
      await hydrate();
      await mounts(path, element);
    });
  });

  it('covers every page the router can reach', () => {
    // The floor. This file is a list maintained by hand, and a list that
    // silently stops matching the router is the failure mode a coverage
    // check exists to catch (PLAN.md M40).
    const app = readFileSync('src/App.tsx', 'utf8');
    const routed = new Set([...app.matchAll(/component=\{(\w+)\}/g)].map((m) => m[1]!));
    routed.delete('TodayRedirect'); // A redirect, not a page: it renders nothing.
    const covered = new Set(
      [...PAGES, ...WITH_RECORDS].map(([, , element]) => {
        const type = element.type as { name?: string };
        return type.name ?? '';
      }),
    );
    const missing = [...routed].filter((name) => !covered.has(name));
    expect(missing, 'these routed pages are not mounted by any test').toEqual([]);
  });
});
