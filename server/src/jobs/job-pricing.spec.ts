import { PricingModel } from '@samona/types';
import { priceJob, type PricedSkill } from './job-pricing';

function skill(overrides: Partial<PricedSkill> = {}): PricedSkill {
  return {
    basePricePaise: 19_900,
    pricingModel: PricingModel.PER_BOOKING,
    unitLabel: null,
    minQuantity: 1,
    maxQuantity: 1,
    minDurationMinutes: null,
    maxDurationMinutes: null,
    durationStepMinutes: null,
    ...overrides,
  };
}

/** Asserts `priceJob` refuses the request with a 400 HttpError. */
function expectRejected(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ status: 400 });
    return;
  }
  throw new Error('Expected priceJob to reject the request.');
}

describe('priceJob', () => {
  it('rejects a skill that has no price yet', () => {
    expectRejected(() => priceJob(skill({ basePricePaise: null }), 1, undefined));
  });

  describe('PER_UNIT', () => {
    const unit = skill({
      pricingModel: PricingModel.PER_UNIT,
      unitLabel: 'hinge',
      minQuantity: 2,
      maxQuantity: 20,
    });

    it('multiplies the unit price by the quantity and freezes the snapshot', () => {
      expect(priceJob(unit, 3, undefined)).toEqual({
        pricingModel: 'PER_UNIT',
        unitPricePaise: 19_900,
        quantity: 3,
        unitLabel: 'hinge',
        durationMinutes: null,
        totalPaise: 59_700,
      });
    });

    it('rejects a quantity below the configured minimum', () => {
      expectRejected(() => priceJob(unit, 1, undefined));
    });

    it('rejects a quantity above the configured maximum', () => {
      expectRejected(() => priceJob(unit, 21, undefined));
    });

    it('rejects a fractional quantity', () => {
      expectRejected(() => priceJob(unit, 2.5, undefined));
    });
  });

  describe('PER_BOOKING', () => {
    it('charges the fixed price once and ignores any duration', () => {
      expect(priceJob(skill(), 1, 120)).toEqual({
        pricingModel: 'PER_BOOKING',
        unitPricePaise: 19_900,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        totalPaise: 19_900,
      });
    });

    it('rejects a quantity above one', () => {
      expectRejected(() => priceJob(skill(), 2, undefined));
    });
  });

  describe('PER_HOUR', () => {
    const hourly = skill({
      pricingModel: PricingModel.PER_HOUR,
      minDurationMinutes: 60,
      maxDurationMinutes: 480,
      durationStepMinutes: 30,
    });

    it('multiplies the hourly price by the duration in hours', () => {
      expect(priceJob(hourly, 1, 90)).toEqual({
        pricingModel: 'PER_HOUR',
        unitPricePaise: 19_900,
        quantity: 1,
        unitLabel: null,
        durationMinutes: 90,
        totalPaise: 29_850,
      });
    });

    it('falls back to the configured minimum when no duration is sent', () => {
      expect(priceJob(hourly, 1, undefined)).toMatchObject({
        durationMinutes: 60,
        totalPaise: 19_900,
      });
    });

    it('rejects a duration below the minimum or above the maximum', () => {
      expectRejected(() => priceJob(hourly, 1, 30));
      expectRejected(() => priceJob(hourly, 1, 510));
    });

    it('rejects a duration that is not on the configured step', () => {
      expectRejected(() => priceJob(hourly, 1, 75));
    });
  });
});
