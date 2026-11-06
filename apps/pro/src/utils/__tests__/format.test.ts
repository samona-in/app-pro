import { formatInr, formatJobQuantity } from '../format';

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
