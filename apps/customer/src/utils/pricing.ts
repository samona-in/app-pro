import type { PricingModel, SkillOption } from '@samona/types';

/**
 * Client-side reading of a work's pricing configuration.
 *
 * This is display-only: the customer app shows the estimated total and the
 * server independently validates the quantity/duration and recomputes the
 * amount. Older catalogue responses may not carry the pricing fields, so every
 * helper falls back to the pre-existing behaviour (one fixed-price booking).
 */
const MINUTES_PER_HOUR = 60;
const DEFAULT_MIN_DURATION = 60;
const DEFAULT_MAX_DURATION = 8 * 60;
const DEFAULT_DURATION_STEP = 60;

export function pricingModelOf(skill: SkillOption | null | undefined): PricingModel {
  return skill?.pricingModel ?? 'PER_BOOKING';
}

/** The configured price for one unit/hour/booking, in paise. */
export function unitPricePaise(skill: SkillOption | null | undefined): number | null {
  const price = skill?.basePricePaise;
  return typeof price === 'number' && price >= 0 ? price : null;
}

export function minDurationMinutes(skill: SkillOption | null | undefined): number {
  return skill?.minDurationMinutes ?? DEFAULT_MIN_DURATION;
}

export function maxDurationMinutes(skill: SkillOption | null | undefined): number {
  return Math.max(minDurationMinutes(skill), skill?.maxDurationMinutes ?? DEFAULT_MAX_DURATION);
}

export function durationStepMinutes(skill: SkillOption | null | undefined): number {
  return Math.max(1, skill?.durationStepMinutes ?? DEFAULT_DURATION_STEP);
}

export function minQuantity(skill: SkillOption | null | undefined): number {
  return Math.max(1, skill?.minQuantity ?? 1);
}

export function maxQuantity(skill: SkillOption | null | undefined): number {
  return Math.max(minQuantity(skill), skill?.maxQuantity ?? 1);
}

/** The selection a customer starts with: the smallest valid booking. */
export function defaultSelection(skill: SkillOption | null | undefined): {
  quantity: number;
  durationMinutes: number | null;
} {
  if (pricingModelOf(skill) === 'PER_HOUR') {
    return { quantity: 1, durationMinutes: minDurationMinutes(skill) };
  }
  if (pricingModelOf(skill) === 'PER_UNIT') {
    return { quantity: minQuantity(skill), durationMinutes: null };
  }
  return { quantity: 1, durationMinutes: null };
}

export function clampQuantity(skill: SkillOption | null | undefined, quantity: number): number {
  return Math.min(maxQuantity(skill), Math.max(minQuantity(skill), Math.round(quantity)));
}

export function clampDuration(skill: SkillOption | null | undefined, minutes: number): number {
  const min = minDurationMinutes(skill);
  const max = maxDurationMinutes(skill);
  const step = durationStepMinutes(skill);
  const clamped = Math.min(max, Math.max(min, Math.round(minutes)));
  const steps = Math.round((clamped - min) / step);
  return Math.min(max, min + steps * step);
}

/**
 * The estimated total the customer sees before placing the request. The server
 * recalculates this from its own catalogue row; this value is never submitted
 * as a price.
 */
export function estimatedTotalPaise(
  skill: SkillOption | null | undefined,
  quantity: number,
  durationMinutes: number | null,
): number {
  const price = unitPricePaise(skill) ?? 0;
  switch (pricingModelOf(skill)) {
    case 'PER_UNIT':
      return price * clampQuantity(skill, quantity);
    case 'PER_HOUR':
      return Math.round(
        (price * (durationMinutes ?? minDurationMinutes(skill))) / MINUTES_PER_HOUR,
      );
    case 'PER_BOOKING':
    default:
      return price;
  }
}

/** "hinge" → "hinges", "switch" → "switches", "battery" → "batteries". */
export function pluralizeUnit(label: string, count: number): string {
  if (count === 1) return label;
  // Compound labels like "window/door" read better left alone.
  if (label.includes('/')) return label;
  if (/(s|x|z|ch|sh)$/i.test(label)) return `${label}es`;
  if (/[^aeiou]y$/i.test(label)) return `${label.slice(0, -1)}ies`;
  return `${label}s`;
}

/** "₹199 / hinge", "₹499 / hr", or the plain price for a fixed booking. */
export function formatUnitPrice(
  skill: SkillOption | null | undefined,
  formatRupees: (paise: number) => string,
): string | null {
  const price = unitPricePaise(skill);
  if (price === null) return null;
  const model = pricingModelOf(skill);
  if (model === 'PER_UNIT') return `${formatRupees(price)} / ${skill?.unitLabel ?? 'unit'}`;
  if (model === 'PER_HOUR') return `${formatRupees(price)} / hr`;
  return formatRupees(price);
}

/** "1 hr", "1.5 hr", "90 min" — durations are stored in minutes. */
export function formatDuration(minutes: number): string {
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min`;
  const hours = minutes / MINUTES_PER_HOUR;
  const rounded = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${rounded} hr`;
}

/**
 * The quantity/duration part of a placed booking, read from its frozen
 * snapshot. Null for a fixed-price booking, which needs no second line.
 */
export function describeJobQuantity(job: {
  pricingModel?: PricingModel;
  quantity?: number;
  unitLabel?: string | null;
  durationMinutes?: number | null;
  unitPricePaise?: number;
}): string | null {
  if (job.pricingModel === 'PER_UNIT') {
    const count = job.quantity ?? 1;
    return `${count} ${pluralizeUnit(job.unitLabel ?? 'unit', count)}`;
  }
  if (job.pricingModel === 'PER_HOUR' && job.durationMinutes != null) {
    return formatDuration(job.durationMinutes);
  }
  return null;
}
