import { PricingModel } from '@samona/types';
import { badRequest } from '../common/errors';

/**
 * The pricing fields the booking service needs from a skill.
 *
 * Kept narrow so the server never has to trust anything the client says about
 * price: the catalogue row is the only input to the total.
 */
export interface PricedSkill {
  basePricePaise: number | null;
  pricingModel: PricingModel;
  unitLabel: string | null;
  minQuantity: number;
  maxQuantity: number;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  durationStepMinutes: number | null;
}

/** The frozen pricing snapshot written onto a job at creation. */
export interface JobPricingSnapshot {
  pricingModel: PricingModel;
  /** The skill price at booking time: per unit, per booking, or per hour. */
  unitPricePaise: number;
  quantity: number;
  unitLabel: string | null;
  durationMinutes: number | null;
  /** The server-calculated estimated total, in paise. */
  totalPaise: number;
}

/** Durations are rounded to whole hours in copy; this keeps the maths exact. */
const MINUTES_PER_HOUR = 60;

/**
 * Calculates one booking's price from the skill configuration.
 *
 * Rejects impossible requests rather than silently clamping them: a customer
 * who asks for 500 hinges should get a clear error, not a quietly reduced
 * booking. The client pre-clamps with the same minimums, so a rejection here
 * means the request was tampered with or the catalogue changed mid-flow.
 */
export function priceJob(
  skill: PricedSkill,
  requestedQuantity: number,
  requestedDurationMinutes: number | undefined,
): JobPricingSnapshot {
  const unitPricePaise = skill.basePricePaise;
  if (unitPricePaise === null || !Number.isInteger(unitPricePaise) || unitPricePaise < 0) {
    throw badRequest('This work is not priced yet. Choose another work or try again later.');
  }

  switch (skill.pricingModel) {
    case PricingModel.PER_UNIT: {
      const min = Math.max(1, skill.minQuantity);
      const max = Math.max(min, skill.maxQuantity);
      if (!Number.isInteger(requestedQuantity) || requestedQuantity < min) {
        throw badRequest(`Book at least ${min} ${unitWord(skill.unitLabel, min)}.`);
      }
      if (requestedQuantity > max) {
        throw badRequest(
          `You can book at most ${max} ${unitWord(skill.unitLabel, max)} at a time.`,
        );
      }
      return {
        pricingModel: PricingModel.PER_UNIT,
        unitPricePaise,
        quantity: requestedQuantity,
        unitLabel: skill.unitLabel,
        durationMinutes: null,
        totalPaise: unitPricePaise * requestedQuantity,
      };
    }

    case PricingModel.PER_HOUR: {
      const min = skill.minDurationMinutes ?? MINUTES_PER_HOUR;
      const max = Math.max(min, skill.maxDurationMinutes ?? 8 * MINUTES_PER_HOUR);
      const step = Math.max(1, skill.durationStepMinutes ?? MINUTES_PER_HOUR);
      const duration = requestedDurationMinutes ?? min;

      if (!Number.isInteger(duration) || duration < min || duration > max) {
        throw badRequest(`Choose a duration between ${formatHours(min)} and ${formatHours(max)}.`);
      }
      if ((duration - min) % step !== 0) {
        throw badRequest(`Choose a duration in ${formatHours(step)} steps.`);
      }

      return {
        pricingModel: PricingModel.PER_HOUR,
        unitPricePaise,
        quantity: 1,
        unitLabel: null,
        durationMinutes: duration,
        totalPaise: Math.round((unitPricePaise * duration) / MINUTES_PER_HOUR),
      };
    }

    case PricingModel.PER_BOOKING:
    default:
      // One booking is one visit: the quantity field is not meaningful here, so
      // a client asking for several is rejected rather than silently charged once.
      if (requestedQuantity > 1) {
        throw badRequest('This work is booked as a single visit.');
      }
      return {
        pricingModel: PricingModel.PER_BOOKING,
        unitPricePaise,
        quantity: 1,
        unitLabel: null,
        durationMinutes: null,
        totalPaise: unitPricePaise,
      };
  }
}

/** "hinge" / "hinges", with a neutral fallback when the admin left it blank. */
function unitWord(label: string | null, count: number): string {
  const word = label?.trim() || 'unit';
  if (count === 1 || word.includes('/')) return word;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  return `${word}s`;
}

/** "1 hour" / "1.5 hours" for validation messages. */
function formatHours(minutes: number): string {
  const hours = minutes / MINUTES_PER_HOUR;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${rounded} ${hours === 1 ? 'hour' : 'hours'}`;
}
