import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { LeaveService } from './leave.service';
import { CreateLeaveDto, LeaveDecisionDto, LeaveQueryDto } from './dto/leave.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

/**
 * Leave. Resources raise it; Engineering Managers and Admins decide it.
 *
 * The role lists here are the outer fence — `LeaveService` re-checks both rules
 * per request, because "an EM on *this* resource's projects" isn't something a
 * guard can express.
 */
@Controller('leave')
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  /** Everyone in scope reads: a resource their own, a PM/EM their people, Admin all. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: LeaveQueryDto) {
    return this.leave.list(user, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query('year') year?: string) {
    return this.leave.summary(user, year ? Number(year) : undefined);
  }

  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.leave.pendingCount(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.findOne(user, id);
  }

  /** Resources only — a manager posting here is refused in the service. */
  @Post()
  @Roles(Role.RESOURCE)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLeaveDto) {
    return this.leave.create(user, dto);
  }

  /** EM or Admin. Either decision settles the request. */
  @Post(':id/decision')
  @Roles(Role.ADMIN, Role.EM)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: LeaveDecisionDto) {
    return this.leave.decide(user, id, dto);
  }

  /** Withdraw your own pending request before anyone acts on it. */
  @Delete(':id')
  withdraw(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.leave.withdraw(user, id);
  }
}
