/** Mirrors `ExperienceLevel` in `@samona/types` and the Prisma enum. */
export const EXPERIENCE_LEVELS = [
  'UNDER_1_YEAR',
  'ONE_TO_THREE',
  'THREE_TO_FIVE',
  'FIVE_TO_TEN',
  'TEN_PLUS',
] as const;

/** Mirrors `AddressLabel` in `@samona/types` and the Prisma enum. */
export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;

/** Mirrors `Gender` in `@samona/types` and the Prisma enum. */
export const GENDER_VALUES = ['MALE', 'FEMALE', 'OTHER'] as const;

/** Upper bound on languages a Pro can list. */
export const LANGUAGE_MAX = 8;
