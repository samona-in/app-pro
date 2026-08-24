import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

interface SelfieUploadTicket {
  path: string;
  uploadUrl: string;
}

/**
 * Streams the captured JPEG to the signed URL the API minted.
 *
 * The bytes never pass through our API (its JSON bodies are capped far below
 * any image size): they go device-to-bucket, and the ticket URL carries the
 * authorization, so this is a plain fetch rather than the authed API client.
 */
async function putSelfieBytes(ticket: SelfieUploadTicket, localUri: string): Promise<void> {
  const file = await fetch(localUri);
  const blob = await file.blob();

  const response = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/jpeg' },
    body: blob,
  });

  if (!response.ok) {
    throw new Error(`Selfie upload failed with status ${response.status}.`);
  }
}

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
      await putSelfieBytes(ticket, localUri);
      return api.post<ProProfile>('/files/selfie/complete', {});
    },
    onSuccess: (proProfile) => {
      queryClient.setQueryData(queryKeys.proProfile, proProfile);
      // The session carries onboardingStatus and nextStep; both just changed.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
