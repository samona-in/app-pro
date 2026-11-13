import { Router } from 'express';
import request from 'supertest';
import express from 'express';
import type { PrismaClient } from '../../database/prisma';
import { errorHandler } from '../../common/middleware/error-handler';
import { createAdminDraftsRouter } from './admin-drafts.routes';

const NOW = new Date('2026-11-12T10:00:00Z');

function buildPrisma() {
  const counts: Record<string, number> = { ACTIVE: 3, CONVERTED: 5, ABANDONED: 2 };

  const prisma = {
    bookingDraft: {
      count: jest.fn(async ({ where }: { where: { status: string } }) => counts[where.status] ?? 0),
      groupBy: jest.fn().mockResolvedValue([
        { serviceId: 'svc-1', status: 'ACTIVE', _count: { _all: 2 } },
        { serviceId: 'svc-1', status: 'CONVERTED', _count: { _all: 3 } },
        { serviceId: 'svc-2', status: 'ABANDONED', _count: { _all: 1 } },
      ]),
      findMany: jest.fn().mockResolvedValue([
        {
          id: 'draft-1',
          status: 'ACTIVE',
          service: { name: 'Electrical' },
          customer: { displayName: null, profile: { fullName: 'Priya Sharma' } },
          items: [{ quantity: 2 }, { quantity: 1 }],
          estimatedTotalPaise: 21_000,
          updatedAt: NOW,
        },
      ]),
    },
    service: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'svc-1', name: 'Electrical' },
        { id: 'svc-2', name: 'Plumbing' },
      ]),
    },
  };

  return prisma as unknown as PrismaClient & typeof prisma;
}

function appWith(prisma: PrismaClient | null) {
  return express()
    .use(express.json())
    .use('/drafts', createAdminDraftsRouter({ prisma }))
    .use(errorHandler);
}

describe('admin drafts routes', () => {
  it('reports totals, per-service activity and recent carts', async () => {
    const prisma = buildPrisma();

    const response = await request(appWith(prisma)).get('/drafts').expect(200);

    expect(response.body.totals).toEqual({
      active: 3,
      converted: 5,
      abandoned: 2,
      total: 10,
    });
    expect(response.body.byService).toEqual([
      {
        serviceId: 'svc-1',
        serviceName: 'Electrical',
        active: 2,
        converted: 3,
        abandoned: 0,
        total: 5,
      },
      {
        serviceId: 'svc-2',
        serviceName: 'Plumbing',
        active: 0,
        converted: 0,
        abandoned: 1,
        total: 1,
      },
    ]);
    expect(response.body.recent).toEqual([
      {
        id: 'draft-1',
        status: 'ACTIVE',
        serviceName: 'Electrical',
        customerName: 'Priya Sharma',
        worksCount: 2,
        estimatedTotalPaise: 21_000,
        updatedAt: NOW.toISOString(),
      },
    ]);
    expect(typeof response.body.generatedAt).toBe('string');
  });

  it('reports database unavailability instead of crashing', async () => {
    const response = await request(appWith(null)).get('/drafts').expect(503);

    expect(response.body.error.message).toBe('Database unavailable');
  });
});
