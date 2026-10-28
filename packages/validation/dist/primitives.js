"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paginationSchema = exports.coordinatesSchema = exports.longitudeSchema = exports.latitudeSchema = exports.fullNameSchema = exports.phoneSchema = exports.emailSchema = exports.slugSchema = exports.idSchema = void 0;
const zod_1 = require("zod");
exports.idSchema = zod_1.z.uuid({ message: 'Must be a valid id.' });
/** Machine name like `electrical-socket-switch-installation`. */
exports.slugSchema = zod_1.z
    .string()
    .trim()
    .min(1, 'Slug is required.')
    .max(100, 'Slug is too long.')
    .regex(/^[a-z0-9-]+$/, 'Invalid slug format.');
exports.emailSchema = zod_1.z
    .email({ message: 'Enter a valid email address.' })
    .trim()
    .toLowerCase();
/** E.164, e.g. +919876543210. Storing a normalised form keeps lookups simple. */
exports.phoneSchema = zod_1.z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, 'Enter a valid phone number, including country code.');
exports.fullNameSchema = zod_1.z
    .string()
    .trim()
    .min(2, 'Name must be at least 2 characters.')
    .max(80, 'Name must be 80 characters or fewer.');
exports.latitudeSchema = zod_1.z.number().min(-90).max(90);
exports.longitudeSchema = zod_1.z.number().min(-180).max(180);
exports.coordinatesSchema = zod_1.z.object({
    latitude: exports.latitudeSchema,
    longitude: exports.longitudeSchema,
});
/** Cursor pagination shared by list endpoints. */
exports.paginationSchema = zod_1.z.object({
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
    cursor: zod_1.z.string().optional(),
});
//# sourceMappingURL=primitives.js.map