import { Router } from 'express';
import { z } from 'zod';
import { phoneSchema } from '@samona/validation';
import type { Services } from '../context';
import type { Limiters } from '../common';
import { validate } from '../common';

const registerAttemptSchema = z.object({
  phone: phoneSchema,
  app: z.enum(['customer', 'pro']),
  /**
   * Client-generated idempotency key. The app retries telemetry on a failed
   * request, so the same request must not create a second attempt row.
   */
  clientAttemptId: z
    .string()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_.:-]+$/, 'clientAttemptId contains unsupported characters.'),
  device: z
    .object({
      manufacturer: z.string().max(64).optional(),
      model: z.string().max(64).optional(),
      osVersion: z.string().max(32).optional(),
    })
    .optional(),
});

/**
 * Registers that the app just asked Supabase for an OTP.
 *
 * This is telemetry, not authentication: it grants nothing, stores no OTP and
 * cannot block a sign-in. The client calls it fire-and-forget before
 * `signInWithOtp`, and a failure here must never surface to the user.
 *
 * Mounted at `/auth/otp-attempts` so it sits beside the rest of the auth
 * surface. It is unauthenticated by nature — the caller is about to become a
 * user — and rate-limited on the write budget.
 */
export function createOtpRouter(services: Services, limiters: Limiters): Router {
  const router = Router();

  router.post(
    '/otp-attempts',
    limiters.write,
    validate(registerAttemptSchema),
    async (req, res, next) => {
      try {
        if (!services.otpTelemetry.enabled) {
          // The client treats this as best-effort. An accepted-but-empty answer
          // keeps a telemetry-off deployment from looking like a client bug.
          res.status(202).json({ attemptId: null });
          return;
        }

        const body = req.body as z.infer<typeof registerAttemptSchema>;
        const attempt = await services.otpTelemetry.registerAttempt({
          phone: body.phone,
          app: body.app === 'pro' ? 'PRO' : 'CUSTOMER',
          clientAttemptId: body.clientAttemptId,
          device: body.device,
        });

        res.status(202).json({ attemptId: attempt?.attemptId ?? null });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
