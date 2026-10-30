import {
  DocumentStatus,
  DocumentType,
  ExperienceLevel,
  Gender,
  OnboardingStatus,
  ProServiceStatus,
  type ProDocument,
  type ProProfile,
  type ProServiceVerification,
} from '@samona/types';
import { MANDATORY_DOCUMENT_TYPES, computeProfileCompletion } from '../profile-completion';

const COMPLETE_PROFILE: ProProfile = {
  id: 'pro-1',
  userId: 'user-1',
  onboardingStatus: OnboardingStatus.COMPLETED,
  displayName: 'Asha Rao',
  gender: Gender.FEMALE,
  bio: null,
  experienceLevel: ExperienceLevel.THREE_TO_FIVE,
  serviceRadiusKm: 8,
  latitude: null,
  longitude: null,
  locationLabel: null,
  locationPlaceId: null,
  languages: ['en'],
  isOnline: false,
  isVerified: true,
  rating: null,
  completedJobs: 0,
  hasSelfie: true,
  selfiePhotoUrl: null,
  serviceIds: ['service-1'],
  skillIds: ['skill-1'],
  proServices: [],
};

function profile(overrides: Partial<ProProfile> = {}): ProProfile {
  return { ...COMPLETE_PROFILE, ...overrides };
}

function service(status: ProServiceStatus): ProServiceVerification {
  return {
    id: 'service-1',
    slug: 'plumbing',
    name: 'Plumbing',
    icon: null,
    status,
    rejectionReason: status === ProServiceStatus.REJECTED ? 'Not eligible' : null,
  };
}

