import { z } from 'zod';
/**
 * References to uploaded media.
 *
 * Strictly a public URL for now: the customer flow has no attach UI, so this
 * exists to bound the field a client may send. When uploads land, this should
 * become a storage object path produced by the files domain instead of
 * accepting an arbitrary client URL.
 */
export declare const photoUrlSchema: z.ZodURL;
//# sourceMappingURL=files.d.ts.map