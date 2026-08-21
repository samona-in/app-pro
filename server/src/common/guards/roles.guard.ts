import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@samona/types';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser {
  user?: { id: string; role: UserRole };
}

/**
 * Enforces `@Roles(...)`.
 *
 * Reads the role from `request.user`, which an authentication guard populates
 * from a verified token. A client-sent role is never consulted.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const role = request.user?.role;

    if (!role || !required.includes(role)) {
      throw new ForbiddenException('You do not have access to this resource.');
    }

    return true;
  }
}
