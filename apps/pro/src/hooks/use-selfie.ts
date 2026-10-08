import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';
import { putBytesToPresignedUrl } from '@/utils/presigned-upload';

interface SelfieUploadTicket {
  path: string;
  uploadUrl: string;
}

const SELFIE_CONTENT_TYPE = 'image/jpeg';

/**
 * Uploads a captured face photo and records it on the profile.
 *
 * Order matters: request a ticket, stream the bytes, only then confirm —
 * the server refuses to mark the step done unless the object actually
 * reached storage. The returned profile is authoritative and replaces the
 * cached one, which re-routes onboarding if a step was still missing.
 */
export function useUploadSelfie() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localUri }: { localUri: string }) => {
      const ticket = await api.post<SelfieUploadTicket>('/files/selfie/upload-url', {});
      await putBytesToPresignedUrl(ticket, localUri, SELFIE_CONTENT_TYPE);
      return api.post<ProProfile>('/files/selfie/complete', {});
    },
    onSuccess: (proProfile) => {
      queryClient.setQueryData(queryKeys.proProfile, proProfile);
      // The session carries onboardingStatus and nextStep; both just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
