import type { TFunction } from 'i18next';
import { formatInr, formatJobQuantity, formatWorkName, formatWorksCount } from '../format';
import { i18nInstance } from '@/i18n';

// The real English resources, so the keys the helpers format through are
// resolved exactly as the app resolves them.
const t = i18nInstance.t.bind(i18nInstance) as unknown as TFunction;

/**
 * Money is stored and passed around as integer paise (₹23 -> 2300) and only
 * becomes rupees here, so every surface that shows an amount goes through
 * `formatInr`. The conversion must not be repeated by callers.
 */
describe('formatInr', () => {
  it('converts paise to whole rupees', () => {
    expect(formatInr(2300)).toBe('₹23');
    expect(formatInr(8800)).toBe('₹88');
  });

  it('keeps up to two decimals for a non-whole rupee amount', () => {
    expect(formatInr(2350)).toBe('₹23.5');
    expect(formatInr(2355)).toBe('₹23.55');
  });

  it('groups thousands the Indian way', () => {
    expect(formatInr(15_000_000)).toBe('₹1,50,000');
  });

  it('renders an em dash when no amount is known', () => {
    expect(formatInr(null)).toBe('—');
    expect(formatInr(undefined)).toBe('—');
  });
});

describe('formatJobQuantity', () => {
  it('renders countable units with sensible plurals', () => {
    expect(formatJobQuantity({ pricingModel: 'PER_UNIT', quantity: 1, unitLabel: 'hinge' })).toBe(
      '1 hinge',
    );
    expect(formatJobQuantity({ pricingModel: 'PER_UNIT', quantity: 3, unitLabel: 'switch' })).toBe(
      '3 switches',
    );
    expect(formatJobQuantity({ pricingModel: 'PER_UNIT', quantity: 2, unitLabel: 'battery' })).toBe(
      '2 batteries',
    );
  });

  it('renders hourly durations and nothing for fixed-price work', () => {
    expect(formatJobQuantity({ pricingModel: 'PER_HOUR', durationMinutes: 90 })).toBe('1.5 hrs');
    expect(formatJobQuantity({ pricingModel: 'PER_BOOKING' })).toBeNull();
  });
});

describe('formatWorkName', () => {
  it('reads a custom work as its own text', () => {
    expect(formatWorkName({ customSkill: 'Gate motor hums', skill: { name: 'Other' } })).toBe(
      'Gate motor hums',
    );
  });

  it('falls back to the catalogue name when there is no custom text', () => {
    expect(formatWorkName({ customSkill: null, skill: { name: 'Fan installation' } })).toBe(
      'Fan installation',
    );
    expect(formatWorkName({ customSkill: '   ', skill: { name: 'Fan installation' } })).toBe(
      'Fan installation',
    );
  });
});

describe('formatWorksCount', () => {
  it('stays null for a single work or an unknown breakdown', () => {
    expect(formatWorksCount([{ quantity: 3 }], t)).toBeNull();
    expect(formatWorksCount([], t)).toBeNull();
    expect(formatWorksCount(null, t)).toBeNull();
    expect(formatWorksCount(undefined, t)).toBeNull();
  });

  it('counts only the works when each is a single unit', () => {
    expect(formatWorksCount([{ quantity: 1 }, { quantity: 1 }], t)).toBe('2 works');
  });

  it('sums the units when works carry quantities', () => {
    expect(formatWorksCount([{ quantity: 2 }, { quantity: 1 }, { quantity: 3 }], t)).toBe(
      '3 works · 6 items',
    );
  });

  it('treats a missing quantity as a single unit', () => {
    expect(formatWorksCount([{ quantity: null }, {}, { quantity: 1 }], t)).toBe('3 works');
  });
});
