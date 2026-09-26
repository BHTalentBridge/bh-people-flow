import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AssignmentsService } from './assignments.service';
import { AssignmentRequestQueryDto, DecideAssignmentDto } from './dto/assignment-request.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

/**
 * The approval queue for resource assignments. A PM raises requests here (via
 * `POST /resources/:id/assignments`) and watches them; an EM decides the ones on
 * their projects.
 */
@Controller('assignment-requests')
@Roles(Role.ADMIN, Role.PM, Role.EM)
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AssignmentRequestQueryDto) {
    return this.assignments.list(user, query);
  }

  /** Badge count: what an EM/Admin must decide, or what a PM is still waiting on. */
  @Get('pending-count')
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.assignments.pendingCount(user);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.findOne(user, id);
  }

  /**
   * Approving is what creates the placement. Restricted to EM/Admin at the guard,
   * and re-checked per project in the service — a PM is never the approver.
   */
  @Post(':id/decision')
  @Roles(Role.ADMIN, Role.EM)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecideAssignmentDto,
  ) {
    return this.assignments.decide(user, id, dto);
  }

  /** Withdraw a request you raised, before anyone acts on it. */
  @Delete(':id')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.assignments.cancel(user, id);
  }
}
