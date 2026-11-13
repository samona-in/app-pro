import { z } from 'zod';
import { JOB_IMAGE_LIMIT, JOB_ITEMS_LIMIT, ORDER_GROUP_SERVICES_LIMIT } from '@samona/types';
import { createJobItemSchema, jobDescriptionSchema, jobImagePathSchema } from './job';
import { slugSchema } from './primitives';

/**
 * One service's slice of the saved cart.
 *
 * The same rules as placing a booking: works are addressed by slug, each work
 * appears once, and the list is bounded. A group with no items is never sent —
 * the client drops the service from the cart instead.
 */
export const saveBookingCartGroupSchema = z
  .object({
    serviceSlug: slugSchema,
    items: z.array(createJobItemSchema).min(1).max(JOB_ITEMS_LIMIT),
  })
  .superRefine((group, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of group.items.entries()) {
      if (seen.has(item.skillSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each work may appear only once — change its quantity instead.',
          path: ['items', index, 'skillSlug'],
        });
      }
      seen.add(item.skillSlug);
    }
  });

export type SaveBookingCartGroupInput = z.infer<typeof saveBookingCartGroupSchema>;

/**
 * Saves (or replaces) the caller's whole cart, which may span services.
 *
 * The cart holds one group per service; every group becomes its own booking on
 * checkout. Notes and reference photos are shared by the whole visit. An empty
 * `groups` list clears the cart: the server abandons every active group and
 * returns `null`.
 *
 * The client sends only *what* the customer wants (`skillSlug`, `quantity`,
 * `durationMinutes`); every price is derived from the catalogue server-side.
 */
export const saveBookingCartSchema = z
  .object({
    description: jobDescriptionSchema.default(''),
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
    groups: z.array(saveBookingCartGroupSchema).max(ORDER_GROUP_SERVICES_LIMIT),
  })
  .superRefine((value, ctx) => {
    // One group per service: two groups for the same service would become two
    // jobs for the same trade, which the cart never means.
    const seen = new Set<string>();
    for (const [index, group] of value.groups.entries()) {
      if (seen.has(group.serviceSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each service may appear only once in a cart.',
          path: ['groups', index, 'serviceSlug'],
        });
      }
      seen.add(group.serviceSlug);
    }
  });

/** The parsed cart payload the server works with. */
export type SaveBookingCartInput = z.infer<typeof saveBookingCartSchema>;

/** The shape a client sends (defaults may be omitted). */
export type SaveBookingCartRequest = z.input<typeof saveBookingCartSchema>;

/**
 * The legacy single-service cart payload.
 *
 * Kept for older app builds that still save one service at a time. The server
 * treats it as a one-group cart.
 */
export const saveBookingDraftSchema = z
  .object({
    serviceSlug: slugSchema,
    description: jobDescriptionSchema.default(''),
    imagePaths: z.array(jobImagePathSchema).max(JOB_IMAGE_LIMIT).default([]),
    items: z.array(createJobItemSchema).max(JOB_ITEMS_LIMIT).default([]),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, item] of value.items.entries()) {
      if (seen.has(item.skillSlug)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Each work may appear only once — change its quantity instead.',
          path: ['items', index, 'skillSlug'],
        });
      }
      seen.add(item.skillSlug);
    }
  });

/** The parsed legacy cart payload the server works with. */
export type SaveBookingDraftInput = z.infer<typeof saveBookingDraftSchema>;

/** The shape a legacy client sends (defaults may be omitted). */
export type SaveBookingDraftRequest = z.input<typeof saveBookingDraftSchema>;
