// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { newProject, putProject } from '@/db/projects';
import { putMetricEntry } from '@/db/metrics';
import { newSession, putSession } from '@/db/sessions';
import { addDays, dayOfWeek, today } from '@/engine/dates';
import { useProfile } from '@/store/profile';
import { useObjectives } from '@/store/objectives';
import { hydrate, renderAt, reset } from '@/test/render';

import { HomePage } from '@/features/home/HomePage';
import { ReviewPage } from '@/features/review/ReviewPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { CareerPage } from '@/features/career/CareerPage';
import { YearPage } from '@/features/career/YearPage';
import { JournalPage } from '@/features/journal/JournalPage';
import { ProjectsPage } from '@/features/projects/ProjectsPage';
import { ObjectivesPage } from '@/features/objectives/ObjectivesPage';
import { BoardPage } from '@/features/challenges/BoardPage';
import { TrainPage } from '@/features/train/TrainPage';
import { WeekPage } from '@/features/week/WeekPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
import { AchievementsPage } from '@/features/climber/AchievementsPage';
import { CoachPage } from '@/features/coach/CoachPage';
import { AssessmentsPage } from '@/features/assessments/AssessmentsPage';
import { BodyPage } from '@/features/body/BodyPage';

/**
 * One of everything, and every sentence that counts it (PLAN.md M268).
 *
 * `cardProse.test.ts` reads plural spellings out of `src/` and checks the
 * words a card can say. It cannot see a sentence that only exists once a
 * page has rendered — which is where both of the plural defects this run of
 * milestones found actually lived: M258's readiness column read *"1
 * objectives"* and M263's board row read *"1 days left"*, and each was
 * caught by a person looking at a screen.
 *
 * So: seed exactly one of everything, render the pages that count, and read
 * what they say. One is the only interesting number — it is the single case
 * where English disagrees with a template, and a page that gets it right
 * gets two and zero right by construction.
 *
 * **The clock is held.** M263's defect was visible only on a Friday, when a
 * weekly challenge has one day left in its window, and a suite that reads
 * the real clock would have found it one day in seven. This holds the same
 * Friday, which is the trap M261 shipped and M263 fixed.
 */

const FRIDAY = new Date(2026, 8, 18, 12, 0, 0);

const pages = (): [string, string, ReactElement][] => {
  const year = today().slice(0, 4);
  return [
    ['home', '/', <HomePage />],
    ['review', '/review', <ReviewPage />],
    ['progress', '/progress', <ProgressPage />],
    ['career', '/career', <CareerPage />],
    ['year', `/year/${year}`, <YearPage params={{ year }} />],
    ['journal', '/journal', <JournalPage />],
    ['projects', '/projects', <ProjectsPage />],
    ['objectives', '/objectives', <ObjectivesPage />],
    ['board', '/board', <BoardPage />],
    ['train', '/train', <TrainPage />],
    ['week', '/week', <WeekPage params={{}} />],
    ['calendar', '/calendar', <CalendarPage />],
    ['skills', '/skills', <SkillsPage />],
    ['achievements', '/achievements', <AchievementsPage />],
    ['coach', '/coach', <CoachPage />],
    ['assessments', '/assessments', <AssessmentsPage />],
    ['body', '/body', <BodyPage />],
  ];
};

/**
 * Everything the page says, with the nodes kept apart.
 *
 * `textContent` glues adjacent text nodes straight together, and the career
 * page renders a grade beside a count: it reads `"V4 · 5.10a1 day"`, where
 * the `1` has no word boundary in front of it and no `\b1` can ever match.
 * The first draft of this read that string and reported a clean page, which
 * the mutation battery caught by putting a real defect back and watching
 * nothing happen.
 */
function said(): string {
  const parts: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    parts.push(node.nodeValue ?? '');
  }
  return parts.join(' ').replace(/\s+/g, ' ');
}

/** Exactly one of everything a page might count. */
async function one(): Promise<void> {
  await reset();
  const when = addDays(today(), -2);
  await putSession({
    ...newSession(when, 0),
    completed: true,
    rewarded: true,
    mode: 'outdoor',
    rpe: 7,
    durationMin: 61,
    warmup: true,
    notes: 'One note.',
    partners: ['Sam'],
    // One venue, so the year's places count one day at one crag; and one
    // climb on each ladder, because "one of everything" has to mean one
    // boulder *and* one route — a fixture with only boulders never renders
    // the sentence that counts routes, which is how the first draft of this
    // let three of its four mutants live.
    fields: { location: 'One Crag' },
    climbs: [
      { id: 'c1', grade: 'V4', scale: 'V', count: 1, result: 'send' },
      { id: 'c2', grade: '5.10a', scale: 'YDS', count: 1, result: 'send', ropeStyle: 'lead' },
    ],
  } as never);
  await putProject({ ...newProject({ name: 'One Project', grade: 'V6', scale: 'V' }), id: 'p1' });
  await putMetricEntry({ metricId: 'dead_hang', date: when, value: 30 });
  await hydrate();
  useObjectives.setState({
    objectives: [
      {
        id: 'o1',
        name: 'One Trip',
        kind: 'trip',
        status: 'planning',
        requirements: [],
        targetDate: addDays(today(), 30),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ] as never,
    hydrated: true,
  });
  useProfile.setState({
    injuries: [
      { id: 'i1', part: 'elbow', since: when, severity: 'managing', status: 'active' },
    ] as never,
  });
}

/**
 * Words that follow a bare `1` with an `s` on the end and are not a count.
 *
 * Empty, and kept so that the next one has somewhere to go with a reason
 * beside it rather than a loosened regex.
 */
const NOT_COUNTED: string[] = [];

describe('one of everything', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(FRIDAY);
  });
  afterEach(() => vi.useRealTimers());

  it('is a Friday, which is when a weekly has one day left', () => {
    // The fixture's own premise. Without this the plural check below is
    // still true and no longer about anything.
    expect(dayOfWeek(today())).toBe(5);
  });

  /**
   * One pass, both questions.
   *
   * It was two tests and each rendered all seventeen pages, which took 4.4s
   * locally — close enough to vitest's five-second default that a slower CI
   * runner tipped it over and took a deploy down. Rendering seventeen pages
   * is the work; doing it twice was not.
   */
  it(
    'never says a plural about one of something, and does read the pages',
    async () => {
      const wrong: string[] = [];
      const counted: string[] = [];
      for (const [name, path, element] of pages()) {
        await one();
        renderAt(path, element);
        // The pages settle asynchronously — stores, then derived cards.
        await vi.advanceTimersByTimeAsync(150);
        const text = said();
        for (const match of text.matchAll(/\b1 ([a-z]{3,})s\b/g)) {
          if (NOT_COUNTED.includes(match[1]!)) continue;
          const at = match.index ?? 0;
          wrong.push(`${name}: "1 ${match[1]}s" — …${text.slice(Math.max(0, at - 50), at + 50)}…`);
        }
        for (const match of text.matchAll(/\b1 ([a-z]{3,})\b/g)) counted.push(`${name}: 1 ${match[1]}`);
      }
      expect([...new Set(wrong)]).toEqual([]);
      // A probe that cannot find a known-present instance is not a probe:
      // the check above is only worth anything if these pages really do
      // count out loud, and say "1 session" rather than "1 sessions".
      expect(counted.length, 'no page counted anything').toBeGreaterThan(0);
    },
    60_000,
  );
});
