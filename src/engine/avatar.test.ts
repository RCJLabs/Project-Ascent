import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PALETTE,
  SKIN_TONES,
  STAGES,
  deriveAvatar,
  gearForLevel,
  groundForHeight,
  nextStage,
  poseForVitality,
  stageForLevel,
} from './avatar';

describe('stages', () => {
  it('rise without repeating and start at level zero', () => {
    const levels = STAGES.map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels[0]).toBe(0);
    expect(STAGES).toHaveLength(6);
  });

  it('hold the stage you reached until the next one', () => {
    expect(stageForLevel(0).name).toBe('Newcomer');
    expect(stageForLevel(7).name).toBe('Newcomer');
    expect(stageForLevel(8).name).toBe('Chalked up');
    expect(stageForLevel(999).name).toBe('Alpinist');
  });

  it('point at what is next, and at nothing past the top', () => {
    expect(nextStage(0)!.level).toBe(8);
    expect(nextStage(90)).toBeNull();
  });
});

describe('gear', () => {
  it('accumulates rather than replacing', () => {
    expect(gearForLevel(0)).toMatchObject({ chalk: false, harness: false, axe: false });
    expect(gearForLevel(8).chalk).toBe(true);
    const roped = gearForLevel(40);
    expect(roped).toMatchObject({ chalk: true, harness: true, rope: true, helmet: true });
    const alpine = gearForLevel(90);
    // Everything earned earlier is still worn.
    expect(alpine).toMatchObject({ chalk: true, harness: true, pack: true, jacket: true, axe: true });
  });

  it('does not hand out gear early', () => {
    expect(gearForLevel(19).harness).toBe(false);
    expect(gearForLevel(20).harness).toBe(true);
  });

  it('treats a nonsense level as level zero', () => {
    expect(deriveAvatar({ level: -50 }).gear.chalk).toBe(false);
    expect(deriveAvatar({ level: -50 }).stage.name).toBe('Newcomer');
  });
});

describe('ground', () => {
  it('follows the altimeter, not the level', () => {
    expect(groundForHeight(0)).toBe('gym');
    expect(groundForHeight(5_789)).toBe('gym');
    expect(groundForHeight(5_790)).toBe('rock');
    expect(groundForHeight(29_031)).toBe('rock');
    expect(groundForHeight(29_032)).toBe('alpine');
  });

  it('leaves a level-90 climber with no height in the gym', () => {
    expect(deriveAvatar({ level: 90, feet: 0 }).ground).toBe('gym');
  });
});

describe('pose', () => {
  it('reads vitality: fresh climbers move, tired ones hang', () => {
    expect(poseForVitality('fresh')).toBe('strong');
    expect(poseForVitality('worked')).toBe('steady');
    expect(poseForVitality('tired')).toBe('spent');
    expect(poseForVitality('cooked')).toBe('spent');
    expect(poseForVitality(undefined)).toBe('steady');
  });
});

describe('palette', () => {
  it('fills the gaps rather than dropping to defaults wholesale', () => {
    const config = deriveAvatar({ level: 0, palette: { skin: '#123456' } });
    expect(config.palette.skin).toBe('#123456');
    expect(config.palette.top).toBe(DEFAULT_PALETTE.top);
  });

  it('offers real skin choices', () => {
    // The outfit half of this rule moved to kits.test.ts with the table
    // itself (PLAN.md M213). Skin stays here: it is the one palette row no
    // kit sets and nothing can ever charge for.
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(SKIN_TONES).size).toBe(SKIN_TONES.length);
  });
});

describe('the build (PLAN.md M225)', () => {
  it('defaults to the figure every existing install is already looking at', () => {
    // Defaulting the other way would reshape a climber somebody has been
    // growing for months, without being asked and without being told.
    expect(deriveAvatar({ level: 0 }).figure).toBe('male');
  });

  it('carries the choice through', () => {
    expect(deriveAvatar({ level: 0, figure: 'female' }).figure).toBe('female');
  });

  it('changes nothing else about the climber', () => {
    // A build is paint. It must not reach the pose, the gear, the ground or
    // the stage — the pose especially, which is the one number the game
    // reads from training.
    const male = deriveAvatar({ level: 42, vitality: 'tired', feet: 30_000 });
    const female = deriveAvatar({ level: 42, vitality: 'tired', feet: 30_000, figure: 'female' });
    expect({ ...female, figure: 'male' }).toEqual(male);
  });
});

describe('deriveAvatar', () => {
  it('assembles the whole figure from three real numbers', () => {
    const config = deriveAvatar({ level: 42, vitality: 'tired', feet: 30_000 });
    expect(config).toMatchObject({ pose: 'spent', ground: 'alpine' });
    expect(config.gear.rope).toBe(true);
    expect(config.stage.name).toBe('On the sharp end');
    expect(config.next!.name).toBe('Approach ready');
  });
});