function document(
  type: DocumentType,
  status: DocumentStatus,
  id = `${type}-${status}`,
): ProDocument {
  return {
    id,
    type,
    status,
    fileName: `${type}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 1024,
    rejectionReason: status === DocumentStatus.REJECTED ? 'Unreadable' : null,
    reviewedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** A profile that passes the onboarding gate but has no verification yet. */
function onboardingCompleteProfile(): ProProfile {
  return profile({ isVerified: false, proServices: [] });
}

describe('computeProfileCompletion', () => {
  it('reports 0% for a brand-new pro with no data', () => {
    const result = computeProfileCompletion(null, null);

    expect(result.completedCount).toBe(0);
    expect(result.totalCount).toBe(4);
    expect(result.percent).toBe(0);
    expect(result.isComplete).toBe(false);
    expect(result.steps.every((step) => !step.completed)).toBe(true);
    expect(result.nextStep?.key).toBe('profile');
  });

  it('counts 25% per completed step', () => {
    const cases: { profile: ProProfile; extra: ProDocument[]; percent: number }[] = [
      { profile: onboardingCompleteProfile(), extra: [], percent: 25 },
      {
        profile: profile({
          isVerified: false,
          proServices: [service(ProServiceStatus.ACCEPTED)],
        }),
        extra: [],
        percent: 50,
      },
      {
        profile: profile({
          isVerified: false,
          proServices: [service(ProServiceStatus.ACCEPTED)],
        }),
        extra: [document(DocumentType.ID_PROOF, DocumentStatus.APPROVED)],
        percent: 75,
      },
      {
        profile: profile({
          isVerified: true,
          proServices: [service(ProServiceStatus.ACCEPTED)],
        }),
        extra: [document(DocumentType.ID_PROOF, DocumentStatus.APPROVED)],
        percent: 100,
      },
    ];

    for (const testCase of cases) {
      const result = computeProfileCompletion(testCase.profile, testCase.extra);
      expect(result.percent).toBe(testCase.percent);
      expect(result.completedCount).toBe(testCase.percent / 25);
    }
  });

  it('marks the profile step complete from the shared onboarding rule', () => {
    const incomplete = profile({ displayName: null });
    const result = computeProfileCompletion(incomplete, []);

    expect(result.steps[0]).toMatchObject({
      key: 'profile',
      completed: false,
      status: 'todo',
      route: '/onboarding/name',
    });

    const complete = computeProfileCompletion(profile(), []);
    expect(complete.steps[0]).toMatchObject({
      key: 'profile',
      completed: true,
      status: 'complete',
      route: null,
    });
  });

  it('does not count a pending or rejected service', () => {
    const pending = computeProfileCompletion(
      profile({ isVerified: false, proServices: [service(ProServiceStatus.PENDING)] }),
      [],
    );
    expect(pending.steps[1]).toMatchObject({
      key: 'services',
      completed: false,
      status: 'pending',
      route: '/manage-services',
    });
    expect(pending.percent).toBe(25);

    const rejected = computeProfileCompletion(
      profile({ isVerified: false, proServices: [service(ProServiceStatus.REJECTED)] }),
      [],
    );
    expect(rejected.steps[1]).toMatchObject({
      key: 'services',
      completed: false,
      status: 'rejected',
      route: '/manage-services',
    });
    expect(rejected.percent).toBe(25);
  });

  it('completes services once any single service is accepted', () => {
    const result = computeProfileCompletion(
      profile({
        isVerified: false,
        proServices: [
          service(ProServiceStatus.REJECTED),
          service(ProServiceStatus.ACCEPTED),
          service(ProServiceStatus.PENDING),
        ],
      }),
      [],
    );

    expect(result.steps[1]).toMatchObject({ completed: true, status: 'complete' });
  });

  it('requires an approved ID proof for the documents step', () => {
    const pending = computeProfileCompletion(onboardingCompleteProfile(), [
      document(DocumentType.ID_PROOF, DocumentStatus.PENDING),
    ]);
    expect(pending.steps[2]).toMatchObject({
      key: 'documents',
      completed: false,
      status: 'pending',
    });

    const rejected = computeProfileCompletion(onboardingCompleteProfile(), [
      document(DocumentType.ID_PROOF, DocumentStatus.REJECTED),
    ]);
    expect(rejected.steps[2]).toMatchObject({
      key: 'documents',
      completed: false,
      status: 'rejected',
    });

    const approved = computeProfileCompletion(onboardingCompleteProfile(), [
      document(DocumentType.ID_PROOF, DocumentStatus.APPROVED),
    ]);
    expect(approved.steps[2]).toMatchObject({
      key: 'documents',
      completed: true,
      status: 'complete',
      route: null,
    });
  });

  it('ignores approved documents outside the mandatory set', () => {
    const result = computeProfileCompletion(onboardingCompleteProfile(), [
      document(DocumentType.ADDRESS_PROOF, DocumentStatus.APPROVED),
      document(DocumentType.PAYOUT_PROOF, DocumentStatus.APPROVED),
    ]);

    expect(MANDATORY_DOCUMENT_TYPES).toEqual([DocumentType.ID_PROOF]);
    expect(result.steps[2]).toMatchObject({ completed: false });
  });

  it('does not complete verification while the server flag is false', () => {
    const result = computeProfileCompletion(
      profile({
        isVerified: false,
        proServices: [service(ProServiceStatus.ACCEPTED)],
      }),
      [document(DocumentType.ID_PROOF, DocumentStatus.APPROVED)],
    );

    expect(result.steps[3]).toMatchObject({
      key: 'verification',
      completed: false,
      status: 'todo',
      route: '/profile',
    });
    expect(result.isComplete).toBe(false);
    expect(result.percent).toBe(75);
  });

  it('reports 100% and no next step once every step is done', () => {
    const result = computeProfileCompletion(
      profile({
        isVerified: true,
        proServices: [service(ProServiceStatus.ACCEPTED)],
      }),
      [document(DocumentType.ID_PROOF, DocumentStatus.APPROVED)],
    );

    expect(result.completedCount).toBe(4);
    expect(result.percent).toBe(100);
    expect(result.isComplete).toBe(true);
    expect(result.nextStep).toBeNull();
    expect(result.steps.every((step) => step.route === null)).toBe(true);
  });

  it('points the next step at the first unfinished milestone', () => {
    const result = computeProfileCompletion(onboardingCompleteProfile(), [
      document(DocumentType.ID_PROOF, DocumentStatus.APPROVED),
    ]);

    expect(result.nextStep).toMatchObject({
      key: 'services',
      route: '/manage-services',
    });
  });
});
