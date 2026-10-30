import {
  DocumentStatus,
  DocumentType,
  ProServiceStatus,
  isProProfileComplete,
  nextIncompleteStep,
  type ProDocument,
  type ProProfile,
} from '@samona/types';

/**
 * The four milestones the Home widget tracks. Declared in the order they must
 * be completed so the first unfinished entry is also the next action.
 */
export const PROFILE_COMPLETION_STEP_KEYS = [
  'profile',
  'services',
  'documents',
  'verification',
] as const;

export type ProfileCompletionStepKey = (typeof PROFILE_COMPLETION_STEP_KEYS)[number];

/**
 * Every step a pending/rejected review must not be mistaken for a finished one.
 *
 * `complete` is the only state that contributes to the percentage. The other
 * three are distinct so the widget can show the same verdict language the
 * server already uses (in review, action needed, not started).
 */
export type ProfileCompletionStepStatus = 'complete' | 'pending' | 'rejected' | 'todo';

export interface ProfileCompletionStep {
  key: ProfileCompletionStepKey;
  completed: boolean;
  status: ProfileCompletionStepStatus;
  /** The existing screen that finishes this step; null once it is complete. */
  route: string | null;
}

export interface ProfileCompletion {
  steps: ProfileCompletionStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
  isComplete: boolean;
  /** The first unfinished step — what the CTA and its label are built from. */
  nextStep: ProfileCompletionStep | null;
}

/**
 * Documents that must be approved before the profile is complete.
 *
 * The server's one verification rule is `isVerified = at least one approved
 * ID_PROOF` (see documents.service.ts), and the Documents screen tells the Pro
 * that the ID proof is what earns the badge. This list therefore matches the
 * existing business rule rather than inventing a stricter one in the app.
 */
export const MANDATORY_DOCUMENT_TYPES: readonly DocumentType[] = [DocumentType.ID_PROOF];

const TOTAL_STEPS = PROFILE_COMPLETION_STEP_KEYS.length;

/**
 * The single source of truth for profile progress.
 *
 * Pure and derived only from server data, so the Home widget, tests and any
 * future surface cannot drift. Callers must pass the profile and document list
 * returned by the API — nothing here is hardcoded per Pro.
 */
export function computeProfileCompletion(
  profile: ProProfile | null | undefined,
  documents: readonly ProDocument[] | null | undefined,
): ProfileCompletion {
  const docs = documents ?? [];
  const services = profile?.proServices ?? [];

  const profileComplete = isProProfileComplete(profile ?? null);

  const hasAcceptedService = services.some(
    (service) => service.status === ProServiceStatus.ACCEPTED,
  );
  const serviceStatus = stepStatus(
    hasAcceptedService,
    services.some((service) => service.status === ProServiceStatus.PENDING),
    services.some((service) => service.status === ProServiceStatus.REJECTED),
  );

  const approvedTypes = new Set(
    docs
      .filter((document) => document.status === DocumentStatus.APPROVED)
      .map((document) => document.type),
  );
  const mandatoryDocs = docs.filter((document) => MANDATORY_DOCUMENT_TYPES.includes(document.type));
  const documentsComplete = MANDATORY_DOCUMENT_TYPES.every((type) => approvedTypes.has(type));
  const documentsStatus = stepStatus(
    documentsComplete,
    mandatoryDocs.some((document) => document.status === DocumentStatus.PENDING),
    mandatoryDocs.some((document) => document.status === DocumentStatus.REJECTED),
  );

  const verified = profile?.isVerified === true;
  const idProofs = docs.filter((document) => document.type === DocumentType.ID_PROOF);
  const verificationStatus = stepStatus(
    verified,
    idProofs.some((document) => document.status === DocumentStatus.PENDING),
    idProofs.some((document) => document.status === DocumentStatus.REJECTED),
  );

  const steps: ProfileCompletionStep[] = [
    {
      key: 'profile',
      completed: profileComplete,
      status: profileComplete ? 'complete' : 'todo',
      route: profileComplete ? null : `/onboarding/${nextIncompleteStep(profile ?? null)}`,
    },
    {
      key: 'services',
      completed: hasAcceptedService,
      status: serviceStatus,
      route: hasAcceptedService ? null : '/manage-services',
    },
    {
      key: 'documents',
      completed: documentsComplete,
      status: documentsStatus,
      route: documentsComplete ? null : '/documents',
    },
    {
      key: 'verification',
      completed: verified,
      status: verificationStatus,
      // Verification is read-only: this opens the profile status the admin
      // verdict is surfaced on. It never requests a new verification.
      route: verified ? null : '/profile',
    },
  ];

  const completedCount = steps.filter((step) => step.completed).length;

  return {
    steps,
    completedCount,
    totalCount: TOTAL_STEPS,
    percent: Math.round((completedCount / TOTAL_STEPS) * 100),
    isComplete: completedCount === TOTAL_STEPS,
    nextStep: steps.find((step) => !step.completed) ?? null,
  };
}

/**
 * A completed step always wins over evidence of review. Otherwise a pending
 * verdict reads as pending and a rejected one as action needed.
 */
function stepStatus(
  completed: boolean,
  pending: boolean,
  rejected: boolean,
): ProfileCompletionStepStatus {
  if (completed) return 'complete';
  if (pending) return 'pending';
  if (rejected) return 'rejected';
  return 'todo';
}
