import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CustomerProfile } from '@samona/types';
import { queryKeys } from '@/constants';
import { api } from '@/services/api';

interface AvatarUploadTicket {
  path: string;
  uploadUrl: string;
}

const FALLBACK_AVATAR_CONTENT_TYPE = 'image/jpeg';

/**
 * Streams the chosen photo to the signed URL the API freshly minted.
 *
 * XMLHttpRequest rather than fetch for the same reason as the other uploaders:
 * React Native's fetch-with-Blob PUT is unreliable against presigned endpoints,
 * while XHR streams the Blob natively and surfaces the status code needed to
 * distinguish "bad network" from "bad ticket". The bytes go device-to-bucket;
 * they never pass through the JSON-bodied API, so the pixel content stays with
 * the storage provider.
 */
function putAvatarBytes(
  ticket: AvatarUploadTicket,
  localUri: string,
  contentType: string,
): Promise<void> {
  return fetch(localUri)
    .then((file) => file.blob())
    .then(
      (blob) =>
        new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('PUT', ticket.uploadUrl);
          request.setRequestHeader('content-type', contentType);
          request.onload = () => {
            if (request.status >= 200 && request.status < 300) {
              resolve();
            } else {
              reject(new Error(`Photo upload failed with status ${request.status}.`));
            }
          };
          request.onerror = () => reject(new Error('Photo upload could not reach storage.'));
          request.send(blob);
        }),
    );
}

/**
 * Uploads a new profile avatar and records it on the customer profile.
 *
 * Order matters: request a ticket, stream the bytes, only then confirm — the
 * server refuses to record the avatar unless the object actually reached
 * storage. Each upload mints a brand-new object URL, so the recorded `avatarUrl`
 * changes every time and no cache layer can serve a previously fetching image.
 * The returned profile replaces the cached one.
 */
export function useUploadAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ localUri, mimeType }: { localUri: string; mimeType?: string | null }) => {
      const contentType = mimeType ?? FALLBACK_AVATAR_CONTENT_TYPE;
      const ticket = await api.post<AvatarUploadTicket>('/files/avatar/upload-url', {});
      await putAvatarBytes(ticket, localUri, contentType);
      return api.post<CustomerProfile>('/files/avatar/complete', { path: ticket.path });
    },
    onSuccess: (customerProfile) => {
      queryClient.setQueryData(queryKeys.customerProfile, customerProfile);
      // The session carries `user.avatarUrl`; it just changed too.
      void queryClient.invalidateQueries({ queryKey: queryKeys.session });
    },
  });
}
