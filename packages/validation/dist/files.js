"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.photoUrlSchema = void 0;
const zod_1 = require("zod");
/**
 * References to uploaded media.
 *
 * Strictly a public URL for now: the customer flow has no attach UI, so this
 * exists to bound the field a client may send. When uploads land, this should
 * become a storage object path produced by the files domain instead of
 * accepting an arbitrary client URL.
 */
exports.photoUrlSchema = zod_1.z.url({ message: 'Photo references must be valid URLs.' });
//# sourceMappingURL=files.js.map