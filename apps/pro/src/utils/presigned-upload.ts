/**
 * Streams a local file to a presigned PUT URL the API minted.
 *
 * XMLHttpRequest rather than fetch: React Native's fetch-with-Blob PUT is
 * unreliable against presigned endpoints (bodies can go out chunked and get
 * rejected by storage), while XHR streams the Blob natively and surfaces the
 * status code needed to distinguish "bad network" from "bad ticket".
 *
 * The bytes never pass through our API (its JSON bodies are capped far below
 * any file size): they go device-to-bucket, and the ticket URL carries the
 * authorization, so this is a plain request rather than the authed API client.
 * Shared by the selfie capture (onboarding) and the documents screen — both
 * follow the same three-step handshake: request a ticket, stream the bytes,
 * only then confirm.
 */
export function putBytesToPresignedUrl(
  ticket: { uploadUrl: string },
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
              reject(new Error(`Upload failed with status ${request.status}.`));
            }
          };
          request.onerror = () => reject(new Error('Upload could not reach storage.'));
          request.send(blob);
        }),
    );
}
