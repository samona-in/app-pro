import type { SkillOption } from '@samona/types';
import {
  clampDuration,
  clampQuantity,
  describeJobQuantity,
  estimatedTotalPaise,
  formatDuration,
  pluralizeUnit,
  pricingModelOf,
} from '../pricing';

function skill(overrides: Partial<SkillOption>): SkillOption {
  return {
    id: 'skill-1',
    serviceId: 'service-1',
    slug: 'work',
    name: 'Work',
    icon: null,
    basePricePaise: 19_900,
    pricingModel: 'PER_BOOKING',
    ...overrides,
  };
}

describe('client pricing helpers', () => {
  it('falls back to a fixed booking for a catalogue row without pricing fields', () => {
    const legacy = skill({ pricingModel: undefined });
    expect(pricingModelOf(legacy)).toBe('PER_BOOKING');
    expect(estimatedTotalPaise(legacy, 1, null)).toBe(19_900);
  });

  it('multiplies a per-unit price by the clamped quantity', () => {
    const unit = skill({
      pricingModel: 'PER_UNIT',
      unitLabel: 'hinge',
      minQuantity: 2,
      maxQuantity: 5,
    });
    expect(clampQuantity(unit, 1)).toBe(2);
    expect(clampQuantity(unit, 9)).toBe(5);
    expect(estimatedTotalPaise(unit, 3, null)).toBe(59_700);
  });

  it('prices per-hour work by duration and clamps to the configured step', () => {
    const hourly = skill({
      pricingModel: 'PER_HOUR',
      minDurationMinutes: 60,
      maxDurationMinutes: 240,
      durationStepMinutes: 30,
    });
    expect(clampDuration(hourly, 75)).toBe(90);
    expect(clampDuration(hourly, 500)).toBe(240);
    expect(estimatedTotalPaise(hourly, 1, 90)).toBe(29_850);
  });

  it('formats durations and unit plurals', () => {
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1.5 hr');
    expect(pluralizeUnit('switch', 3)).toBe('switches');
    expect(pluralizeUnit('battery', 2)).toBe('batteries');
    expect(pluralizeUnit('window/door', 2)).toBe('window/door');
  });

  it('describes the frozen snapshot on a placed booking', () => {
    expect(
      describeJobQuantity({
        pricingModel: 'PER_UNIT',
        quantity: 2,
        unitLabel: 'fan',
      }),
    ).toBe('2 fans');
    expect(describeJobQuantity({ pricingModel: 'PER_HOUR', durationMinutes: 120 })).toBe('2 hr');
    expect(describeJobQuantity({ pricingModel: 'PER_BOOKING' })).toBeNull();
  });
});
