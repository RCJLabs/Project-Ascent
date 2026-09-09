import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * M17's "done when", made executable.
 *
 * The app spent its first sixteen milestones assuming a phone. On a 1280px
 * window `main` was 672px wide with 608px of dead space either side — 48% of
 * the viewport — under a bottom bar stretched across the whole width. This
 * file is what stops a later cleanup quietly putting that back.
 */

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const read = (path: string) => readFileSync(path, 'utf8');
const SHELL = read('src/ui/AppShell.tsx');

/**
 * Pages whose cards are independent readings, so a second column costs a
 * climber nothing but a glance sideways.
 */
const COLUMNS = [
  'src/features/altimeter/AltimeterPage.tsx',
  'src/features/assessments/AssessmentsPage.tsx',
  'src/features/builder/BuilderList.tsx',
  'src/features/career/CareerPage.tsx',
  'src/features/career/YearPage.tsx',
  'src/features/challenges/BoardPage.tsx',
  'src/features/climber/ClimberPage.tsx',
  'src/features/coach/CoachPage.tsx',
  'src/features/glossary/GlossaryPage.tsx',
  'src/features/home/HomePage.tsx',
  'src/features/journal/JournalPage.tsx',
  'src/features/objectives/ObjectivesPage.tsx',
  'src/features/progress/ProgressPage.tsx',
  'src/features/projects/ProjectsPage.tsx',
  'src/features/review/ReviewPage.tsx',
  'src/features/settings/SettingsPage.tsx',
  'src/features/skills/SkillsPage.tsx',
];

/**
 * Pages that stay one column, and why. Each of these has a reading order:
 * splitting it would turn "next" into "look right, then back left and down".
 */
const SINGLE: Record<string, string> = {
  'src/features/log/LogPage.tsx': 'the logger — each section feeds the next',
  'src/features/finder/FinderPage.tsx': 'a sequence of questions',
  'src/features/builder/BuilderPage.tsx': 'an editor — you are writing, not browsing',
  'src/features/builder/SessionEditorPage.tsx': 'an editor — you are writing, not browsing',
  'src/features/plan/StartProgramPage.tsx': 'a form, answered top to bottom',
  'src/features/train/ProgramDetailPage.tsx': 'phases are walked in order',
  'src/features/guides/GuidePage.tsx': 'prose, read in the order it is written',
  'src/features/injury/InjuryPage.tsx': 'prose, read in the order it is written',
  'src/features/ascent/AscentPage.tsx': 'a game, laid out by hand',
  'src/features/calendar/CalendarPage.tsx': 'a calendar is already a grid',
};

describe('the shell works beyond a phone', () => {
  it('carries both shapes on one nav element', () => {
    // Two navs — one for phones, one hidden until `lg` — would announce the
    // app's navigation twice and put every tab in the tab order twice.
    expect(SHELL.match(/<nav\b/g) ?? []).toHaveLength(1);
  });

  it('turns the bottom bar into a sidebar', () => {
    const nav = SHELL.slice(SHELL.indexOf('<nav'), SHELL.indexOf('</nav>'));
    expect(nav).toContain('fixed bottom-0');
    expect(nav).toContain('lg:static');
    expect(nav).toMatch(/lg:w-\d+/);
  });

  it('lets the content grow, but not without limit', () => {
    // Wide enough for two columns of cards; a 1,200px paragraph is
    // unreadable whatever the window is doing.
    expect(SHELL).toContain('max-w-2xl mx-auto lg:max-w-5xl');
  });
});

describe('which pages get a second column', () => {
  it('gives one to every browsing page', () => {
    const missing = COLUMNS.filter((path) => !read(path).includes('<PageGrid'));
    expect(missing).toEqual([]);
  });

  it('gives one to every branch of every browsing page', () => {
    // `includes('<PageGrid')` is not enough, and this is not hypothetical:
    // the conversion that built this milestone replaced the *first* grid in
    // each file, which on the progress page is the branch shown when nothing
    // is logged yet. The page a climber with 90 sessions actually sees stayed
    // one column, and the file still mentioned PageGrid.
    //
    // A branch that renders the page header and more than one card is a
    // whole-page render, so it needs the grid. A branch with a single card is
    // an empty state, which has nothing to put in a second column.
    const escaped: string[] = [];
    for (const path of COLUMNS) {
      const branches = read(path).split(/\breturn \(/);
      branches.forEach((branch, i) => {
        const cards = (branch.match(/<[A-Z]\w*Card\b|<Card\b/g) ?? []).length;
        if (branch.includes('<PageHeader') && cards > 1 && !branch.includes('<PageGrid')) {
          escaped.push(`${path} branch ${i}: ${cards} cards, one column`);
        }
      });
    }
    expect(escaped).toEqual([]);
  });

  it('keeps forms, editors and reading flows to one', () => {
    const split = Object.keys(SINGLE).filter((path) => read(path).includes('<PageGrid'));
    expect(split.map((p) => `${p} (${SINGLE[p]})`)).toEqual([]);
  });

  it('names a reason for every page held at one column', () => {
    for (const [path, reason] of Object.entries(SINGLE)) {
      expect(statSync(path).isFile(), `${path} is gone — drop it from the list`).toBe(true);
      expect(reason.length, `${path} needs a real reason`).toBeGreaterThan(8);
    }
  });

  it('is the only way a page splits into columns', () => {
    // A page hand-rolling `lg:grid-cols-2` at the top level is a page that
    // did not get the decision above made about it.
    const offenders = walk('src/features')
      .filter((path) => path.endsWith('.tsx'))
      .filter((path) => /^ {6}<\w+ className="grid grid-cols-1[^"]*lg:grid-cols-2/m.test(read(path)));
    expect(offenders).toEqual([]);
  });
});

describe('PageGrid', () => {
  const SRC = read('src/ui/PageGrid.tsx');

  it('stacks on a phone and splits when there is room', () => {
    expect(SRC).toContain('grid-cols-1');
    expect(SRC).toContain('lg:grid-cols-2');
  });

  it('does not stretch a short card to match a long one', () => {
    // A grid row is as tall as its tallest cell by default, and a stretched
    // short card reads as a rendering fault.
    expect(SRC).toContain('lg:items-start');
  });

  it('offers a way out for a child a column break would ruin', () => {
    // A control that governs the cards below it, and a row of figures laid
    // out horizontally, both break when squeezed into half the width.
    expect(SRC).toContain('lg:col-span-2');
  });
});
