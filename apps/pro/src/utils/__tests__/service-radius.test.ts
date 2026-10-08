import {
  decideRadiusSave,
  translateFromValue,
  valueFromTranslate,
} from '../service-radius';

/**
 * The slider's pure geometry and save policy. The gesture itself cannot be
 * driven under Jest, so every branch that decides *whether* the network is
 * hit lives here as plain functions.
 */

describe('directional freedom (regression)', () => {
  const MIN = 1;
  const MAX = 50;
  const TRAVEL = 294;

  it('maps every whole kilometre to a strictly increasing position', () => {
    let prev: number | undefined;
    for (let km = MIN; km <= MAX; km += 1) {
      const pos = translateFromValue(km, MIN, MAX, TRAVEL);
      if (prev !== undefined) expect(pos).toBeGreaterThan(prev);
      prev = pos;
    }
  });

  it.each([
    [16, 17],
    [16, 20],
    [16, 15],
    [16, 10],
    [16, 5],
    [5, 16],
    [20, 8],
    [1, 50],
    [50, 1],
  ] as const)(
    'round-trips %i -> %i through the knob position',
    (start, next) => {
      const knob = translateFromValue(start, MIN, MAX, TRAVEL);
      const slid = translateFromValue(next, MIN, MAX, TRAVEL);
      expect(valueFromTranslate(slid, MIN, MAX, TRAVEL)).toBe(next);
      // The knob for the lower value always sits left of the higher one.
      expect(slid).not.toBe(knob);
    },
  );

  it('lets a thumb resting at 16 travel to 15 and 5, not only upwards', () => {
    const at16 = translateFromValue(16, MIN, MAX, TRAVEL);
    const at15 = translateFromValue(15, MIN, MAX, TRAVEL);
    const at5 = translateFromValue(5, MIN, MAX, TRAVEL);
    expect(at15).toBeLessThan(at16);
    expect(at5).toBeLessThan(at15);
    expect(valueFromTranslate(at16 - (at16 - at15), MIN, MAX, TRAVEL)).toBe(15);
  });
});

describe('service-radius slider', () => {
  describe('valueFromTranslate', () => {
    it('maps the start and end of the travel to the bounds', () => {
      expect(valueFromTranslate(0, 1, 50, 294)).toBe(1);
      expect(valueFromTranslate(294, 1, 50, 294)).toBe(50);
    });

    it('snaps to the nearest whole kilometre', () => {
      // 294px across 49 km ≈ 6px/km. px 72 is exactly km 13; px 75 is the
      // midpoint toward km 14, which rounds half-up to 14.
      expect(valueFromTranslate(75, 1, 50, 294)).toBe(14);
      expect(valueFromTranslate(10, 1, 50, 294)).toBe(3);
    });

    it('clamps a position dragged past the track', () => {
      expect(valueFromTranslate(-20, 1, 50, 294)).toBe(1);
      expect(valueFromTranslate(999, 1, 50, 294)).toBe(50);
    });

    it('falls back to the minimum when the track is not measured yet', () => {
      expect(valueFromTranslate(0, 1, 50, 0)).toBe(1);
    });
  });

  describe('translateFromValue', () => {
    it('places the bounds at the ends of the travel', () => {
      expect(translateFromValue(1, 1, 50, 294)).toBe(0);
      expect(translateFromValue(50, 1, 50, 294)).toBe(294);
    });

    it('places the midpoint halfway along the travel', () => {
      expect(translateFromValue(25.5, 1, 50, 294)).toBeCloseTo(147);
    });

    it('clamps a value outside the bounds', () => {
      expect(translateFromValue(0, 1, 50, 294)).toBe(0);
      expect(translateFromValue(60, 1, 50, 294)).toBe(294);
    });

    it('returns zero before the track is measured', () => {
      expect(translateFromValue(10, 1, 50, -10)).toBe(0);
    });
  });

  describe('decideRadiusSave', () => {
    it('saves a genuinely new value', () => {
      expect(decideRadiusSave(15, 10, false)).toEqual({ shouldSave: true });
    });

    it("skips a release on the value already saved", () => {
      expect(decideRadiusSave(10, 10, false)).toEqual({
        shouldSave: false,
        reason: 'same-value',
      });
    });

    it('skips a release while a save is in flight', () => {
      expect(decideRadiusSave(15, 10, true)).toEqual({
        shouldSave: false,
        reason: 'in-flight',
      });
    });
  });
});