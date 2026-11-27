import { Router } from 'express';
import type { PrismaClient } from '../../database/prisma';
import type { Prisma } from '../../generated/prisma/client';
import { validate } from '../../common';
import {
  createCampaignSchema,
  updateCampaignSchema,
  createAutomationSchema,
  updateAutomationSchema,
  estimateRecipientsSchema,
  adminNotificationRecipientSearchSchema,
  adminNotificationHistoryParamsSchema,
  adminNotificationHistoryQuerySchema,
  type AdminNotificationHistoryParams,
  type AdminNotificationHistoryQuery,
  type AdminNotificationRecipientSearchInput,
  type EstimateRecipientsInput,
} from '@samona/validation';
import type {
  AdminNotificationHistoryItem,
  AdminNotificationRecipient,
} from '@samona/types';
import { resolveCampaignRoute } from '@samona/config';
import type { AppConfig } from '../../config';
import type { Services } from '../../context';
import {
  isIndividualAudience,
  resolveIndividualRecipient,
  validateCampaignDeepLink,
  type IndividualRecipient,
} from './admin-notifications.shared';

export interface AdminNotificationsDeps {
  prisma: PrismaClient | null;
  config: AppConfig;
  services: Services;
}

type CampaignForProcessing = {
  id: string;
  title: string;
  body: string;
  deepLink: string | null;
  audience: string;
  audienceFilters: Prisma.JsonValue | null;
  status: string;
};

/**
 * Sends one campaign to exactly one validated profile and persists the notice
 * in that surface's existing inbox. Broadcast campaigns deliberately do not
 * take this path: they stay push-only so their current behaviour is unchanged.
 */
async function processIndividualCampaign(
  client: PrismaClient,
  services: Services,
  campaign: CampaignForProcessing,
  audience: 'INDIVIDUAL_PRO' | 'INDIVIDUAL_CUSTOMER',
): Promise<void> {
  const notifications = services.notifications;
  if (!notifications) throw new Error('Notification service is unavailable.');

  await client.notificationCampaign.update({
    where: { id: campaign.id },
    data: { status: 'SENDING', sentAt: new Date() },
  });

  const recipient: IndividualRecipient = await resolveIndividualRecipient(
    client,
    audience,
    campaign.audienceFilters,
  );
  const targets = await notifications.campaignTargetsForUser(recipient.userId, recipient.surface);

  // A retry updates this row's delivery stats but never writes a second
  // recipient-visible notice into the inbox.
  const existing = await client.notificationCampaignRecipient.findFirst({
    where:
      recipient.surface === 'PRO'
        ? { campaignId: campaign.id, proId: recipient.profileId }
        : { campaignId: campaign.id, customerId: recipient.profileId },
    select: { id: true },
  });

  const data = {
    type: 'CAMPAIGN',
    campaignId: campaign.id,
    deepLink: campaign.deepLink || '',
  };
  let attempted = false;
  let deliveryFailed = false;
  let providerRef: string | null = null;

  for (const target of targets) {
    attempted = true;
    try {
      const result = await notifications.sendCampaignNotification({
        token: target.pushToken,
        title: campaign.title,
        body: campaign.body,
        data,
        platform: target.pushPlatform,
        provider: target.pushProvider,
      });
      providerRef ??= result.providerRef ?? null;
      // A missing provider in local development returns ok:false with no error.
      // That is not a recipient failure — the inbox row is still the source of
      // truth — whereas a concrete provider error must be recorded.
      if (result.error) deliveryFailed = true;
    } catch {
      // Never log the provider payload: it can contain a raw device token.
      deliveryFailed = true;
    }
  }

  if (!existing) {
    await notifications.recordCampaignNotification({
      surface: recipient.surface,
      profileId: recipient.profileId,
      userId: recipient.userId,
      title: campaign.title,
      body: campaign.body,
      route: resolveCampaignRoute(campaign.deepLink, recipient.surface),
      delivered: attempted && !deliveryFailed,
      providerRef,
    });
  }

  const status = !attempted ? 'SKIPPED' : deliveryFailed ? 'FAILED' : 'SENT';
  if (existing) {
    await client.notificationCampaignRecipient.update({
      where: { id: existing.id },
      data: {
        status,
        pushToken: targets[0]?.pushToken ?? null,
        providerRef,
        sentAt: attempted ? new Date() : null,
        failedAt: deliveryFailed ? new Date() : null,
        errorMessage: deliveryFailed ? 'Push delivery failed.' : null,
      },
    });
  } else {
    await client.notificationCampaignRecipient.create({
      data: {
        campaignId: campaign.id,
        proId: recipient.surface === 'PRO' ? recipient.profileId : undefined,
        customerId: recipient.surface === 'CUSTOMER' ? recipient.profileId : undefined,
        userId: recipient.userId,
        pushToken: targets[0]?.pushToken ?? null,
        status,
        providerRef,
        sentAt: attempted ? new Date() : null,
        failedAt: deliveryFailed ? new Date() : null,
        errorMessage: deliveryFailed ? 'Push delivery failed.' : null,
      },
    });
  }

  await client.notificationCampaign.update({
    where: { id: campaign.id },
    data: {
      status: !attempted || deliveryFailed ? 'FAILED' : 'COMPLETED',
      recipientCount: 1,
      successfulCount: attempted && !deliveryFailed ? 1 : 0,
      failedCount: !attempted || deliveryFailed ? 1 : 0,
      completedAt: new Date(),
    },
  });
}

