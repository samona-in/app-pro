import type { AppConfig } from '../config';
import { logger } from '../common/logger';

/**
 * Supabase Auth administration, reachable only from this server.
 *
 * Used exactly once per account: FULL_ACCOUNT account deletion deletes the
 * identity via the Admin API. Uses the project's service-role key, which is
 * never shipped to a client and never logged. "Admin" here means "can manage
 * users server-side", not "an admin app surface".
 */
export interface SupabaseAdminClient {
  /** Permanently deletes a user's identity (`auth.users`), idempotently. */
  deleteUser: (userId: string) => Promise<void>;
}

/**
 * Builds the admin client from validated config, or returns null when the
 * service-role key is not configured (the server keeps serving non-deletion
 * traffic; a FULL_ACCOUNT deletion then fails the DELETE_AUTH step loudly).
 */
export function createSupabaseAdminClient(config: AppConfig): SupabaseAdminClient | null {
  const serviceKey = config.supabaseServiceRoleKey;
  if (!serviceKey) return null;

  const baseUrl = config.supabaseUrl.replace(/\/+$/, '');

  return {
    async deleteUser(userId: string): Promise<void> {
      const response = await fetch(`${baseUrl}/auth/v1/admin/users/${userId}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
        },
      });

      // 404 means the identity is already gone — the deletion is effectively a
      // no-op and must not fail the workflow.
      if (response.ok || response.status === 404) return;

      logger.error(`Supabase admin delete failed for ${userId}: HTTP ${response.status}.`);
      throw new Error(`Supabase admin user delete returned HTTP ${response.status}.`);
    },
  };
}
