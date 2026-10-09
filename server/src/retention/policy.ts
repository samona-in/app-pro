import type { RetentionCategory, RetentionFeatureFlags, RetentionPolicyConfig } from './types';
import { REPORT_ONLY_CATEGORIES, RETENTION_CATEGORIES } from './types';

export interface RetentionPolicyDeps {
  config: RetentionPolicyConfig;
  flags: RetentionFeatureFlags;
  now?: () => Date;
}

export function createRetentionPolicy(deps: RetentionPolicyDeps) {
  const now = deps.now ?? (() => new Date());

  function isCategoryEnabled(category: RetentionCategory): boolean {
    if (!deps.flags.enabled) return false;
    return deps.flags.categories[category] === true;
  }

  function getRetentionDays(category: RetentionCategory): number | undefined {
    const days = deps.config[category as keyof RetentionPolicyConfig];
    return typeof days === 'number' && days > 0 ? days : undefined;
  }

  /** Whether a period has been approved for a category, regardless of flags. */
  function hasPeriod(category: RetentionCategory): boolean {
    return getRetentionDays(category) !== undefined;
  }

  /**
   * Whether a category is permanently protected from automatic deletion.
   *
   * This is the last line of defence behind the flag check: even a misconfigured
   * enable flag and period cannot make a report-only category deletable.
   */
  function isReportOnly(category: RetentionCategory): boolean {
    return REPORT_ONLY_CATEGORIES.has(category);
  }

  function canDeleteCategory(category: RetentionCategory): boolean {
    if (isReportOnly(category)) return false; // permanent guard, before flags
    if (!isCategoryEnabled(category)) return false;
    const days = getRetentionDays(category);
    if (days === undefined) return false; // never delete if unset
    return true;
  }

  function expirationDate(category: RetentionCategory, baseDate: Date = now()): Date | undefined {
    const days = getRetentionDays(category);
    if (days === undefined) return undefined;
    const exp = new Date(baseDate.getTime() - days * 24 * 60 * 60 * 1000);
    return exp;
  }

  return {
    categories: RETENTION_CATEGORIES,
    isCategoryEnabled,
    getRetentionDays,
    hasPeriod,
    isReportOnly,
    canDeleteCategory,
    expirationDate,
    flags: deps.flags,
    config: deps.config,
  };
}

export type RetentionPolicy = ReturnType<typeof createRetentionPolicy>;

/** The retention slice of `AppConfig` the policy is built from. */
export interface RetentionConfig {
  enabled: boolean;
  dryRunDefault: boolean;
  safetyWindowDays: number;
  lockTtlMs: number;
  lockRetryMs: number;
  sweepMs: number;
  categories: Record<RetentionCategory, boolean>;
  periods: Partial<Record<RetentionCategory, number>>;
}

/** Builds the policy + flags pair from validated application config. */
export function retentionPolicyFromConfig(config: RetentionConfig): RetentionPolicy {
  return createRetentionPolicy({
    config: config.periods as RetentionPolicyConfig,
    flags: {
      enabled: config.enabled,
      dryRunDefault: config.dryRunDefault,
      safetyWindowDays: config.safetyWindowDays,
      lockTtlMs: config.lockTtlMs,
      lockRetryMs: config.lockRetryMs,
      categories: config.categories,
    },
  });
}