async function processCampaign(
  client: PrismaClient,
  services: Services,
  campaign: CampaignForProcessing,
) {
  try {
    if (campaign.status === 'COMPLETED' || campaign.status === 'SENDING') return;

    if (isIndividualAudience(campaign.audience)) {
      await processIndividualCampaign(client, services, campaign, campaign.audience);
      return;
    }
    
    await (client as any).notificationCampaign.update({
      where: { id: campaign.id },
      data: { status: 'SENDING', sentAt: new Date() }
    });

    const audience = campaign.audience;
    let recipients: any[] = [];

    if (audience === 'ALL_PROFESSIONALS') {
      recipients = await (client as any).proProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'pro' })));
    } else if (audience === 'ALL_CUSTOMERS') {
      recipients = await (client as any).customerProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'customer' })));
    } else if (audience === 'VERIFIED_PROFESSIONALS') {
      recipients = await (client as any).proProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null, isVerified: true },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'pro' })));
    } else if (audience === 'ONLINE_PROFESSIONALS') {
      recipients = await (client as any).proProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null, isOnline: true },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'pro' })));
    } else if (audience === 'OFFLINE_PROFESSIONALS') {
      recipients = await (client as any).proProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null, isOnline: false },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'pro' })));
    } else if (audience === 'EVERYONE') {
      const pros = await (client as any).proProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'pro' })));
      const customers = await (client as any).customerProfile.findMany({
        where: { pushToken: { not: null }, deletedAt: null },
        select: { id: true, userId: true, pushToken: true, pushPlatform: true, pushProvider: true }
      }).then((r: any[]) => r.map((x: any) => ({ ...x, _type: 'customer' })));
      recipients = [...pros, ...customers];
    }

    let successCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        // Try to send push notification
        if (services.notifications && typeof (services.notifications as any).sendCampaignNotification === 'function') {
          await (services.notifications as any).sendCampaignNotification({
            token: recipient.pushToken,
            title: campaign.title,
            body: campaign.body,
            data: { type: 'CAMPAIGN', campaignId: campaign.id, deepLink: campaign.deepLink || '' },
            platform: recipient.pushPlatform,
            provider: recipient.pushProvider
          });
          successCount++;
        } else if (services.notifications && typeof (services.notifications as any).sendCampaignPush === 'function') {
          await (services.notifications as any).sendCampaignPush({
            token: recipient.pushToken,
            title: campaign.title,
            body: campaign.body,
            data: { type: 'CAMPAIGN', campaignId: campaign.id, deepLink: campaign.deepLink || '' },
            platform: recipient.pushPlatform,
            provider: recipient.pushProvider
          });
          successCount++;
        } else {
          // Use the general push mechanism if available
          successCount++;
        }

        // Create recipient record
        await (client as any).notificationCampaignRecipient.create({
          data: {
            campaignId: campaign.id,
            proId: recipient._type === 'pro' ? recipient.id : undefined,
            customerId: recipient._type === 'customer' ? recipient.id : undefined,
            userId: recipient.userId,
            pushToken: recipient.pushToken,
            status: 'SENT',
            sentAt: new Date()
          }
        });
      } catch (e) {
        failedCount++;
        console.error('Failed to send to recipient:', e);
        try {
          await (client as any).notificationCampaignRecipient.create({
            data: {
              campaignId: campaign.id,
              proId: recipient._type === 'pro' ? recipient.id : undefined,
              customerId: recipient._type === 'customer' ? recipient.id : undefined,
              userId: recipient.userId,
              pushToken: recipient.pushToken,
              status: 'FAILED',
              failedAt: new Date(),
              errorMessage: e instanceof Error ? e.message : String(e)
            }
          });
        } catch (e2) {
          // ignore
        }
      }
    }

    await (client as any).notificationCampaign.update({
      where: { id: campaign.id },
      data: {
        status: failedCount === recipients.length && recipients.length > 0 ? 'FAILED' : recipients.length === 0 ? 'COMPLETED' : 'COMPLETED',
        recipientCount: recipients.length,
        successfulCount: successCount,
        failedCount: failedCount,
        completedAt: new Date()
      }
    });
  } catch (e) {
    console.error('Error processing campaign:', e);
    await (client as any).notificationCampaign.update({
      where: { id: campaign.id },
      data: { status: 'FAILED' }
    });
  }
}

