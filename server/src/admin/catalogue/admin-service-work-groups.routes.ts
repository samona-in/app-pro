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

const pricingModelSchema = z.enum(['PER_UNIT', 'PER_BOOKING', 'PER_HOUR']);

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
  pricingModel: pricingModelSchema.optional(),
  unitLabel: z.string().trim().min(1).max(50).nullable().optional(),
  minQuantity: z.number().int().min(1).max(1_000).optional(),
  maxQuantity: z.number().int().min(1).max(1_000).optional(),
  minDurationMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .nullable()
    .optional(),
  maxDurationMinutes: z
    .number()
    .int()
    .min(15)
    .max(24 * 60)
    .nullable()
    .optional(),
  durationStepMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .nullable()
    .optional(),
  groupId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const updateSkillSchema = createSkillSchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Add at least one field to update.');

type PricingFields = {
  pricingModel: 'PER_UNIT' | 'PER_BOOKING' | 'PER_HOUR';
  unitLabel: string | null;
  minQuantity: number;
  maxQuantity: number;
  minDurationMinutes: number | null;
  maxDurationMinutes: number | null;
  durationStepMinutes: number | null;
};

/**
 * Validates the pricing configuration as a whole, after the model-specific
 * fields have been merged with the stored values on update. Keeping this out of
 * the Zod schema lets PATCH bodies carry only the fields that changed while
 * still enforcing cross-field rules.
 */
function validatePricing(values: PricingFields, res: Response): boolean {
  if (values.pricingModel === 'PER_UNIT') {
    if (!values.unitLabel) {
      res.status(400).json({ error: { message: 'Name the unit (e.g. hinge, fan).' } });
      return false;
    }
    if (values.minQuantity < 1 || values.maxQuantity < values.minQuantity) {
      res.status(400).json({ error: { message: 'Check the minimum and maximum quantity.' } });
      return false;
    }
  }

  if (values.pricingModel === 'PER_HOUR') {
    const min = values.minDurationMinutes;
    const max = values.maxDurationMinutes;
    const step = values.durationStepMinutes;
    if (min === null || max === null || step === null || max < min) {
      res
        .status(400)
        .json({ error: { message: 'Set a minimum, maximum, and step for the duration.' } });
      return false;
    }
  }

  return true;
}

/** Normalises the pricing columns for the selected model before writing them. */
function pricingDataFor(values: PricingFields) {
  if (values.pricingModel === 'PER_UNIT') {
    return {
      pricingModel: values.pricingModel,
      unitLabel: values.unitLabel,
      minQuantity: values.minQuantity,
      maxQuantity: values.maxQuantity,
      minDurationMinutes: null,
      maxDurationMinutes: null,
      durationStepMinutes: null,
    };
  }

  if (values.pricingModel === 'PER_HOUR') {
    return {
      pricingModel: values.pricingModel,
      unitLabel: null,
      minQuantity: 1,
      maxQuantity: 1,
      minDurationMinutes: values.minDurationMinutes,
      maxDurationMinutes: values.maxDurationMinutes,
      durationStepMinutes: values.durationStepMinutes,
    };
  }

  return {
    pricingModel: 'PER_BOOKING' as const,
    unitLabel: null,
    minQuantity: 1,
    maxQuantity: 1,
    minDurationMinutes: null,
    maxDurationMinutes: null,
    durationStepMinutes: null,
  };
}

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

      const pricing: PricingFields = {
        pricingModel: body.pricingModel ?? 'PER_BOOKING',
        unitLabel: body.unitLabel ?? null,
        minQuantity: body.minQuantity ?? 1,
        maxQuantity: body.maxQuantity ?? 1,
        minDurationMinutes: body.minDurationMinutes ?? null,
        maxDurationMinutes: body.maxDurationMinutes ?? null,
        durationStepMinutes: body.durationStepMinutes ?? null,
      };
      if (!validatePricing(pricing, res)) return;

      const skill = await prisma.skill.create({
        data: {
          serviceId: service.id,
          name: body.name,
          slug: body.slug,
          icon: body.icon || null,
          basePricePaise: body.basePricePaise,
          ...pricingDataFor(pricing),
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
        select: {
          id: true,
          serviceId: true,
          pricingModel: true,
          unitLabel: true,
          minQuantity: true,
          maxQuantity: true,
          minDurationMinutes: true,
          maxDurationMinutes: true,
          durationStepMinutes: true,
        },
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

      const pricing: PricingFields = {
        pricingModel: body.pricingModel ?? existing.pricingModel,
        unitLabel: body.unitLabel !== undefined ? body.unitLabel : existing.unitLabel,
        minQuantity: body.minQuantity ?? existing.minQuantity,
        maxQuantity: body.maxQuantity ?? existing.maxQuantity,
        minDurationMinutes:
          body.minDurationMinutes !== undefined
            ? body.minDurationMinutes
            : existing.minDurationMinutes,
        maxDurationMinutes:
          body.maxDurationMinutes !== undefined
            ? body.maxDurationMinutes
            : existing.maxDurationMinutes,
        durationStepMinutes:
          body.durationStepMinutes !== undefined
            ? body.durationStepMinutes
            : existing.durationStepMinutes,
      };
      if (!validatePricing(pricing, res)) return;

      const skill = await prisma.skill.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.slug !== undefined && { slug: body.slug }),
          ...(body.icon !== undefined && { icon: body.icon || null }),
          ...(body.basePricePaise !== undefined && { basePricePaise: body.basePricePaise }),
          ...pricingDataFor(pricing),
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
