import { isProProfileComplete, nextIncompleteStep, OnboardingStatus } from '@samona/types';
import type { ProProfile } from '@samona/types';

const base: ProProfile = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.IN_PROGRESS,
  displayName: 'Asha Kumar',
  bio: null,
  experienceLevel: 'THREE_TO_FIVE',
  serviceRadiusKm: 10,
  latitude: null,
  longitude: null,
  locationLabel: null,
  languages: [],
  isOnline: false,
  isVerified: false,
  rating: null,
  completedJobs: 0,
  serviceIds: ['svc-1'],
  skillIds: ['skl-1'],
};

describe('isProProfileComplete', () => {
  it('accepts a profile with every required answer', () => {
    expect(isProProfileComplete(base)).toBe(true);
  });

  it('rejects a null profile', () => {
    expect(isProProfileComplete(null)).toBe(false);
  });

  it.each([
    ['no name', { displayName: null }],
    ['a name too short to be real', { displayName: 'A' }],
    ['a whitespace-only name', { displayName: '   ' }],
    ['no experience', { experienceLevel: null }],
    ['no services', { serviceIds: [] }],
    ['no specialties', { skillIds: [] }],
    ['no service radius', { serviceRadiusKm: 0 }],
  ])('rejects a profile with %s', (_label, patch) => {
    expect(isProProfileComplete({ ...base, ...patch } as ProProfile)).toBe(false);
  });

  it('does not require optional detail that is collected later', () => {
    // Bio, languages, photo, documents and payout details must never block a
    // Pro who is otherwise ready to work. They are absent from the parameter
    // type entirely, so completeness cannot come to depend on them by accident.
    const withoutOptionalDetail: ProProfile = { ...base, bio: null, languages: [] };

    expect(isProProfileComplete(withoutOptionalDetail)).toBe(true);
  });
});

describe('nextIncompleteStep', () => {
  it('starts at the intro when there is no profile', () => {
    expect(nextIncompleteStep(null)).toBe('intro');
  });

  it('resumes at the first unanswered step', () => {
    // The resume case: services chosen, specialties not.
    expect(nextIncompleteStep({ ...base, skillIds: [], experienceLevel: null })).toBe('skills');
  });

  it('asks for the name before anything else', () => {
    expect(nextIncompleteStep({ ...base, displayName: null, serviceIds: [] })).toBe('name');
  });

  it('sends a finished profile to review rather than a question', () => {
    expect(nextIncompleteStep(base)).toBe('review');
  });

  it('walks the whole flow in order as answers are filled in', () => {
    const empty: ProProfile = {
      ...base,
      displayName: null,
      serviceIds: [],
      skillIds: [],
      experienceLevel: null,
    };

    expect(nextIncompleteStep(empty)).toBe('name');
    expect(nextIncompleteStep({ ...empty, displayName: 'Asha' })).toBe('services');
    expect(nextIncompleteStep({ ...empty, displayName: 'Asha', serviceIds: ['s'] })).toBe('skills');
    expect(
      nextIncompleteStep({ ...empty, displayName: 'Asha', serviceIds: ['s'], skillIds: ['k'] }),
    ).toBe('experience');
  });
});
