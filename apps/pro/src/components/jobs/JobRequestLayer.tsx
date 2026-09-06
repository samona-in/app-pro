import { useRef, useEffect } from 'react';
import { useIncomingJobStore } from '@/stores/incoming-job';
import { IncomingJobOverlay } from './IncomingJobOverlay';
import { useJobAlert, useSession } from '@/hooks';
import { jobNotificationService } from '@/services/job-notifications';
import { stopJobAlert } from '@/services/job-alert';

/**
 * The incoming-job ring, mounted once at the app root so a job request can
 * surface over ANY screen — the home tabs, a job detail, or the `job-alert/[id]`
 * deep-link route a push opens.
 *
 * Previously the overlay lived inside the tabs layout, so a push that opened
 * the app via `samonapro://job-alert/:id` had to finish loading, redirect to
 * `/home` and wait for the tabs to mount before the ring appeared. Mounting it
 * here (inside the providers, outside the navigator) lets the ring present the
 * moment the store gains a job, on whichever route the app landed.
 */
export function JobRequestLayer() {
  const { isAuthenticated, isOnboardingComplete } = useSession();
  const activeJob = useIncomingJobStore((state) => state.job);
  const resolution = useIncomingJobStore((state) => state.resolution);
  const pendingJobs = useIncomingJobStore((state) => state.pendingJobs);
  const advance = useIncomingJobStore((state) => state.advance);
  const clear = useIncomingJobStore((state) => state.clear);

  const jobAlert = useJobAlert();

  // A cold-started push can open `job-alert/[id]` before Supabase has restored
  // the session; once it resolves, finish raising any tapped notification.
  useEffect(() => {
    if (!isAuthenticated || !isOnboardingComplete) return;
    void jobNotificationService.handleInitialNotificationIfNeeded();
  }, [isAuthenticated, isOnboardingComplete]);

  // Replicating the tabs-layout unmount: signing out must release everything
  // the alert may be holding even though this layer never unmounts. Skipped on
  // the initial load (auth not yet restored) to avoid tearing down listeners
  // the signed-in state has not even set up.
  const prevSignedIn = useRef<boolean | null>(null);
  useEffect(() => {
    const signedIn = Boolean(isAuthenticated && isOnboardingComplete);
    if (prevSignedIn.current === true && !signedIn) {
      jobNotificationService.cleanup();
      useIncomingJobStore.getState().clear();
      stopJobAlert();
    }
    prevSignedIn.current = signedIn;
  }, [isAuthenticated, isOnboardingComplete]);

  if (!isAuthenticated || !isOnboardingComplete) return null;
  if (!activeJob) return null;

  return (
    <IncomingJobOverlay
      job={activeJob}
      resolution={resolution}
      queueCount={pendingJobs.length}
      onResolve={jobAlert.resolve}
      onAdvance={advance}
      onDismiss={clear}
    />
  );
}
