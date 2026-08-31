import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/constants';
import { listNotifications, setJobAlertsEnabled } from '@/services/notifications';

/** The caller's own notification history, newest first. */
export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => listNotifications({ limit: 50 }),
    staleTime: 30_000,
  });
}

/**
 * The job-alerts on/off switch. On the device this governs the server's choice
 * to keep paging a pro for open jobs; the value lives on the ProProfile.
 */
export function usePushSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobAlertsEnabled: boolean) => setJobAlertsEnabled(jobAlertsEnabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.proProfile });
    },
  });
}
