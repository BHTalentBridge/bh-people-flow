import { Controller, Get, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { UsersService } from './users.service';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Accounts are created, edited and de-activated on the **Resources** screen —
 * `Resource.status` drives `User.isActive`, and the access-level dropdown there
 * sets `User.role`. So this controller is only the lookup the project manager
 * pickers need; there is no separate account-management surface.
 */
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Candidates for the project's Project Manager and Engineering Manager
   * pickers. `role` is a CSV of the exact roles wanted — `PM`, `EM` or `PM,EM`.
   * Admins are never returned; see `UsersService.managerOptions`.
   */
  @Get('managers')
  // Admin-only: the only surface that uses this is the project's own Project
  // Manager / Engineering Manager pickers, which are Admin-only. Leaving it open
  // to PM and EM handed any of them the org-wide manager roster — names and
  // emails of managers on projects they have nothing to do with.
  @Roles(Role.ADMIN)
  managerOptions(@Query('role') role?: string) {
    return this.users.managerOptions(role);
  }
}
