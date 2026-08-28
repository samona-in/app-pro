import { api } from './api';

interface JobImageUploadTicket {
  path: string;
  uploadUrl: string;
}

const JOB_IMAGE_CONTENT_TYPE = 'image/jpeg';

/**
 * Streams one selected photo to the signed URL the API freshly minted.
 *
 * XMLHttpRequest rather than fetch for the same reason as the Pro selfie:
 * React Native's fetch-with-Blob PUT is unreliable against presigned
 * endpoints, while XHR streams the Blob natively and exposes the status code
 * we need to tell "bad network" apart from "bad ticket". The bytes go
 * device-to-bucket; they never pass through our JSON-bodied API.
 */
function putJobImageBytes(ticket: JobImageUploadTicket, localUri: string): Promise<void> {
  return fetch(localUri)
    .then((file) => file.blob())
    .then(
      (blob) =>
        new Promise<void>((resolve, reject) => {
          const request = new XMLHttpRequest();
          request.open('PUT', ticket.uploadUrl);
          request.setRequestHeader('content-type', JOB_IMAGE_CONTENT_TYPE);
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
 * Uploads one reference photo and returns the server-owned object path.
 *
 * Order matters: request a ticket, stream the bytes to the bucket. The create
 * booking step later verifies each submitted path actually exists in storage
 * before the job is recorded, so a path is only meaningful once this resolves.
 */
export async function uploadJobImage(localUri: string): Promise<string> {
  const ticket = await api.post<JobImageUploadTicket>('/files/job-image/upload-url', {});
  await putJobImageBytes(ticket, localUri);
  return ticket.path;
}
