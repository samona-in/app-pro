/**
 * Help & support screen data.
 *
 * Single source of truth for contact details, legal links and the static FAQ.
 * Swap in real values here; the screen renders whatever these export.
 */

export const SUPPORT_PHONE = '8143929696';
export const SUPPORT_EMAIL = 'samona.official9@gmail.com';
/** Full international format (no '+'), assumed Indian +91. */
export const SUPPORT_WHATSAPP = '918143929696';

export const TERMS_URL = 'https://www.samona.in/terms-and-conditions';
export const PRIVACY_URL = 'https://www.samona.in/privacy-policy';
export const APP_VERSION = '1.0.0';

/** A drop-in for the FAQ subject so "email us" always carries context. */
export function supportEmailUrl(subject?: string): string {
  const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
  return `mailto:${SUPPORT_EMAIL}${query}`;
}

export type FaqCategory = 'Booking' | 'Payment' | 'Account' | 'Safety';

export interface FaqEntry {
  category: FaqCategory;
  question: string;
  answer: string;
}

export const FAQS: readonly FaqEntry[] = [
  {
    category: 'Booking',
    question: 'How do I book a service?',
    answer:
      'Pick a service on the home screen, add the details and your address, review the estimate and confirm. A nearby professional responds with an offer you can accept or decline.',
  },
  {
    category: 'Booking',
    question: 'Can I change or cancel a booking?',
    answer:
      'Open the booking from the Bookings tab. If it has not been accepted yet you can cancel it there — the change is reflected right away for everyone.',
  },
  {
    category: 'Booking',
    question: 'What if the professional does not arrive?',
    answer:
      'Track the pro live from the bookings screen. If they do not show up, cancel the booking and the request will be looked at by other nearby professionals.',
  },
  {
    category: 'Payment',
    question: 'How does payment work?',
    answer:
      'The final price depends on the work actually done. You pay after the job is complete, using the payment option you chose at checkout.',
  },
  {
    category: 'Payment',
    question: 'Can I pay in cash?',
    answer:
      'Yes. Cash is an option when a job allows it — choose it at checkout and hand the amount to the professional after the work is done.',
  },
  {
    category: 'Payment',
    question: 'What is the refund policy?',
    answer:
      'If a paid job is cancelled before the work starts or a charged amount was incorrect, contact support and we will help you get the amount back.',
  },
  {
    category: 'Account',
    question: 'How do I update my name or photo?',
    answer:
      'Go to the Profile tab. Tap the photo to replace it, and your display name comes from your profile details on the same screen.',
  },
  {
    category: 'Account',
    question: 'How do I sign out?',
    answer:
      'Scroll to the bottom of the Profile tab and tap "Sign out". You can sign in again with your phone number any time.',
  },
  {
    category: 'Safety',
    question: 'How are professionals verified?',
    answer:
      'Every professional completes an onboarding flow that captures and verifies their identity, skills and service areas before they start getting job requests.',
  },
  {
    category: 'Safety',
    question: 'How is my data protected?',
    answer:
      'Your data is encrypted in transit and at rest, and only the minimal details needed to complete a booking are shared with a professional.',
  },
];