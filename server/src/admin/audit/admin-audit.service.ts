import type { Request } from 'express';

export interface AdminAuditServiceDeps {
  prisma: any;
}

export function createAdminAuditService(deps: AdminAuditServiceDeps) {
  const prisma = deps.prisma;
  async function log(params: {
    adminUserId: string;
    action: string;
    resource: string;
    resourceId?: string;
    req: Request;
    success: boolean;
    errorMessage?: string;
    beforeState?: any;
    afterState?: any;
  }) {
    try {
      if (!prisma?.adminAuditLog) return;
      await prisma.adminAuditLog.create({
        data: {
          adminUserId: params.adminUserId,
          action: params.action,
          resource: params.resource,
          resourceId: params.resourceId,
          method: params.req.method,
          path: params.req.originalUrl || params.req.path,
          ipAddress: params.req.ip,
          userAgent: params.req.get('user-agent'),
          requestId: (params.req as any).id,
          success: params.success,
          errorMessage: params.errorMessage,
          beforeState: params.beforeState,
          afterState: params.afterState,
        },
      });
    } catch (error) {
      console.error('Failed to log admin audit:', error);
    }
  }

  return { log };
}

export type AdminAuditService = ReturnType<typeof createAdminAuditService>;
