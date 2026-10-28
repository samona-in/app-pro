"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletionTokenHeaderSchema = exports.updateProfileSchema = exports.userRoleSchema = void 0;
const zod_1 = require("zod");
const types_1 = require("@samona/types");
const primitives_1 = require("./primitives");
/**
 * A surface role is validated here so the *shape* is well-formed, but a
 * client-supplied role is never trusted for authorisation — the server derives
 * the effective surface from the `X-App-Type` header and the stored `isAdmin`
 * flag (CLAUDE.md "Authentication"). Admin is not a surface; it is `isAdmin`.
 */
exports.userRoleSchema = zod_1.z.enum(types_1.USER_ROLES);
exports.updateProfileSchema = zod_1.z.object({
    fullName: primitives_1.fullNameSchema.optional(),
    email: primitives_1.emailSchema.optional(),
    phone: primitives_1.phoneSchema.optional(),
});
/**
 * The single-use deletion authorization travels in the `X-Deletion-Token`
 * header so `DELETE /users/me` stays a bodyless request and the token never
 * appears in a URL or a log line. The token itself is 64 hex chars; the shape
 * only enforces a sane length, nothing about content.
 */
exports.deletionTokenHeaderSchema = zod_1.z.object({
    'x-deletion-token': zod_1.z.string().trim().min(1).max(128),
});
//# sourceMappingURL=user.js.map