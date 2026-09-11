import { z } from 'zod';
import { ADDRESS_LABELS } from './constants';
import { coordinatesSchema } from './primitives';

/**
 * Saved-address input schemas for `/addresses`, shared by the Customer app and
 * the API. `coordinatesSchema` reuses the shared lat/long primitives.
 */
export const addressLabelSchema = z.enum(ADDRESS_LABELS);

const optionalLine = (max: number) => z.string().trim().max(max).optional();

export const savedAddressCreateSchema = z.object({
  label: addressLabelSchema,
  addressLine1: z.string().trim().min(1, 'Address is required.').max(160),
  addressLine2: optionalLine(160),
  landmark: optionalLine(120),
  locality: optionalLine(120),
  city: optionalLine(80),
  state: optionalLine(80),
  postalCode: optionalLine(12),
  coordinates: coordinatesSchema,
  /** Set when this address should become the customer's default. */
  isDefault: z.boolean().optional(),
});

export type SavedAddressCreateInput = z.infer<typeof savedAddressCreateSchema>;

export const savedAddressUpdateSchema = z
  .object({
    label: addressLabelSchema.optional(),
    addressLine1: z.string().trim().min(1, 'Address is required.').max(160).optional(),
    addressLine2: optionalLine(160),
    landmark: optionalLine(120),
    locality: optionalLine(120),
    city: optionalLine(80),
    state: optionalLine(80),
    postalCode: optionalLine(12),
    coordinates: coordinatesSchema.optional(),
    /** Set true to make this the customer's single default address. */
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type SavedAddressUpdateInput = z.infer<typeof savedAddressUpdateSchema>;