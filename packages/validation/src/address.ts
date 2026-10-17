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
  /** The customer's own name for this address, e.g. "Aveen's flat". */
  name: z.string().trim().min(1, 'Name is required.').max(40),
  label: addressLabelSchema,
  addressLine1: z.string().trim().min(1, 'Address is required.').max(160),
  addressLine2: optionalLine(160),
  landmark: optionalLine(120),
  locality: optionalLine(120),
  city: optionalLine(80),
  state: optionalLine(80),
  postalCode: optionalLine(12),
  coordinates: coordinatesSchema,
  /**
   * The provider's durable place id for this address, when the geocoder
   * supplied one. Stored so the display label can be re-resolved on read.
   */
  placeId: z.string().trim().max(512).nullable().optional(),
  /** Set when this address should become the customer's default. */
  isDefault: z.boolean().optional(),
});

export type SavedAddressCreateInput = z.infer<typeof savedAddressCreateSchema>;

export const savedAddressUpdateSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required.').max(40).optional(),
    label: addressLabelSchema.optional(),
    addressLine1: z.string().trim().min(1, 'Address is required.').max(160).optional(),
    addressLine2: optionalLine(160),
    landmark: optionalLine(120),
    locality: optionalLine(120),
    city: optionalLine(80),
    state: optionalLine(80),
    postalCode: optionalLine(12),
    coordinates: coordinatesSchema.optional(),
    /** Updated durable place id, when the address was re-picked. */
    placeId: z.string().trim().max(512).nullable().optional(),
    /** Set true to make this the customer's single default address. */
    isDefault: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Nothing to update.',
  });

export type SavedAddressUpdateInput = z.infer<typeof savedAddressUpdateSchema>;