import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { dayKey } from './attendance.constants';
import { buildAttendanceWorkbook } from './attendance-export';
import {
  AdjustAttendanceDto, AttendanceQueryDto, CheckInDto, CheckOutDto,
  OvertimeDecisionDto, OvertimeQueryDto,
} from './dto/attendance.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // Every role clocks in and out.
  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendance.today(user);
  }

  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUser, @Body() dto: CheckInDto) {
    return this.attendance.checkIn(user, dto);
  }

  @Post('check-out')
  checkOut(@CurrentUser() user: AuthUser, @Body() dto: CheckOutDto) {
    return this.attendance.checkOut(user, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    return this.attendance.list(user, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    return this.attendance.summary(user, query);
  }

  /** Excel export of the current view — same filters, same scoping, no paging. */
  @Get('export')
  async exportXlsx(
    @CurrentUser() user: AuthUser,
    @Query() query: AttendanceQueryDto,
    @Res() res: Response,
  ) {
    // A timesheet covers a period, so one is always resolved. Without From/To
    // that's the current month — a timesheet is a monthly document — and the
    // same window bounds the query, so the sheet and its rows can't disagree.
    const today = new Date();
    const from = query.from
      ? dayKey(new Date(query.from))
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const to = query.to
      ? dayKey(new Date(query.to))
      : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));

    const scoped = { ...query, from: from.toISOString(), to: to.toISOString() };
    const rows = await this.attendance.exportRows(user, scoped);

    // When the export is for one named person, give them a tab even if they
    // logged nothing — "I recorded nothing this month" is a real answer.
    const alwaysInclude = query.userId
      ? await this.attendance.exportSubjects(user, query.userId)
      : [];

    const filters = Object.entries({
      from: query.from, to: query.to, name: query.search,
      project: query.projectId, person: query.userId, otStatus: query.otStatus,
    })
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    const wb = await buildAttendanceWorkbook(rows as any, {
      generatedBy: `${user.name} (${user.role})`,
      filters,
      from,
      to,
      alwaysInclude,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="timesheet-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }

  @Get('snapshot')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  snapshot(@CurrentUser() user: AuthUser) {
    return this.attendance.todaySnapshot(user);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  adjust(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AdjustAttendanceDto) {
    return this.attendance.adjust(user, id, dto);
  }

  // --- Overtime -------------------------------------------------------------

  /** Resources see their own OT history here; PM/Admin see their approval queue. */
  @Get('overtime/list')
  listOvertime(@CurrentUser() user: AuthUser, @Query() query: OvertimeQueryDto) {
    return this.attendance.listOvertime(user, query);
  }

  @Get('overtime/pending-count')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.attendance.pendingOvertimeCount(user).then((count) => ({ count }));
  }

  @Post('overtime/:id/decision')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: OvertimeDecisionDto) {
    return this.attendance.decideOvertime(user, id, dto);
  }
}
