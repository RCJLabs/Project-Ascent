// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetDbForTests } from '@/db/db';
import { loadPrograms } from '@/content/programs';
import { hydrate, renderAt, reset } from '@/test/render';
import { useProfile } from '@/store/profile';
import { AssessmentsPage } from './AssessmentsPage';
import { MetricDetailPage } from './MetricDetailPage';
import { METRICS } from '@/content/metrics';
import { CATALOGUE } from '@/content/programs/catalogue';
import type { Metric, MetricId } from '@/content/types';
import { metricConflict, metricLoads } from '@/engine/bodyLoad';
import { TestSafety } from './TestSafety';

/**
 * A maximal test, taken on a hurt finger, with nothing said (PLAN.md M161).
 *
 * `Metric` has no safety field and no body part, so M153's machinery — which
 * reads a protocol's authored warning and shows it in the logger — never
 * reached the one prescription that is a maximal effort by design.
 */

const m = (id: string): Metric => METRICS[id as MetricId]!;

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory();
  resetDbForTests();
  await reset();
  await loadPrograms();
  await hydrate();
});

describe('what a test loads, from its own words', () => {
  it.each([
    ['max_hang_20mm_7s', 'fingers'],
    ['min_edge', 'fingers'],
    ['repeater_weight', 'fingers'],
    ['density_hang_bw_20mm', 'fingers'],
    ['dead_hang', 'fingers'],
    ['weighted_pullup_3rm', 'elbow'],
    ['front_lever_hold', 'shoulder'],
    ['explosive_pullups', 'elbow'],
    ['max_pushups', 'shoulder'],
    ['wrist_extensor_curls', 'wrist'],
  ])('%s loads %s', (id, part) => {
    expect(metricLoads(m(id))).toContain(part);
  });

  /**
   * The one the scan could not read. A straight-leg forward fold names
   * neither a hip nor a hamstring, so the `hip` rule was widened rather than
   * a `loads` field added to a type for the sake of a single metric.
   */
  it('reads the one flexibility test in the catalogue', () => {
    expect(metricLoads(m('toe_touch'))).toContain('hip');
  });

  /**
   * And reads the *description*, not only the label. Six metrics name parts
   * their label does not, and two — Wall Angel and Flexibility — name
   * nothing at all without it. A scan over the label alone would pass every
   * other case in this file, which the battery showed.
   */
  it.each([
    ['wall_angel', 'shoulder'],
    ['flexibility', 'back'],
    ['landing_control', 'hip'],
    ['hollow_body', 'shoulder'],
  ])('reads %s out of its description', (id, part) => {
    expect(metricLoads({ label: m(id).label, description: undefined })).not.toContain(part);
    expect(metricLoads(m(id))).toContain(part);
  });

  /**
   * And says nothing about a metric that is a record rather than a test.
   * Nine of the thirty-seven are grades and counts — you do not *take* a
   * redpoint grade — and they name no movement, so they warn about nothing
   * without a list of which is which having to be kept true.
   */
  it.each([
    'redpoint_grade',
    'onsight_grade',
    'flash_grade',
    'max_boulder_grade',
    'max_sport_grade',
    'max_trad_grade',
    'max_alpine_grade',
    'total_outdoor_days',
    'project_high_point',
  ])('%s is a record, not a test, and reads as nothing', (id) => {
    expect(metricLoads(m(id))).toEqual([]);
    expect(metricConflict(m(id), ['fingers', 'elbow', 'shoulder'])).toBeNull();
  });
});

describe('the warning', () => {
  const showsFor = (id: string, injured: Parameters<typeof metricConflict>[1]) => {
    const { container } = render(<TestSafety metric={m(id)} injured={injured} />);
    return container.textContent ?? '';
  };

  it('speaks when the test loads what the climber said is hurt', () => {
    render(<TestSafety metric={m('max_hang_20mm_7s')} injured={['fingers']} />);
    expect(screen.getByText(/Before you test/i)).toBeTruthy();
    expect(screen.getByRole('note').textContent).toMatch(/told the app about your fingers/);
    expect(screen.getByRole('note').textContent).toMatch(/loads the fingers directly/);
  });

  it('is silent when nothing is hurt', () => {
    expect(showsFor('max_hang_20mm_7s', [])).toBe('');
  });

  it('is silent when what is hurt is not what the test loads', () => {
    expect(showsFor('max_hang_20mm_7s', ['knee'])).toBe('');
    expect(showsFor('max_pushups', ['fingers'])).toBe('');
  });

  /**
   * A max hang loads fingers *and* pulley. Naming both to someone who only
   * said their pulley hurts would read as the app guessing at the rest.
   */
  it('names only the parts the climber actually reported', () => {
    const text = showsFor('max_hang_20mm_7s', ['pulley']);
    expect(text).toMatch(/pulley/);
    expect(text).not.toMatch(/fingers and/);
  });

  /**
   * A climber with a hurt finger *and* a hurt knee meets a max hang as a
   * finger problem. Naming the knee too would be the app listing their
   * medical history back at them instead of saying what this test does.
   */
  it('names what the test loads, not everything that hurts', () => {
    const text = showsFor('max_hang_20mm_7s', ['fingers', 'knee']);
    expect(text).toMatch(/about your fingers/);
    expect(text).not.toMatch(/knee/);
  });

  /**
   * `fingers` is the only plural in `BodyPart`, and the first draft wrote
   * "your fingers is hurt" by agreeing a verb with the number of parts.
   * The sentence has no verb to agree now, and this holds it that way.
   */
  it('reads as English for the part that is plural', () => {
    const text = showsFor('max_hang_20mm_7s', ['fingers']);
    expect(text).not.toMatch(/fingers is/);
    expect(text).toMatch(/about your fingers, and/);
  });

  it('neither blocks nor prescribes, and says so', () => {
    const text = showsFor('min_edge', ['fingers']);
    expect(text).toMatch(/Nothing here is blocked/);
    expect(text).toMatch(/not medical advice/);
    // `returnToClimbing.ts` sets the rule: no exercise, dose or load for an
    // injury. A warning that suggested a rehab protocol would break it.
    expect(text).not.toMatch(/instead try|rehab|sets|reps/i);
  });

  it('fits one line in the list', () => {
    const { container } = render(
      <TestSafety metric={m('max_hang_20mm_7s')} injured={['fingers']} compact />,
    );
    expect(container.textContent).toMatch(/Loads your fingers/);
    expect(container.textContent).not.toMatch(/Before you test/);
  });
});

