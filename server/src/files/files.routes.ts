import { Router } from 'express';
import { selfieCompleteSchema, selfieUploadStartSchema } from '@samona/validation';
import type { Services } from '../context';
import { conflict } from '../common/errors';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * HTTP surface for the files domain, mounted at `/files`.
 *
 * Uploads never flow through this API's request bodies — `app.ts` caps JSON
 * payloads far below any image size. Instead each upload is a three-step
 * handshake:
 *
 *   1. `POST /files/<kind>/upload-url` mints a short-lived signed upload URL
 *      for a path derived from the caller's verified user id.
 *   2. The client PUTs the image bytes straight to that URL.
 *   3. The owning domain records the object only after it verifies the bytes
 *      landed in the bucket.
 *
 * Nothing in a request body influences where bytes are stored, and every path
 * is scoped under the caller's own user id, so there is no client-controlled
 * path or id to forge (CLAUDE.md "Security").
 */
export function createFilesRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  /** Step 1: a one-time URL the app streams a captured Pro selfie to. */
  router.post(
    '/selfie/upload-url',
    requireRole('PRO', 'ADMIN'),
    validate(selfieUploadStartSchema),
    async (req, res, next) => {
      try {
        const { path, uploadUrl } = await services.storage.createSelfieUpload(req.user!.id);
        res.json({ path, uploadUrl });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Step 3: confirm the selfie PUT finished.
   *
   * Existence is checked against the bucket before anything is recorded, so a
   * profile can never point at an object that was never uploaded.
   */
  router.post(
    '/selfie/complete',
    requireRole('PRO', 'ADMIN'),
    validate(selfieCompleteSchema),
    async (req, res, next) => {
      try {
        const uploaded = await services.storage.selfieExists(req.user!.id);
        if (!uploaded) {
          throw conflict('The photo has not reached storage yet. Try again.');
        }
        res.json(await services.pros.setSelfieUploaded(req.user!.id));
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Step 1 (job images): a one-time URL the app streams one reference photo
   * to, scoped under the customer's own id. The returned `path` is submitted
   * with the job request; the jobs domain verifies the object exists before it
   * records the path.
   */
  router.post('/job-image/upload-url', requireRole('CUSTOMER', 'ADMIN'), async (req, res, next) => {
    try {
      const { path, uploadUrl } = await services.storage.createJobImageUpload(req.user!.id);
      res.json({ path, uploadUrl });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