export function createAdminNotificationsRouter({ prisma: client, config, services }: AdminNotificationsDeps): Router {
  const router = Router();

  /**
   * Recipient lookup for individual campaigns. Bounded, admin-only, and free of
   * push tokens: the admin needs an id to select, not a delivery credential.
   * Search accepts a name, phone fragment, profile id or auth user id.
   */
  router.get('/recipients', validate(adminNotificationRecipientSearchSchema, 'query'), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const { surface, q, recipientId } = req.query as unknown as AdminNotificationRecipientSearchInput;
      const uuid = recipientId ?? (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q ?? '') ? q : undefined);
      const digits = q?.replace(/\D/g, '') ?? '';
      const or: Prisma.ProProfileWhereInput[] = [];
      if (uuid) or.push({ id: uuid }, { userId: uuid });
      if (q && !uuid) {
        or.push(
          { displayName: { contains: q, mode: 'insensitive' } },
          { profile: { fullName: { contains: q, mode: 'insensitive' } } },
        );
        if (digits.length >= 3) or.push({ profile: { phone: { contains: digits } } });
      }

      const common = {
        deletedAt: null,
        deletionRequestedAt: null,
        profile: { isActive: true, deletedAt: null },
        ...(or.length ? { OR: or } : {}),
      };

      const data: AdminNotificationRecipient[] =
        surface === 'PRO'
          ? (
              await client.proProfile.findMany({
                where: common as Prisma.ProProfileWhereInput,
                take: 20,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  isOnline: true,
                  isVerified: true,
                  profile: { select: { fullName: true, phone: true } },
                },
              })
            ).map((row) => ({
              id: row.id,
              userId: row.userId,
              surface,
              name: row.displayName ?? row.profile?.fullName ?? row.profile?.phone ?? 'Unnamed professional',
              phone: row.profile?.phone ?? null,
              isOnline: row.isOnline,
              isVerified: row.isVerified,
            }))
          : (
              await client.customerProfile.findMany({
                where: common as unknown as Prisma.CustomerProfileWhereInput,
                take: 20,
                orderBy: { createdAt: 'desc' },
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  profile: { select: { fullName: true, phone: true } },
                },
              })
            ).map((row) => ({
              id: row.id,
              userId: row.userId,
              surface,
              name: row.displayName ?? row.profile?.fullName ?? row.profile?.phone ?? 'Unnamed customer',
              phone: row.profile?.phone ?? null,
              isOnline: null,
              isVerified: null,
            }));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  });

  /**
   * History of individual notices already sent to one profile. Scoped by the
   * surface so a pro id can never be used to read a customer's history (or the
   * reverse), and no device token or provider reference is returned.
   */
  router.get(
    '/recipients/:surface/:recipientId/history',
    validate(adminNotificationHistoryParamsSchema, 'params'),
    validate(adminNotificationHistoryQuerySchema, 'query'),
    async (req, res, next) => {
      try {
        if (!client) {
          res.status(503).json({ error: { message: 'Database unavailable' } });
          return;
        }
        const { surface, recipientId } = req.params as unknown as AdminNotificationHistoryParams;
        const { limit } = req.query as unknown as AdminNotificationHistoryQuery;
        const audience: 'INDIVIDUAL_PRO' | 'INDIVIDUAL_CUSTOMER' =
          surface === 'PRO' ? 'INDIVIDUAL_PRO' : 'INDIVIDUAL_CUSTOMER';
        const where: Prisma.NotificationCampaignRecipientWhereInput = {
          campaign: { audience },
          ...(surface === 'PRO' ? { proId: recipientId } : { customerId: recipientId }),
        };

        const rows = await client.notificationCampaignRecipient.findMany({
          where,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            sentAt: true,
            createdAt: true,
            campaign: {
              select: {
                id: true,
                title: true,
                body: true,
                type: true,
                deepLink: true,
                sentAt: true,
                createdAt: true,
              },
            },
          },
        });

        const data: AdminNotificationHistoryItem[] = rows.map((row) => ({
          id: row.id,
          campaignId: row.campaign.id,
          title: row.campaign.title,
          body: row.campaign.body,
          type: row.campaign.type,
          deepLink: row.campaign.deepLink,
          status: row.status,
          createdAt: row.campaign.createdAt.toISOString(),
          sentAt: (row.sentAt ?? row.campaign.sentAt)?.toISOString() ?? null,
        }));
        res.json({ data });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get('/campaigns', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const { status, limit = '50', offset = '0' } = req.query as any;
      const where: any = {};
      if (status) where.status = status;
      
      // Process any scheduled campaigns that are due
      try {
        const dueCampaigns = await (client as any).notificationCampaign.findMany({
          where: {
            status: 'SCHEDULED',
            scheduledAt: { lte: new Date() }
          }
        });
        for (const c of dueCampaigns) {
          await (client as any).notificationCampaign.update({ where: { id: c.id }, data: { status: 'QUEUED' } });
          await processCampaign(client, services, { ...c, status: 'QUEUED' });
        }
      } catch (e) {
        console.error('Failed to process scheduled campaigns:', e);
      }
      
      const campaigns = await (client as any).notificationCampaign.findMany({
        where,
        take: parseInt(limit),
        skip: parseInt(offset),
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { include: { profile: true } },
          _count: { select: { recipients: true } },
        },
      });
      const total = await (client as any).notificationCampaign.count({ where });
      res.json({ data: campaigns, total });
    } catch (error) {
      next(error);
    }
  });

  router.get('/campaigns/:id', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({
        where: { id: req.params.id },
        include: {
          createdBy: { include: { profile: true } },
          recipients: { take: 100, orderBy: { createdAt: 'desc' } },
          events: { take: 100, orderBy: { createdAt: 'desc' } },
        },
      });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      res.json({ data: campaign });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns', validate(createCampaignSchema), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const adminUserId = (req as any).adminUser?.id;
      const audience = req.body.audience as string;
      // Resolve the target before a draft exists: a stale or wrong-surface id
      // can never be stored as an individual campaign's audience filter.
      const filters = isIndividualAudience(audience)
        ? { recipientId: (await resolveIndividualRecipient(client, audience, req.body.audienceFilters)).profileId }
        : {};
      const deepLink = validateCampaignDeepLink(audience, req.body.deepLink);
      const campaign = await (client as any).notificationCampaign.create({
        data: {
          name: req.body.name, title: req.body.title, body: req.body.body,
          imageUrl: req.body.imageUrl || null, type: req.body.type, audience: req.body.audience,
          audienceFilters: filters, deepLink,
          status: req.body.sendNow ? 'QUEUED' : req.body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
          sendNow: req.body.sendNow || false,
          scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
          createdById: adminUserId,
        },
      });
      if (req.body.sendNow) {
        try {
          await processCampaign(client, services, campaign);
        } catch (e) {
          console.error('Failed to process campaign:', e);
        }
      }
      res.json({ data: campaign });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/campaigns/:id', validate(updateCampaignSchema), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
        res.status(400).json({ error: { message: 'Can only edit DRAFT or SCHEDULED campaigns' } }); return;
      }
      const mergedAudience = (req.body.audience ?? campaign.audience) as string;
      const mergedFilters = req.body.audienceFilters ?? campaign.audienceFilters;
      const filters = isIndividualAudience(mergedAudience)
        ? { recipientId: (await resolveIndividualRecipient(client, mergedAudience, mergedFilters)).profileId }
        : req.body.audience !== undefined || req.body.audienceFilters !== undefined
          ? {}
          : campaign.audienceFilters;
      const deepLink =
        req.body.deepLink !== undefined
          ? validateCampaignDeepLink(mergedAudience, req.body.deepLink)
          : campaign.deepLink;

      const updated = await (client as any).notificationCampaign.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.name !== undefined && { name: req.body.name }),
          ...(req.body.title !== undefined && { title: req.body.title }),
          ...(req.body.body !== undefined && { body: req.body.body }),
          ...(req.body.imageUrl !== undefined && { imageUrl: req.body.imageUrl || null }),
          ...(req.body.type !== undefined && { type: req.body.type }),
          ...(req.body.audience !== undefined && { audience: req.body.audience }),
          audienceFilters: filters,
          deepLink,
          ...(req.body.sendNow !== undefined && { sendNow: req.body.sendNow }),
          ...(req.body.scheduledAt !== undefined && { scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null }),
        },
      });
      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns/:id/duplicate', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const original = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!original) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      const duplicate = await (client as any).notificationCampaign.create({
        data: {
          name: `${original.name} (Copy)`, title: original.title, body: original.body,
          imageUrl: original.imageUrl, type: original.type, audience: original.audience,
          audienceFilters: original.audienceFilters || {}, deepLink: original.deepLink,
          status: 'DRAFT', sendNow: false, scheduledAt: null, createdById: (req as any).adminUser?.id,
        },
      });
      res.json({ data: duplicate });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns/:id/cancel', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      if (campaign.status !== 'SCHEDULED' && campaign.status !== 'QUEUED') {
        res.status(400).json({ error: { message: 'Can only cancel SCHEDULED or QUEUED campaigns' } }); return;
      }
      const updated = await (client as any).notificationCampaign.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns/:id/send', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      if (campaign.status === 'SENDING' || campaign.status === 'COMPLETED') {
        res.status(400).json({ error: { message: 'Campaign already sent or in progress' } }); return;
      }
      if (isIndividualAudience(campaign.audience)) {
        await resolveIndividualRecipient(client, campaign.audience, campaign.audienceFilters);
      }
      const updated = await (client as any).notificationCampaign.update({ where: { id: req.params.id }, data: { status: 'QUEUED' } });
      
      // Try to process immediately for testing
      try {
        await processCampaign(client, services, updated);
      } catch (e) {
        console.error('Failed to process campaign:', e);
      }
      
      res.json({ data: updated, message: 'Campaign queued for sending' });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns/estimate-recipients', validate(estimateRecipientsSchema), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const { audience, audienceFilters } = req.body as EstimateRecipientsInput;
      let count = 0;
      if (isIndividualAudience(audience)) {
        await resolveIndividualRecipient(client, audience, audienceFilters);
        count = 1;
      } else if (audience === 'ALL_CUSTOMERS') count = await (client as any).customerProfile.count();
      else if (audience === 'ALL_PROFESSIONALS') count = await (client as any).proProfile.count();
      else if (audience === 'EVERYONE') {
        const customers = await (client as any).customerProfile.count();
        const pros = await (client as any).proProfile.count();
        count = customers + pros;
      } else if (audience === 'VERIFIED_PROFESSIONALS') count = await (client as any).proProfile.count({ where: { isVerified: true } });
      else if (audience === 'ONLINE_PROFESSIONALS') count = await (client as any).proProfile.count({ where: { isOnline: true } });
      else if (audience === 'OFFLINE_PROFESSIONALS') count = await (client as any).proProfile.count({ where: { isOnline: false } });
      else if (audience === 'PROFESSIONALS_INCOMPLETE_PROFILES') count = await (client as any).proProfile.count({ where: { onboardingStatus: { in: ['NOT_STARTED', 'IN_PROGRESS'] } } });
      else if (audience === 'CUSTOMERS_WITH_COMPLETED_BOOKINGS') count = await (client as any).customerProfile.count({ where: { jobs: { some: { status: 'COMPLETED' } } } });
      res.json({ count });
    } catch (error) {
      next(error);
    }
  });

  router.get('/automations', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const automations = await (client as any).notificationAutomation.findMany({ orderBy: { createdAt: 'desc' } });
      res.json({ data: automations });
    } catch (error) {
      next(error);
    }
  });

  router.post('/automations', validate(createAutomationSchema), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const automation = await (client as any).notificationAutomation.create({ data: req.body });
      res.json({ data: automation });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/automations/:id', validate(updateAutomationSchema), async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const automation = await (client as any).notificationAutomation.update({ where: { id: req.params.id }, data: req.body });
      res.json({ data: automation });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/campaigns/:id', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      if (campaign.status === 'SENDING' || campaign.status === 'QUEUED') {
        res.status(400).json({ error: { message: 'Cannot delete campaigns in progress' } }); return;
      }
      await (client as any).notificationCampaign.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/automations/:id', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      await (client as any).notificationAutomation.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/campaigns/:id/process', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const campaign = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      if (!campaign) { res.status(404).json({ error: { message: 'Campaign not found' } }); return; }
      await processCampaign(client, services, campaign);
      const updated = await (client as any).notificationCampaign.findUnique({ where: { id: req.params.id } });
      res.json({ data: updated });
    } catch (error) {
      next(error);
    }
  });

  router.post('/test', async (req, res, next) => {
    try {
      res.json({ success: true, message: 'Test notification sent (simulated)' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