describe('the tests the catalogue actually prescribes', () => {
  /**
   * The finding is only worth anything if the maximal tests programs really
   * ask for are the ones this can read. Held against the catalogue so a new
   * assessment with words the scan cannot read shows up here.
   */
  it('can read every finger test a program prescribes', () => {
    const prescribed = new Set(CATALOGUE.flatMap((p) => p.assessments ?? []));
    const finger = ['max_hang_20mm_7s', 'min_edge', 'repeater_weight', 'density_hang_bw_20mm', 'dead_hang'];
    for (const id of finger) {
      expect(prescribed.has(id as MetricId), `${id} is no longer prescribed`).toBe(true);
      expect(metricConflict(m(id), ['fingers']), `${id} warns nobody`).not.toBeNull();
    }
  });

  /**
   * Recorded rather than changed: Two Days a Week is a `foundations`
   * program and the only one at that stage prescribing a maximal hang — its
   * neighbours Ground Zero and Base Camp use `dead_hang`. Whether the stage
   * or the assessment is wrong is a coaching decision, not a code one, so
   * this pins the state and will fail if someone changes it silently.
   */
  it('pins the one stage-versus-assessment mismatch, for a human to settle', () => {
    const byStage = (id: string) => CATALOGUE.find((p) => p.id === id)!.stage;
    expect(byStage('two_day_week')).toBe('foundations');
    expect(CATALOGUE.find((p) => p.id === 'two_day_week')!.assessments).toContain('max_hang_20mm_7s');
    for (const id of ['ground_zero', 'base_camp']) {
      expect(CATALOGUE.find((p) => p.id === id)!.assessments).not.toContain('max_hang_20mm_7s');
    }
  });
});


/**
 * And it is on the screens, not merely importable by them (PLAN.md M152's
 * lesson: an import satisfies a name check while rendering nothing). Both
 * the list a climber picks a test from and the page they take it on.
 */
describe('where a climber actually meets it', () => {
  /**
   * A hurt finger and a block that prescribes max hangs — the battery is
   * built from the running program, so without one the list has nothing in
   * it to warn about.
   */
  const hurtFinger = () =>
    useProfile.setState({
      injuries: [{ part: 'fingers', status: 'active' }] as never,
      activeProgramId: 'iron_grip',
      startDates: { iron_grip: '2026-01-05' },
    });

  it('warns in the list of benchmarks', async () => {
    hurtFinger();
    renderAt('/assessments', <AssessmentsPage />);
    await screen.findByText('Assessments');
    expect(screen.getAllByText(/Loads your fingers/).length).toBeGreaterThan(0);
  });

  it('warns in full once the row is opened, above the form', async () => {
    hurtFinger();
    renderAt('/assessments', <AssessmentsPage />);
    await screen.findByText('Assessments');
    const row = screen.getAllByRole('button').find((b) => /Max Hang/i.test(b.textContent ?? ''));
    expect(row, 'no max hang row to open').toBeTruthy();
    fireEvent.click(row!);
    expect(await screen.findByText(/Before you test/i)).toBeTruthy();
  });

  it('warns on the page the test is taken from', async () => {
    hurtFinger();
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByText('Max Hang 20mm 7s');
    expect(screen.getByRole('note').textContent).toMatch(/Before you test/i);
  });

  it('says nothing on either screen when nothing is hurt', async () => {
    hurtFinger();
    useProfile.setState({ injuries: [] });
    renderAt('/assessments/max_hang_20mm_7s', <MetricDetailPage params={{ id: 'max_hang_20mm_7s' }} />);
    await screen.findByText('Max Hang 20mm 7s');
    expect(screen.queryByRole('note')).toBeNull();

    renderAt('/assessments', <AssessmentsPage />);
    await screen.findByText('Assessments');
    expect(screen.queryByText(/Loads your/)).toBeNull();
  });
});
