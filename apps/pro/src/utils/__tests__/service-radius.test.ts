import { decideRadiusSave } from '../service-radius';

/**
 * The save policy lives here as a plain function so every branch that decides
 * *whether* the network is hit stays testable without mounting the slider.
 */

describe('service-radius slider', () => {
  describe('decideRadiusSave', () => {
    it('saves a genuinely new value', () => {
      expect(decideRadiusSave(15, 10, false)).toEqual({ shouldSave: true });
    });

    it('skips a release on the value already saved', () => {
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
