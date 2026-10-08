import { Router } from 'express';
import {
  documentCompleteSchema,
  documentIdParamsSchema,
  documentReviewSchema,
  documentUploadStartSchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, requireRole, routeParamId, validate } from '../common';

/**
 * HTTP surface for the documents domain, mounted at `/documents`.
 *
 * Uploads are the same three-step handshake as `/files` — mint a presigned
 * PUT, stream the bytes straight to the bucket, confirm — because documents
 * are PDFs and photos too large to ever pass through this API's JSON bodies
 * (`app.ts` caps them far below any file size). What differs is the bucket:
 * documents are private, so reading one means minting a short-lived presigned
 * GET rather than handing back a public URL.
 *
 * Every Pro-facing route is scoped to the caller's own profile: the user id
 * comes from the verified token, never from the path or body. The review
 * route is the one admin-only writer of a verdict (CLAUDE.md "Security").
 * Mounted under the `expensive` limiter in `routes.ts` — like `/files`, this
 * router mints signed storage access.
 */
export function createDocumentsRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth, requireRole('PRO', 'ADMIN'));

  /** Step 1: a one-time URL the app streams the document bytes to. */
  router.post(
    '/upload-url',
    validate(documentUploadStartSchema),
    async (req, res, next) => {
      try {
        res.json(await services.documents.startUpload(req.user!.id, req.body));
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Step 3: confirm the PUT finished and record the document as PENDING.
   *
   * Size and content type come from the object's own HEAD, not the body, so
   * a row can only ever describe bytes that actually landed.
   */
  router.post('/complete', validate(documentCompleteSchema), async (req, res, next) => {
    try {
      res.status(201).json(await services.documents.completeUpload(req.user!.id, req.body));
    } catch (error) {
      next(error);
    }
  });

  /** The caller's own documents, newest first. */
  router.get('/', async (req, res, next) => {
    try {
      res.json({ data: await services.documents.list(req.user!.id) });
    } catch (error) {
      next(error);
    }
  });

  /**
   * A short-lived read URL for one document. Owner or admin only — the
   * bucket has no public read path at all.
   */
  router.get(
    '/:documentId/content-url',
    validate(documentIdParamsSchema, 'params'),
    async (req, res, next) => {
      try {
        res.json(
          await services.documents.contentUrl(
            req.user!.id,
            routeParamId(req.params.documentId),
            req.user!.isAdmin,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /** Deletes one of the caller's documents. Approved rows are refused (409). */
  router.delete(
    '/:documentId',
    validate(documentIdParamsSchema, 'params'),
    async (req, res, next) => {
      try {
        await services.documents.remove(req.user!.id, routeParamId(req.params.documentId));
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * The admin verdict. `requireRole('ADMIN')` is the stored privilege — a
   * non-admin PRO surface caller passes the router gate above and is stopped
   * here, because ADMIN matches no surface and only `isAdmin` bypasses.
   */
  router.post(
    '/:documentId/review',
    requireRole('ADMIN'),
    validate(documentIdParamsSchema, 'params'),
    validate(documentReviewSchema),
    async (req, res, next) => {
      try {
        res.json(await services.documents.review(routeParamId(req.params.documentId), req.body));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
