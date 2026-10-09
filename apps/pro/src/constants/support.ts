import Constants from 'expo-constants';
import type { TranslationKey } from '@/i18n';

/**
 * Help & support screen data.
 *
 * Single source of truth for contact details and legal links. FAQ text is
 * stored as i18n keys so every locale stays in sync; the screen renders
 * whatever these constants reference.
 */

export const SUPPORT_PHONE = '8143929696';
export const SUPPORT_EMAIL = 'samona.official9@gmail.com';
/** Full international format (no '+'), assumed Indian +91. */
export const SUPPORT_WHATSAPP = '918143929696';

export const TERMS_URL = 'https://www.samona.in/terms-and-conditions';
export const PRIVACY_URL = 'https://www.samona.in/privacy-policy';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** A drop-in for the FAQ subject so "email us" always carries context. */
export function supportEmailUrl(subject?: string): string {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${SUPPORT_EMAIL}${query}`;
}

export const SUPPORT_ISSUE_SUBJECT = 'Support request - SAMONA Pro';

export const FAQ_CATEGORY_KEYS = [
  'helpSupport.faq.categories.onlineOffline',
  'helpSupport.faq.categories.jobsOffers',
  'helpSupport.faq.categories.earnings',
  'helpSupport.faq.categories.cancellations',
  'helpSupport.faq.categories.jobAlerts',
  'helpSupport.faq.categories.verification',
] as const;

export type FaqCategoryKey = (typeof FAQ_CATEGORY_KEYS)[number];

export interface FaqEntry {
  categoryKey: FaqCategoryKey;
  questionKey: TranslationKey;
  answerKey: TranslationKey;
}

/**
 * Ordered FAQ groups the screen renders in this order. Entries must reference
 * keys that exist in all three locale files (the key-parity test enforces this).
 */
export const FAQS: readonly FaqEntry[] = [
  {
    categoryKey: 'helpSupport.faq.categories.onlineOffline',
    questionKey: 'helpSupport.faq.entries.onlineOffline.goingOnline.q',
    answerKey: 'helpSupport.faq.entries.onlineOffline.goingOnline.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.onlineOffline',
    questionKey: 'helpSupport.faq.entries.onlineOffline.exactLocation.q',
    answerKey: 'helpSupport.faq.entries.onlineOffline.exactLocation.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.jobsOffers',
    questionKey: 'helpSupport.faq.entries.jobsOffers.acceptDecline.q',
    answerKey: 'helpSupport.faq.entries.jobsOffers.acceptDecline.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.jobsOffers',
    questionKey: 'helpSupport.faq.entries.jobsOffers.decline.q',
    answerKey: 'helpSupport.faq.entries.jobsOffers.decline.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.earnings',
    questionKey: 'helpSupport.faq.entries.earnings.whenPaid.q',
    answerKey: 'helpSupport.faq.entries.earnings.whenPaid.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.earnings',
    questionKey: 'helpSupport.faq.entries.earnings.breakdown.q',
    answerKey: 'helpSupport.faq.entries.earnings.breakdown.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.cancellations',
    questionKey: 'helpSupport.faq.entries.cancellations.customer.q',
    answerKey: 'helpSupport.faq.entries.cancellations.customer.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.cancellations',
    questionKey: 'helpSupport.faq.entries.cancellations.afterAccept.q',
    answerKey: 'helpSupport.faq.entries.cancellations.afterAccept.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.jobAlerts',
    questionKey: 'helpSupport.faq.entries.jobAlerts.missing.q',
    answerKey: 'helpSupport.faq.entries.jobAlerts.missing.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.jobAlerts',
    questionKey: 'helpSupport.faq.entries.jobAlerts.toggle.q',
    answerKey: 'helpSupport.faq.entries.jobAlerts.toggle.a',
  },
  {
    categoryKey: 'helpSupport.faq.categories.verification',
    questionKey: 'helpSupport.faq.entries.verification.profile.q',
    answerKey: 'helpSupport.faq.entries.verification.profile.a',
  },
];
