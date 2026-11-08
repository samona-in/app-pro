import { Redirect } from 'expo-router';

/**
 * Specialties are no longer part of onboarding.
 *
 * Kept as a redirect rather than deleted: a Pro who was mid-onboarding when
 * the app updated may still have a session whose `nextStep` is `skills`, and
 * that must continue to the next question instead of a missing route.
 */
export default function OnboardingSkills() {
  return <Redirect href="/onboarding/experience" />;
}
