import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthUser } from '../types';

/**
 * Enforces the capability matrix. ADMIN is deliberately unrestricted: anything a
 * PM or Resource may do, an Admin may do too, so it satisfies every requirement.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');
    if (user.role === Role.ADMIN) return true;
    if (required.includes(user.role)) return true;

    throw new ForbiddenException(`This action requires one of: ${required.join(', ')}`);
  }
}
