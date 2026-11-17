import express, { Router } from 'express';
import type { Services } from '../context';
import { logger } from '../common/logger';
import { validateTwilioJsonSignature } from './twilio-signature';

/** Event batches are small; this is a ceiling, not an expectation. */
const MAX_BODY_BYTES = '1mb';

/**
 * Twilio Verify Message Status Stream receiver.
 *
 * The raw body is required: signatures are computed over the exact bytes Twilio
 * sent, and `express.json()` in app.ts would have already consumed and
 * re-serialised them by the time this ran. `createApp` mounts this router
 * *before* the global JSON parser for that reason.
 *
 * Acknowledging with 204 stops Event Streams retrying. Non-2xx responses make
 * Twilio retry, so genuine processing failures propagate; only an invalid
 * signature or unparseable payload is refused outright.
 */
export function createOtpWebhookRouter(services: Services): Router {
  const router = Router();

  router.post(
    '/',
    express.raw({ type: () => true, limit: MAX_BODY_BYTES }),
    async (req, res, next) => {
      const settings = services.config.otpTelemetry;
      if (
        !services.otpTelemetry.enabled ||
        settings.webhookUrl === null ||
        settings.twilioAuthToken === null
      ) {
        res.status(503).json({
          error: { code: 'SERVICE_UNAVAILABLE', message: 'OTP telemetry is not enabled.' },
        });
        return;
      }

      const signature = req.get('x-twilio-signature') ?? '';
      const query = req.originalUrl.includes('?')
        ? req.originalUrl.slice(req.originalUrl.indexOf('?') + 1)
        : '';
      // Rebuild from the configured public URL, not Host/X-Forwarded-*: a proxy
      // that rewrites either would otherwise invalidate every real callback.
      const signedUrl = query ? `${settings.webhookUrl}?${query}` : settings.webhookUrl;

      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';

      const valid =
        rawBody.length > 0 &&
        validateTwilioJsonSignature({
          authToken: settings.twilioAuthToken,
          signature,
          url: signedUrl,
          rawBody,
        });

      if (!valid) {
        // Cheap, non-PII breadcrumb: no body, number or signature is logged.
        logger.warn('Rejected a Twilio OTP callback: signature validation failed.');
        res.status(403).json({
          error: { code: 'FORBIDDEN', message: 'Invalid webhook signature.' },
        });
        return;
      }

      try {
        await services.otpTelemetry.recordEvents(rawBody);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
