import { ONBOARDING_STEPS } from '@samona/types';
import { onboardingHref } from '../onboarding-route';

describe('onboardingHref', () => {
  it('sends the documents step into the Aadhaar flow, not a documents screen', () => {
    expect(onboardingHref('documents')).toBe('/aadhaar?source=onboarding');
  });

  it('keeps every other step on its own onboarding route', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step === 'documents') continue;
      expect(onboardingHref(step)).toBe(`/onboarding/${step}`);
    }
  });

  it('falls back to the intro step when the server has no resume point', () => {
    expect(onboardingHref(null)).toBe('/onboarding/intro');
  });
});
