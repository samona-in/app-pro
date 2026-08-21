import { Injectable } from '@nestjs/common';

/**
 * Payments domain service.
 *
 * Payment intents, capture and refunds. Amounts are always computed
 * server-side; a client-supplied price is never trusted.
 *
 * Scaffold only — no behaviour is implemented yet.
 */
@Injectable()
export class PaymentsService {}
