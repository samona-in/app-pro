import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ProProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

interface SelfieUploadTicket {
  path: string;
  uploadUrl: string;
}

const SELFIE_CONTENT_TYPE = 'image/jpeg';

/**
 * Streams the captured JPEG to the signed URL the API minted.
 *
 * XMLHttpRequest rather than fetch: React Native's fetch-with-Blob PUT is
 * unreliable against presigned endpoints (bodies can go out chunked and get
 * rejected by storage), while XHR streams the Blob natively and surfaces the
 * status code needed to distinguish "bad network" from "bad ticket".
 *
 * The bytes never pass through our API (its JSON bodies are capped far below
 * any image size): they go device-to-bucket, and the ticket URL carries the
 * authorization, so this is a plain request rather than the authed API client.
 */
function putSelfieBytes(ticket: SelfieUploadTicket, localUri: string): Promise<void> {
  return fetch(localUri)
    .then((file) => file.blob())
    .then(
      (blob) =>
        new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('PUT', ticket.uploadUrl);
          request.setRequestHeader('content-type', SELFIE_CONTENT_TYPE);
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) {
              resolve();
            } else {
              reject(new Error(`Selfie upload failed with status ${request.status}.`));
            }
          };
          request.onerror = () => reject(new Error('Selfie upload could not reach storage.'));
          request.send(blob);
        }),
    );
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
