import { Router } from 'express';
import {
  markMessagesReceivedSchema,
  messageListQuerySchema,
  sendMessageSchema,
} from '@samona/validation';
import type { Services } from '../context';
import { createRequireAuth, validate } from '../common';

/**
 * HTTP surface for the messages domain, mounted at `/messages`.
 *
 * Every route is scoped to the caller's own involvement in a job: the actor's
 * Profile id comes from the verified token, never from the path or body, and
 * the job must be one the caller is a party of with an assigned pro
 * (CLAUDE.md "Security"). No role is enforced here because both a customer and
 * a pro can be a party — the service is the authority on who may talk.
 */
export function createMessagesRouter(services: Services): Router {
  const router = Router();
  const requireAuth = createRequireAuth({
    verifier: services.tokenVerifier,
    authService: services.auth,
  });

  router.use(requireAuth);

  /** The caller's page of a job conversation, oldest first in chat order. */
  router.get('/', validate(messageListQuerySchema, 'query'), async (req, res, next) => {
    try {
      const query = req.query as unknown as {
        jobId: string;
        limit: number;
        before?: string;
      };
      res.json(await services.messages.listForParty(req.user!.id, query));
    } catch (error) {
      next(error);
    }
  });

  /** Posts one message to a job conversation. */
  router.post('/', validate(sendMessageSchema), async (req, res, next) => {
    try {
      res.status(201).json(
        await services.messages.send(req.user!.id, {
          jobId: req.body.jobId,
          content: req.body.content,
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  /** Acks the other party's messages as delivered (single→double tick). */
  router.post(
    '/delivered',
    validate(markMessagesReceivedSchema),
    async (req, res, next) => {
      try {
        await services.messages.markDelivered(req.user!.id, req.body.jobId);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  );

  /** Acks the other party's messages as read (double-blue tick). */
  router.post('/read', validate(markMessagesReceivedSchema), async (req, res, next) => {
    try {
      await services.messages.markRead(req.user!.id, req.body.jobId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}