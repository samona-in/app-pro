import {
  isProProfileComplete,
  nextIncompleteStep,
  ONBOARDING_STEPS,
  OnboardingStatus,
} from '@samona/types';
import type { ProProfile } from '@samona/types';
import { createProsService } from './pros.service';
import type { JobsService } from '../jobs/jobs.service';
import type { StorageService } from '../files/storage.service';

const baseRow = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.IN_PROGRESS as string,
  displayName: 'Asha Kumar',
  gender: 'FEMALE',
  bio: null,
  experienceLevel: 'THREE_TO_FIVE',
  serviceRadiusKm: 10,
  latitude: null,
  longitude: null,
  locationLabel: null,
  languages: [] as string[],
  selfiePhotoPath: null as string | null,
  isOnline: false,
  isVerified: false,
  rating: null,
  completedJobs: 0,
  services: [
    {
      serviceId: 'svc-1',
      status: 'PENDING',
      rejectionReason: null,
      service: { slug: 'plumbing', name: 'Plumbing', icon: 'wrench' },
    },
  ],
  skills: [{ skillId: 'skl-1' }],
};

const base: ProProfile = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.IN_PROGRESS,
  displayName: 'Asha Kumar',
  gender: 'FEMALE',
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
  hasSelfie: true,
  selfiePhotoUrl:
    'https://project.supabase.co/storage/v1/object/public/pro-selfies/pros/user-1/selfie.jpg',
  serviceIds: ['svc-1'],
  skillIds: ['skl-1'],
  proServices: [
    {
      id: 'svc-1',
      slug: 'plumbing',
      name: 'Plumbing',
      icon: 'wrench',
      status: 'PENDING',
      rejectionReason: null,
    },
  ],
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
    ['no gender', { gender: null }],
    ['no experience', { experienceLevel: null }],
    ['no services', { serviceIds: [] }],
    ['no specialties', { skillIds: [] }],
    ['no service radius', { serviceRadiusKm: 0 }],
    ['no face verification', { hasSelfie: false }],
  ])('rejects a profile with %s', (_label, patch) => {
    expect(isProProfileComplete({ ...base, ...patch } as ProProfile)).toBe(false);
  });

  it('does not require optional detail that is collected later', () => {
    // Bio, languages, documents and payout details must never block a Pro who
    // is otherwise ready to work. They are absent from the parameter type
    // entirely, so completeness cannot come to depend on them by accident.
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

  it('asks for the face verification after the answers are in', () => {
    // Everything else answered, selfie missing: the last question before review.
    expect(nextIncompleteStep({ ...base, hasSelfie: false })).toBe('face');
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
      gender: null,
      serviceIds: [],
      skillIds: [],
      experienceLevel: null,
    };

    expect(nextIncompleteStep(empty)).toBe('name');
    expect(nextIncompleteStep({ ...empty, displayName: 'Asha' })).toBe('gender');
    expect(nextIncompleteStep({ ...empty, displayName: 'Asha', gender: 'FEMALE' })).toBe(
      'services',
    );
    expect(
      nextIncompleteStep({
        ...empty,
        displayName: 'Asha',
        gender: 'FEMALE',
        serviceIds: ['s'],
      }),
    ).toBe('skills');
    expect(
      nextIncompleteStep({
        ...empty,
        displayName: 'Asha',
        gender: 'FEMALE',
        serviceIds: ['s'],
        skillIds: ['k'],
      }),
    ).toBe('experience');
  });

  it('keeps the face step between about and review in the shared step list', () => {
    // The progress bar and resume routing both read this array; the face step
    // must sit immediately before review so "almost there" stays accurate.
    const steps = ONBOARDING_STEPS;
    expect(steps.indexOf('gender')).toBe(steps.indexOf('name') + 1);
    expect(steps.indexOf('face')).toBe(steps.indexOf('about') + 1);
    expect(steps[steps.length - 1]).toBe('review');
    expect(steps).toEqual([
      'intro',
      'name',
      'gender',
      'services',
      'skills',
      'experience',
      'location',
      'radius',
      'about',
      'face',
      'review',
    ]);
  });
});

function buildService(row: typeof baseRow) {
  const updates: Record<string, unknown>[] = [];
  let current = row;

  const prisma = {
    proProfile: {
      upsert: jest.fn().mockResolvedValue(current),
      update: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        current = { ...current, ...data };
        return current;
      }),
      // The online/offline gate reads the deletion flags separately from the
      // profile DTO; a live pro clears both.
      findUnique: jest.fn().mockResolvedValue({ deletedAt: null, deletionRequestedAt: null }),
    },
  };

  const storage = {
    selfiePath: (userId: string) => `pros/${userId}/selfie.jpg`,
    selfieExists: jest.fn().mockResolvedValue(true),
    selfiePublicUrl: (path: string) => `https://cdn.test/${path}`,
    createSelfieUpload: jest.fn(),
  } as unknown as StorageService;

  const jobs = {
    notifyReadyJobRequests: jest.fn().mockResolvedValue(undefined),
  } as unknown as JobsService;

  return {
    service: createProsService({ prisma: prisma as never, storage, jobs }),
    updates,
    storage,
    jobs,
  };
}

describe('setSelfieUploaded', () => {
  it('records the selfie at the storage-owned path and completes onboarding', async () => {
    const { service, updates } = buildService(baseRow);

    const profile = await service.setSelfieUploaded('user-1');

    // The path comes from the storage service, not from any client input, and
    // the profile now counts the face step as answered...
    expect(updates[0]).toMatchObject({
      selfiePhotoPath: 'pros/user-1/selfie.jpg',
    });
    expect(profile.hasSelfie).toBe(true);
    expect(profile.selfiePhotoUrl).toBe('https://cdn.test/pros/user-1/selfie.jpg');

    // ...which flips an otherwise-finished profile to COMPLETED.
    expect(profile.onboardingStatus).toBe(OnboardingStatus.COMPLETED);
  });
});

describe('setAvailability', () => {
  it('fires catch-up when the pro comes online with fresh coordinates', async () => {
    const { service, jobs } = buildService(baseRow);
    const coords = { latitude: 12.9716, longitude: 77.5946 };

    await service.setAvailability('user-1', { isOnline: true, coordinates: coords });

    expect(jobs.notifyReadyJobRequests).toHaveBeenCalledWith('user-1', coords);
  });

  it('does not fire catch-up when going offline', async () => {
    const { service, jobs } = buildService(baseRow);

    await service.setAvailability('user-1', {
      isOnline: false,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(jobs.notifyReadyJobRequests).not.toHaveBeenCalled();
  });

  it('does not fire catch-up when online but without coordinates', async () => {
    const { service, jobs } = buildService(baseRow);

    await service.setAvailability('user-1', { isOnline: true });

    expect(jobs.notifyReadyJobRequests).not.toHaveBeenCalled();
  });

  it('does not fire catch-up when the pro has no service radius', async () => {
    const { service, jobs } = buildService({ ...baseRow, serviceRadiusKm: 0 });

    await service.setAvailability('user-1', {
      isOnline: true,
      coordinates: { latitude: 12.9716, longitude: 77.5946 },
    });

    expect(jobs.notifyReadyJobRequests).not.toHaveBeenCalled();
  });
});
