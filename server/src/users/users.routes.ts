import { Router } from 'express';
import { deletionTokenHeaderSchema } from '@samona/validation';
import type { Limiters } from '../common';
import type { Services } from '../context';
import { createRequireAuth, requireRole, validate } from '../common';

/**
 * HTTP surface for the users domain, mounted at `/users`.
 *
 * Permanent account deletion lives here. The surface being deleted is decided
 * server-side from the `X-App-Type` header (`appType` on the authenticated
 * user), never the client's word: the customer app deletes its own surface,
 * the pro app its pro surface, and an account holding both is finalized one
 * surface at a time. OTP re-auth is proven by the verified token's `amr`
 * claim, an authorization token guards the destructive call, and shared
 * records (jobs, messages, reviews) survive either surface's deletion
 * (CLAUDE.md "Authentication", "Security").
 */
export function createUsersRouter(services: Services, limiters: Limiters): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  /**
   * What the caller can delete and whether finalization is deferred.
   *
   * Read-only and side-effect-free, so it needs no credential-level rate limit;
   * the `write` mount on `/users` governs it.
   */
  router.get(
    '/me/deletion-status',
    requireAuth,
    requireRole('PRO', 'CUSTOMER', 'ADMIN'),
    async (req, res, next) => {
      try {
        res.json(
          await services.accountDeletion.getDeletionStatus(req.user!.id, req.user!.appType),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Mints a single-use deletion authorization.
   *
   * Requires the current access token to carry a fresh OTP in its `amr` claim —
   * the pro re-authenticated with a verification code, under the auth budget.
   * The returned token is the only credential in this flow; it is consumed once
   * by `DELETE /users/me`.
   */
  router.post(
    '/me/deletion-authorization',
    requireAuth,
    requireRole('PRO', 'CUSTOMER', 'ADMIN'),
    limiters.auth,
    async (req, res, next) => {
      try {
        res.json(
          await services.accountDeletion.issueAuthorization(
            req.user!.id,
            req.user!.amr,
            req.user!.appType,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Deletes the caller's account.
   *
   * The authorization travels in a header so the confirm is a bare DELETE with
   * no body to validate. Deleting is destructive and irreversible; the token is
   * single-use and short-lived via the authorization endpoint's auth budget,
   * and the write budget here confines confirm storms.
   */
  router.delete(
    '/me',
    requireAuth,
    requireRole('PRO', 'CUSTOMER', 'ADMIN'),
    validate(deletionTokenHeaderSchema, 'headers'),
    async (req, res, next) => {
      try {
        const { 'x-deletion-token': token } = req.headers as { 'x-deletion-token': string };
        res.json(
          await services.accountDeletion.deleteAccount(req.user!.id, token, req.user!.appType),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
