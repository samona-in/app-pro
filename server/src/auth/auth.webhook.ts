import express, { Router } from 'express';
import { verifyWebhook } from '@clerk/express/webhooks';
import type { Services } from '../context';
import { logger } from '../common/logger';

/**
 * Clerk webhook receiver.
 *
 * Mounted before the JSON body parser: the signature covers the raw bytes, and
 * parsing then re-serialising the body changes them. An unverified webhook is
 * an unauthenticated write endpoint, so verification is not optional.
 *
 * Clerk retries on a non-2xx, so handlers must be idempotent — every one here
 * is an idempotent upsert or update.
 */
export function createAuthWebhookRouter(services: Services, signingSecret: string | null): Router {
  const router = Router();

  router.post(
    '/',
    // Raw body, capped: this endpoint is public and unauthenticated until the
    // signature is checked, so it must not accept an unbounded payload.
    express.raw({ type: 'application/json', limit: '64kb' }),
    async (req, res) => {
      if (!signingSecret) {
        // Refuse rather than accept unverified events.
        logger.error('Clerk webhook received but CLERK_WEBHOOK_SIGNING_SECRET is not set.');
        res.status(503).json({ error: { code: 'INTERNAL', message: 'Webhook not configured.' } });
        return;
      }

      try {
        const event = await verifyWebhook(req, { signingSecret });

        switch (event.type) {
          case 'user.created':
          case 'user.updated': {
            const data = event.data;
            const verifiedPhone = data.phone_numbers?.find(
              (p) => p.id === data.primary_phone_number_id && p.verification?.status === 'verified',
            );
            await services.auth.applyUserUpdated({
              clerkUserId: data.id,
              phone: verifiedPhone?.phone_number ?? null,
              email:
                data.email_addresses?.find((e) => e.id === data.primary_email_address_id)
                  ?.email_address ?? null,
              fullName: [data.first_name, data.last_name].filter(Boolean).join(' ') || null,
              avatarUrl: data.image_url || null,
            });
            break;
          }

          case 'user.deleted': {
            if (event.data.id) await services.auth.deactivateUser(event.data.id);
            break;
          }

          default:
            // Unhandled event types are acknowledged, not retried forever.
            logger.debug(`Ignoring Clerk webhook event: ${event.type}`);
        }

        res.status(204).end();
      } catch (error) {
        // A bad signature is the expected failure for a forged request.
        logger.warn('Rejected a Clerk webhook with an invalid signature.', error);
        res.status(400).json({
          error: { code: 'BAD_REQUEST', message: 'Invalid webhook signature.' },
        });
      }
    },
  );

  return router;
}
