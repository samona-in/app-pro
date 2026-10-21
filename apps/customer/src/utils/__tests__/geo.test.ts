import { distanceMeters } from '../geo';

const VIJAYAWADA = { latitude: 16.5062, longitude: 80.648 };

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters(VIJAYAWADA, VIJAYAWADA)).toBe(0);
  });

  it('measures a thousandth of a degree of latitude as about 111 m', () => {
    const north = { latitude: VIJAYAWADA.latitude + 0.001, longitude: VIJAYAWADA.longitude };

    expect(distanceMeters(VIJAYAWADA, north)).toBeCloseTo(111, 0);
  });

  it('measures a hundredth of a degree as about 1.1 km', () => {
    const north = { latitude: VIJAYAWADA.latitude + 0.01, longitude: VIJAYAWADA.longitude };

    expect(distanceMeters(VIJAYAWADA, north)).toBeCloseTo(1112, -1);
  });

  it('is symmetric', () => {
    const elsewhere = { latitude: 17.385, longitude: 78.4867 };

    expect(distanceMeters(VIJAYAWADA, elsewhere)).toBeCloseTo(
      distanceMeters(elsewhere, VIJAYAWADA),
      6,
    );
  });

  it('keeps GPS jitter well under the move threshold', () => {
    const jitter = { latitude: VIJAYAWADA.latitude + 0.0002, longitude: VIJAYAWADA.longitude };

    expect(distanceMeters(VIJAYAWADA, jitter)).toBeLessThan(100);
  });
});
