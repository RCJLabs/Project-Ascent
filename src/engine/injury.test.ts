import { describe, expect, it } from 'vitest';
import type { Injury } from '@/store/profile';
import {
  RETURNING_RELIEF,
  SEVERITY_COST,
  concerning,
  describeInjury,
  injuryPolicy,
  summarise,
  vitalityCost,
} from './injury';

const injury = (patch: Partial<Injury> & Pick<Injury, 'part'>): Injury => ({
  id: `${patch.part}-1`,
  since: '2026-01-01',
  severity: 'managing',
  status: 'active',
  ...patch,
});

describe('what an injury excludes and what it only flags', () => {
  it('keeps load off something that is healing', () => {
    const policy = injuryPolicy([injury({ part: 'pulley', severity: 'serious' })]);
    expect(policy.excluded).toEqual(['pulley']);
    expect(policy.flagged).toEqual([]);
  });

  // A tweaky finger worth remembering should not strip a warmup as hard as
  // a rupture. That was the old behaviour, and it punished honesty.
  it('only flags a niggle', () => {
    const policy = injuryPolicy([injury({ part: 'elbow', severity: 'niggle' })]);
    expect(policy.excluded).toEqual([]);
    expect(policy.flagged).toEqual(['elbow']);
  });

  // The whole point of coming back is loading it again on purpose.
  it('flags rather than excludes a part in its return, whatever the severity', () => {
    const policy = injuryPolicy([injury({ part: 'pulley', severity: 'serious', status: 'returning' })]);
    expect(policy.excluded).toEqual([]);
    expect(policy.flagged).toEqual(['pulley']);
  });

  it('lets the stricter record win when one part is listed twice', () => {
    const policy = injuryPolicy([
      injury({ part: 'elbow', severity: 'niggle' }),
      injury({ part: 'elbow', severity: 'serious' }),
    ]);
    expect(policy.excluded).toEqual(['elbow']);
    expect(policy.flagged).toEqual([]);
  });

  it('collects everything recorded, however it is treated', () => {
    const policy = injuryPolicy([
      injury({ part: 'elbow', severity: 'niggle' }),
      injury({ part: 'knee', severity: 'serious' }),
    ]);
    expect(policy.all.sort()).toEqual(['elbow', 'knee']);
    expect(concerning(policy).sort()).toEqual(['elbow', 'knee']);
  });

  it('says nothing about a climber with nothing wrong', () => {
    const policy = injuryPolicy([]);
    expect(policy).toEqual({ excluded: [], flagged: [], all: [] });
    expect(concerning(policy)).toEqual([]);
  });
});

describe('what it costs in vitality', () => {
  // A flat cost per injury made a niggle and a rupture the same number.
  it('scales with how much it is actually costing you', () => {
    expect(vitalityCost([injury({ part: 'elbow', severity: 'niggle' })])).toBe(SEVERITY_COST.niggle);
    expect(vitalityCost([injury({ part: 'elbow', severity: 'serious' })])).toBe(SEVERITY_COST.serious);
    expect(SEVERITY_COST.serious).toBeGreaterThan(SEVERITY_COST.niggle);
  });

  it('charges less for a part being loaded again on purpose', () => {
    const healing = vitalityCost([injury({ part: 'pulley', severity: 'serious' })]);
    const returning = vitalityCost([injury({ part: 'pulley', severity: 'serious', status: 'returning' })]);
    expect(returning).toBe(Math.round(healing * RETURNING_RELIEF));
  });

  it('adds up across several', () => {
    const cost = vitalityCost([
      injury({ part: 'elbow', severity: 'niggle' }),
      injury({ part: 'knee', severity: 'managing' }),
    ]);
    expect(cost).toBe(SEVERITY_COST.niggle + SEVERITY_COST.managing);
  });

  it('costs nothing when nothing is wrong', () => {
    expect(vitalityCost([])).toBe(0);
  });

  it('survives an injury recorded before severity existed', () => {
    const legacy = { id: 'x', part: 'elbow', since: '2026-01-01' } as unknown as Injury;
    expect(vitalityCost([legacy])).toBe(SEVERITY_COST.managing);
  });
});

describe('wording', () => {
  it('names a side when there is one', () => {
    expect(describeInjury(injury({ part: 'elbow', side: 'left' }))).toBe('left elbow · healing');
  });

  it('does not give a back a side, which it does not have', () => {
    expect(describeInjury(injury({ part: 'back', side: 'left' }))).toBe('back · healing');
  });

  it('says when something is coming back rather than how bad it was', () => {
    expect(describeInjury(injury({ part: 'pulley', severity: 'serious', status: 'returning' })))
      .toBe('pulley · coming back');
  });

  it('leads with what is changing the app’s behaviour', () => {
    expect(summarise([injury({ part: 'elbow' })])).toBe('Training around an elbow');
    expect(summarise([injury({ part: 'knee', severity: 'niggle' })])).toBe('Watching a knee');
    expect(summarise([])).toBeNull();
  });

  it('joins several the way a sentence would', () => {
    const text = summarise([injury({ part: 'elbow' }), injury({ part: 'knee' }), injury({ part: 'ankle' })]);
    expect(text).toBe('Training around an elbow, a knee and an ankle');
  });
});
