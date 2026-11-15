import type { Href } from 'expo-router';
import type { OnboardingStep } from '@samona/types';

/**
 * The destination of a resumable onboarding step.
 *
 * Onboarding no longer has a generic documents screen. It asks for one
 * unambiguous proof — the Aadhaar card — and routes straight into the Aadhaar
 * capture flow. The step key is still `documents` because the profile's
 * completion signal (`hasDocuments`) did not change; keeping the mapping here
 * means every entry point that resumes onboarding (the entry redirect, the tab
 * guard, the job pool, review, the home prompt) lands on the same screen.
 */
export function onboardingHref(step: OnboardingStep | null | undefined): Href {
  if (step === 'documents') return '/aadhaar?source=onboarding';
  return `/onboarding/${step ?? 'intro'}` as Href;
}
