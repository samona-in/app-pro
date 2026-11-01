import { Router, type Response } from 'express';
import { z } from 'zod';
import type { PrismaClient } from '../../database/prisma';

const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers, and hyphens for the slug.',
    ),
  imageUrl: z.string().trim().max(2048).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateGroupSchema = createGroupSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Add at least one field to update.');

const createSkillSchema = z.object({
  name: z.string().trim().min(1).max(150),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(150)
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use lowercase letters, numbers, and hyphens for the slug.',
    ),
  icon: z.string().trim().max(2048).nullable().optional(),
  basePricePaise: z
    .number()
    .int()
    .min(100)
    .max(100_000_000)
    .refine((price) => price % 100 === 0, 'Enter the base price in whole rupees.'),
  groupId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateSkillSchema = createSkillSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Add at least one field to update.');

function parseBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
  res: Response,
): z.infer<T> | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res
      .status(400)
      .json({ error: { message: result.error.issues[0]?.message ?? 'Invalid request.' } });
    return null;
  }
  return result.data;
}

export function createAdminServiceWorkGroupsRouter(prisma: PrismaClient | null): Router {
  const router = Router();

  router.post('/services/:serviceId/skills', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    const body = parseBody(createSkillSchema, req.body, res);
    if (!body) return;

    try {
      const service = await prisma.service.findUnique({
        where: { id: req.params.serviceId },
        select: { id: true },
      });
      if (!service) {
        res.status(404).json({ error: { message: 'Service not found' } });
        return;
      }

      if (body.groupId) {
        const group = await prisma.serviceWorkGroup.findFirst({
          where: { id: body.groupId, serviceId: service.id },
          select: { id: true },
        });
        if (!group) {
          res.status(400).json({ error: { message: 'Choose a work group from this service.' } });
          return;
        }
      }

      const skill = await prisma.skill.create({
        data: {
          serviceId: service.id,
          name: body.name,
          slug: body.slug,
          icon: body.icon || null,
          basePricePaise: body.basePricePaise,
          groupId: body.groupId ?? null,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
      });
      res.status(201).json({ data: skill });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/skills/:id', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    const body = parseBody(updateSkillSchema, req.body, res);
    if (!body) return;

    try {
      const existing = await prisma.skill.findUnique({
        where: { id: req.params.id },
        select: { id: true, serviceId: true },
      });
      if (!existing) {
        res.status(404).json({ error: { message: 'Work not found' } });
        return;
      }

      if (body.groupId) {
        const group = await prisma.serviceWorkGroup.findFirst({
          where: { id: body.groupId, serviceId: existing.serviceId },
          select: { id: true },
        });
        if (!group) {
          res.status(400).json({ error: { message: 'Choose a work group from this service.' } });
          return;
        }
      }

      const skill = await prisma.skill.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.icon !== undefined && { icon: body.icon || null }),
          ...(body.basePricePaise !== undefined && { basePricePaise: body.basePricePaise }),
          ...(body.groupId !== undefined && { groupId: body.groupId }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
      res.json({ data: skill });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/skills/:id', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    try {
      const existing = await prisma.skill.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: { message: 'Work not found' } });
        return;
      }

      const historicalJobs = await prisma.job.count({ where: { skillId: existing.id } });
      if (historicalJobs > 0) {
        await prisma.skill.update({
          where: { id: existing.id },
          data: { isActive: false },
        });
        res.json({ success: true, archived: true });
        return;
      }

      await prisma.skill.delete({ where: { id: existing.id } });
      res.json({ success: true, archived: false });
    } catch (error) {
      next(error);
    }
  });

  router.post('/services/:serviceId/groups', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    const body = parseBody(createGroupSchema, req.body, res);
    if (!body) return;

    try {
      const service = await prisma.service.findUnique({
        where: { id: req.params.serviceId },
        select: { id: true },
      });
      if (!service) {
        res.status(404).json({ error: { message: 'Service not found' } });
        return;
      }

      const group = await prisma.serviceWorkGroup.create({
        data: {
          serviceId: service.id,
          name: body.name,
          slug: body.slug,
          imageUrl: body.imageUrl || null,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
      });
      res.status(201).json({ data: group });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/service-work-groups/:id', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    const body = parseBody(updateGroupSchema, req.body, res);
    if (!body) return;

    try {
      const existing = await prisma.serviceWorkGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true },
      });
      if (!existing) {
        res.status(404).json({ error: { message: 'Work group not found' } });
        return;
      }

      const group = await prisma.serviceWorkGroup.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.imageUrl !== undefined && { imageUrl: body.imageUrl || null }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });
      res.json({ data: group });
    } catch (error) {
      next(error);
    }
  });

  router.delete('/service-work-groups/:id', async (req, res, next) => {
    if (!prisma) {
      res.status(503).json({ error: { message: 'Database unavailable' } });
      return;
    }

    try {
      const group = await prisma.serviceWorkGroup.findUnique({
        where: { id: req.params.id },
        select: { id: true, skills: { select: { id: true } } },
      });
      if (!group) {
        res.status(404).json({ error: { message: 'Work group not found' } });
        return;
      }

      await prisma.serviceWorkGroup.delete({ where: { id: group.id } });
      res.json({ success: true, ungroupedWorks: group.skills.length });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
