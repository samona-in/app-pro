import { Redirect } from 'expo-router';

/**
 * Gender is now asked on the combined name screen.
 *
 * Kept as a redirect rather than deleted: a Pro who was mid-onboarding when
 * the app updated may still have a session whose `nextStep` is `gender`, and
 * that must land on the combined question instead of a missing route.
 */
export default function OnboardingGender() {
  return <Redirect href="/onboarding/name" />;
}
