import {
  ServiceRequestStatus,
  PaymentStatus,
  type ServiceRequestDto,
} from '@samona/types';
import type { PrismaClient } from '../database/prisma';
import type { JobsService } from '../jobs/jobs.service';
import { REALTIME_EVENTS, type RealtimeService } from '../realtime/gateway';
import { notFound, conflict } from '../common/errors';

export interface PaymentsServiceDeps {
  prisma: PrismaClient;
  /** Reads + serialises the request DTO shared with the jobs domain. */
  jobs: JobsService;
  realtime: RealtimeService;
}

/**
 * Payments domain service.
 *
 * Money recorded for a confirmed request. The payment gateway is deliberately
 * not wired for V1 — the row is created when the job completes and the
 * customer's `markPaid` is the authoritative settle point (architecture §31).
 *
 * Amounts are always computed server-side from the request's anchored price; a
 * client-supplied price is never trusted.
 */
export function createPaymentsService(deps: PaymentsServiceDeps) {
  /**
   * Settles a completed job: COMPLETED → PAID, records the paid moment and
   * credits the pro's completed-job count. Enforced exactly once.
   */
  async function markPaid(customerUserId: string, requestId: string): Promise<ServiceRequestDto> {
    let proUserId: string | null = null;

    await deps.prisma.$transaction(async (tx) => {
      const request = await tx.serviceRequest.findFirst({
        where: { id: requestId, customerId: customerUserId },
        select: {
          id: true,
          status: true,
          finalPrice: true,
          estimatedPrice: true,
          selectedPro: { select: { id: true, userId: true } },
        },
      });
      if (!request) throw notFound('This request is not yours.');

      // The only transition entry into PAID is from COMPLETED.
      if (request.status !== ServiceRequestStatus.COMPLETED) {
        throw conflict('Only a completed job can be paid.');
      }

      const existing = await tx.payment.findUnique({ where: { serviceRequestId: requestId } });
      if (existing?.status === PaymentStatus.PAID) {
        throw conflict('This job has already been paid.');
      }

      const amount = request.finalPrice ?? request.estimatedPrice ?? 0;
      await tx.payment.upsert({
        where: { serviceRequestId: requestId },
        create: { serviceRequestId: requestId, amount, status: PaymentStatus.PAID, paidAt: new Date() },
        update: { status: PaymentStatus.PAID, paidAt: new Date() },
      });

      await tx.jobStatusHistory.create({
        data: {
          serviceRequestId: requestId,
          status: ServiceRequestStatus.PAID,
          changedById: customerUserId,
          note: 'Paid by the customer.',
        },
      });

      await tx.serviceRequest.update({
        where: { id: requestId },
        data: { status: ServiceRequestStatus.PAID },
      });

      if (request.selectedPro) {
        proUserId = request.selectedPro.userId;
        await tx.proProfile.update({
          where: { id: request.selectedPro.id },
          data: { completedJobs: { increment: 1 } },
        });
      }
    });

    const dto = await deps.jobs.getForCustomer(customerUserId, requestId);
    deps.realtime.emitToUser(customerUserId, REALTIME_EVENTS.PAYMENT_STATUS, dto);
    if (proUserId) deps.realtime.emitToUser(proUserId, REALTIME_EVENTS.PAYMENT_STATUS, dto);
    return dto;
  }

  return { markPaid };
}

export type PaymentsService = ReturnType<typeof createPaymentsService>;