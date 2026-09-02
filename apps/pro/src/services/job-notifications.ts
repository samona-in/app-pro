import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { JobStatus, type AvailableJob, type JobDetail } from '@samona/types';
import { subscribe } from '@/services/realtime';
import { startJobAlert, stopJobAlert } from '@/services/job-alert';
import { api } from './api';
import { useIncomingJobStore, type IncomingJobResolution } from '@/stores/incoming-job';
import { isOnline, subscribeToOnlineStatus } from './online-status-state';

const UNAVAILABLE_STATUSES: ReadonlySet<JobDetail['status']> = new Set<JobDetail['status']>([
  JobStatus.ACCEPTED,
  JobStatus.TRAVELLING,
  JobStatus.ARRIVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
  JobStatus.PAYMENT_PENDING,
  JobStatus.PAID,
  JobStatus.CANCELLED,
  JobStatus.EXPIRED,
]);

const JOB_ALERT_TIMEOUT_MS = 45_000;

interface PendingJobEvent {
  jobId: string;
  source: 'socket' | 'push';
  timestamp: number;
}

function createJobNotificationService() {
  const handledJobIds = new Set<string>();
  const pendingEvents = new Map<string, PendingJobEvent>();
  const socketUnsubscribes: (() => void)[] = [];
  let pushReceivedUnsubscribe: Notifications.EventSubscription | null = null;
  let pushResponseUnsubscribe: Notifications.EventSubscription | null = null;
  let initialNotification: Notifications.Notification | null = null;
  let isInitialized = false;
  let onlineStatusUnsubscribe: (() => void) | null = null;

  function getStore() {
    return useIncomingJobStore.getState();
  }

  function isJobBeingHandled(jobId: string): boolean {
    return handledJobIds.has(jobId);
  }

  function markJobHandled(jobId: string): void {
    handledJobIds.add(jobId);
    setTimeout(() => handledJobIds.delete(jobId), JOB_ALERT_TIMEOUT_MS * 2);
  }

  function clearJobHandled(jobId: string): void {
    handledJobIds.delete(jobId);
  }

  function canShowAlert(): boolean {
    return isOnline();
  }

  async function initialize(): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;

    await setupPushListeners();
    setupSocketListeners();
    await handleInitialNotification();

    onlineStatusUnsubscribe = subscribeToOnlineStatus((state) => {
      if (state.status === 'offline' || state.status === 'offlining') {
        const store = getStore();
        if (store.job && !store.resolution) {
          stopJobAlert();
          store.clear();
        }
        handledJobIds.clear();
        pendingEvents.clear();
      }
    });
  }

  async function setupPushListeners(): Promise<void> {
    if (Platform.OS === 'web') return;

    pushReceivedUnsubscribe = Notifications.addNotificationReceivedListener(onNotificationReceived);
    pushResponseUnsubscribe = Notifications.addNotificationResponseReceivedListener(onNotificationResponse);
  }

  function onNotificationReceived(notification: Notifications.Notification): void {
    if (!canShowAlert()) return;

    const data = notification.request.content.data as Record<string, unknown> | undefined;
    if (!data || data.type !== 'NEW_JOB' || !data.jobId) return;

    const jobId = String(data.jobId);
    if (isJobBeingHandled(jobId)) return;

    if (getStore().job?.id === jobId) return;

    pendingEvents.set(jobId, { jobId, source: 'push', timestamp: Date.now() });
  }

  async function onNotificationResponse(response: Notifications.NotificationResponse): Promise<void> {
    if (!canShowAlert()) return;

    const data = response.notification.request.content.data as Record<string, unknown> | undefined;
    if (!data || data.type !== 'NEW_JOB' || !data.jobId) return;

    await handleJobNotification(String(data.jobId), 'push');
  }

  async function handleInitialNotification(): Promise<void> {
    if (Platform.OS === 'web') return;

    const initial = await Notifications.getLastNotificationResponseAsync();
    if (initial && initial.notification.request.content.data) {
      const data = initial.notification.request.content.data as Record<string, unknown>;
      if (data.type === 'NEW_JOB' && data.jobId) {
        initialNotification = initial.notification;
      }
    }
  }

  async function handleInitialNotificationIfNeeded(): Promise<void> {
    if (initialNotification && canShowAlert()) {
      const data = initialNotification.request.content.data as Record<string, unknown>;
      if (data.type === 'NEW_JOB' && data.jobId) {
        await handleJobNotification(String(data.jobId), 'push');
      }
      initialNotification = null;
    }
  }

  function setupSocketListeners(): void {
    const onNew = (newJob: AvailableJob) => {
      if (!canShowAlert()) return;
      if (isJobBeingHandled(newJob.id)) return;
      pendingEvents.set(newJob.id, { jobId: newJob.id, source: 'socket', timestamp: Date.now() });
      processPendingEvent(newJob.id);
    };

    const onStatus = (detail: JobDetail) => {
      const store = getStore();
      const current = store.job;
      if (!current) return;
      if (detail.id === current.id && UNAVAILABLE_STATUSES.has(detail.status)) {
        store.resolve(detail.status === JobStatus.CANCELLED ? 'cancelled' : 'unavailable');
      }
    };

    socketUnsubscribes.push(subscribe('job:new', onNew), subscribe('job:status', onStatus));
  }

  function processPendingEvent(jobId: string): void {
    const event = pendingEvents.get(jobId);
    if (!event) return;

    const store = getStore();
    if (store.job?.id === jobId) {
      pendingEvents.delete(jobId);
      return;
    }

    pendingEvents.delete(jobId);
    handleJobNotification(jobId, event.source);
  }

  async function handleJobNotification(jobId: string, source: 'socket' | 'push'): Promise<void> {
    if (!canShowAlert()) return;
    if (isJobBeingHandled(jobId)) return;
    markJobHandled(jobId);

    try {
      const job = await fetchJob(jobId);
      if (!job) {
        clearJobHandled(jobId);
        return;
      }

      if (UNAVAILABLE_STATUSES.has(job.status)) {
        getStore().resolve('unavailable');
        clearJobHandled(jobId);
        return;
      }

      const availableJob: AvailableJob = {
        ...job,
        distanceKm: job.distanceKm ?? null,
        estimatedEtaMinutes: job.estimatedEtaMinutes ?? null,
      };

      getStore().show(availableJob);
      await startJobAlert();

      if (source === 'push') {
        autoExpire(jobId);
      }
    } catch {
      clearJobHandled(jobId);
    }
  }

  function autoExpire(jobId: string): void {
    setTimeout(() => {
      const store = getStore();
      if (store.job?.id === jobId && !store.resolution) {
        store.resolve('expired');
      }
      clearJobHandled(jobId);
    }, JOB_ALERT_TIMEOUT_MS);
  }

  async function fetchJob(jobId: string): Promise<JobDetail | null> {
    try {
      return await api.get<JobDetail>(`/jobs/${jobId}`);
    } catch {
      return null;
    }
  }

  async function resolveJob(jobId: string, resolution: IncomingJobResolution): Promise<void> {
    const store = getStore();
    if (store.job?.id !== jobId) return;

    if (resolution === 'accept') {
      try {
        await api.post<JobDetail>(`/jobs/${jobId}/accept`);
      } catch {
        store.resolve('unavailable');
        stopJobAlert();
        clearJobHandled(jobId);
        return;
      }
    } else {
      store.resolve(resolution);
    }

    clearJobHandled(jobId);
  }

  function dismissJob(): void {
    const store = getStore();
    const jobId = store.job?.id;
    if (jobId) clearJobHandled(jobId);
    store.clear();
    stopJobAlert();
  }

  async function onAppStateChange(state: string): Promise<void> {
    if (state !== 'active' && getStore().job && !getStore().resolution) {
      stopJobAlert();
    }
  }

  function cleanup(): void {
    socketUnsubscribes.forEach((off) => off());
    socketUnsubscribes.length = 0;
    if (pushReceivedUnsubscribe) {
      pushReceivedUnsubscribe.remove();
      pushReceivedUnsubscribe = null;
    }
    if (pushResponseUnsubscribe) {
      pushResponseUnsubscribe.remove();
      pushResponseUnsubscribe = null;
    }
    if (onlineStatusUnsubscribe) {
      onlineStatusUnsubscribe();
      onlineStatusUnsubscribe = null;
    }
    handledJobIds.clear();
    pendingEvents.clear();
    stopJobAlert();
    isInitialized = false;
  }

  return {
    initialize,
    handleInitialNotificationIfNeeded,
    onAppStateChange,
    handleJobNotification,
    resolveJob,
    dismissJob,
    cleanup,
  };
}

export const jobNotificationService = createJobNotificationService();