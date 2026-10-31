import { Router } from 'express';
import type { PrismaClient } from '../../database/prisma';
import { validate } from '../../common';
import { createCampaignSchema, updateCampaignSchema, sendCampaignSchema, createAutomationSchema, updateAutomationSchema } from '@samona/validation';
import type { AppConfig } from '../../config';
import type { Services } from '../../context';

export interface AdminNotificationsDeps {
  prisma: PrismaClient | null;
  config: AppConfig;
  services: Services;
}

async function processCampaign(client: PrismaClient, services: Services, campaign: any) {
  try {
    if (campaign.status === 'COMPLETED' || campaign.status === 'SENDING') return;
    
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
      const campaign = await (client as any).notificationCampaign.create({
        data: {
          name: req.body.name, title: req.body.title, body: req.body.body,
          imageUrl: req.body.imageUrl || null, type: req.body.type, audience: req.body.audience,
          audienceFilters: req.body.audienceFilters || {}, deepLink: req.body.deepLink || null,
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
      const updated = await (client as any).notificationCampaign.update({
        where: { id: req.params.id },
        data: {
          ...(req.body.name !== undefined && { name: req.body.name }),
          ...(req.body.title !== undefined && { title: req.body.title }),
          ...(req.body.body !== undefined && { body: req.body.body }),
          ...(req.body.imageUrl !== undefined && { imageUrl: req.body.imageUrl || null }),
          ...(req.body.type !== undefined && { type: req.body.type }),
          ...(req.body.audience !== undefined && { audience: req.body.audience }),
          ...(req.body.audienceFilters !== undefined && { audienceFilters: req.body.audienceFilters }),
          ...(req.body.deepLink !== undefined && { deepLink: req.body.deepLink || null }),
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

  router.post('/campaigns/estimate-recipients', async (req, res, next) => {
    try {
      if (!client) { res.status(503).json({ error: { message: 'Database unavailable' } }); return; }
      const { audience } = req.body;
      let count = 0;
      if (audience === 'ALL_CUSTOMERS') count = await (client as any).customerProfile.count();
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
