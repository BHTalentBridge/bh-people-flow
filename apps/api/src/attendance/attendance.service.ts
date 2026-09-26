import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalStatus, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import {
  AdjustAttendanceDto, AttendanceQueryDto, CheckInDto, CheckOutDto,
  OvertimeDecisionDto, OvertimeQueryDto,
} from './dto/attendance.dto';
import { computeShift, dayKey, formatDuration, DEFAULT_BREAK_MINUTES } from './attendance.constants';
import type { AuthUser } from '../common/types';

const USER_SELECT = {
  id: true, name: true, email: true, role: true, avatarColor: true,
  resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } }, designation: true } },
};

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Check in / out — available to every role.
  // -------------------------------------------------------------------------

  /**
   * Admins oversee attendance rather than record it, so they have no shift to
   * clock. Everyone else — PMs included — checks in and out.
   */
  private assertCanClock(user: AuthUser) {
    if (user.role === Role.ADMIN) {
      throw new ForbiddenException(
        'Administrators do not record attendance. Use the daily log to review everyone else.',
      );
    }
  }

  /** The caller's open or completed shift for today, or null before check-in. */
  async today(user: AuthUser) {
    if (user.role === Role.ADMIN) return null;
    const record = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date: dayKey(new Date()) } },
      include: { overtimeRequest: { include: { decidedBy: { select: { id: true, name: true } } } } },
    });
    return record ?? null;
  }

  async checkIn(user: AuthUser, dto: CheckInDto) {
    this.assertCanClock(user);
    // Back-dating is a correction tool — Resources always clock in at "now".
    const at = dto.at && user.role !== Role.RESOURCE ? new Date(dto.at) : new Date();
    const date = dayKey(at);

    const existing = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (existing) {
      throw new BadRequestException(
        existing.checkOutAt
          ? 'You have already completed today’s shift.'
          : 'You are already checked in.',
      );
    }

    const record = await this.prisma.attendance.create({
      data: { userId: user.id, date, checkInAt: at, note: dto.note, breakMinutes: 0 },
      include: { overtimeRequest: true },
    });

    await this.audit.record({
      actor: user,
      action: 'ATTENDANCE_CHECK_IN',
      entityType: 'Attendance',
      entityId: record.id,
      summary: `${user.name} checked in`,
      after: { checkInAt: at.toISOString() },
    });
    return record;
  }

  async checkOut(user: AuthUser, dto: CheckOutDto) {
    this.assertCanClock(user);
    const at = dto.at && user.role !== Role.RESOURCE ? new Date(dto.at) : new Date();
    const date = dayKey(at);

    const record = await this.prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });
    if (!record) throw new BadRequestException('You have not checked in today.');
    if (record.checkOutAt) throw new BadRequestException('You have already checked out today.');
    if (at.getTime() <= record.checkInAt.getTime()) {
      throw new BadRequestException('Check-out must be after check-in.');
    }

    const totals = computeShift(record.checkInAt, at, DEFAULT_BREAK_MINUTES);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.attendance.update({
        where: { id: record.id },
        data: {
          checkOutAt: at,
          breakMinutes: totals.breakMinutes,
          workMinutes: totals.workMinutes,
          otMinutes: totals.otMinutes,
          ...(dto.note ? { note: dto.note } : {}),
        },
      });

      // Overtime is only "logged" once a PM or Admin approves it.
      if (totals.otMinutes > 0) {
        await tx.overtimeRequest.create({
          data: {
            attendanceId: saved.id,
            minutes: totals.otMinutes,
            reason: dto.otReason,
            status: ApprovalStatus.PENDING,
          },
        });
      }

      return tx.attendance.findUniqueOrThrow({
        where: { id: saved.id },
        include: { overtimeRequest: true },
      });
    });

    await this.audit.record({
      actor: user,
      action: 'ATTENDANCE_CHECK_OUT',
      entityType: 'Attendance',
      entityId: updated.id,
      summary: `${user.name} checked out — ${formatDuration(totals.workMinutes)} worked${
        totals.otMinutes ? `, ${formatDuration(totals.otMinutes)} OT raised for approval` : ''
      }`,
      before: { checkInAt: record.checkInAt.toISOString() },
      after: {
        checkOutAt: at.toISOString(),
        workMinutes: totals.workMinutes,
        otMinutes: totals.otMinutes,
      },
    });

    if (totals.otMinutes > 0) {
      const approvers = await this.scope.approversForUser(user.id);
      await this.notifications.notifyMany(approvers, {
        type: NotificationType.OT_SUBMITTED,
        title: `${user.name} logged ${formatDuration(totals.otMinutes)} overtime`,
        body: dto.otReason ?? 'Awaiting your approval.',
        link: '/attendance?tab=overtime&status=PENDING',
      });
    }

    return updated;
  }

  // -------------------------------------------------------------------------
  // Listing
  // -------------------------------------------------------------------------

  async list(user: AuthUser, query: AttendanceQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = await this.buildWhere(user, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where, skip, take,
        orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
        include: {
          user: { select: USER_SELECT },
          overtimeRequest: { include: { decidedBy: { select: { id: true, name: true } } } },
        },
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  /** Roll-up beside the attendance table: totals for the current filter window. */
  async summary(user: AuthUser, query: AttendanceQueryDto) {
    const where = await this.buildWhere(user, query);
    const [agg, otPending, otApproved, present] = await this.prisma.$transaction([
      this.prisma.attendance.aggregate({
        where,
        _sum: { workMinutes: true, otMinutes: true },
        _count: true,
      }),
      this.prisma.overtimeRequest.count({ where: { attendance: where, status: ApprovalStatus.PENDING } }),
      this.prisma.overtimeRequest.aggregate({
        where: { attendance: where, status: ApprovalStatus.APPROVED },
        _sum: { minutes: true },
      }),
      this.prisma.attendance.count({ where: { ...where, checkOutAt: null } }),
    ]);

    const workMinutes = agg._sum.workMinutes ?? 0;
    const otMinutes = agg._sum.otMinutes ?? 0;
    return {
      days: agg._count,
      workMinutes,
      otMinutes,
      // Break is already excluded from both, so this is payable time.
      totalMinutes: workMinutes + otMinutes,
      approvedOtMinutes: otApproved._sum.minutes ?? 0,
      pendingOtCount: otPending,
      currentlyCheckedIn: present,
    };
  }

  /** Who is on the clock right now — powers the PM/Admin "today" snapshot. */
  async todaySnapshot(user: AuthUser) {
    const date = dayKey(new Date());
    const userIds = await this.scope.scopedUserIds(user);
    const where: Prisma.AttendanceWhereInput = {
      date,
      ...(userIds ? { userId: { in: userIds } } : {}),
    };

    const records = await this.prisma.attendance.findMany({
      where,
      include: { user: { select: USER_SELECT }, overtimeRequest: true },
      orderBy: { checkInAt: 'asc' },
    });

    return {
      date,
      checkedIn: records.filter((r) => !r.checkOutAt),
      completed: records.filter((r) => r.checkOutAt),
      onOvertime: records.filter((r) => r.otMinutes > 0),
    };
  }

  async adjust(user: AuthUser, id: string, dto: AdjustAttendanceDto) {
    if (user.role === Role.RESOURCE) {
      throw new ForbiddenException('Only Admins and PMs can correct attendance records.');
    }
    const record = await this.prisma.attendance.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true } }, overtimeRequest: true },
    });
    if (!record) throw new NotFoundException('Attendance record not found.');
    await this.assertUserInScope(user, record.userId);

    const checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : record.checkInAt;
    const checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : record.checkOutAt;
    const policyBreak = dto.breakMinutes ?? DEFAULT_BREAK_MINUTES;
    if (checkOutAt && checkOutAt.getTime() <= checkInAt.getTime()) {
      throw new BadRequestException('Check-out must be after check-in.');
    }

    const totals = checkOutAt
      ? computeShift(checkInAt, checkOutAt, policyBreak)
      : { breakMinutes: 0, workMinutes: 0, otMinutes: 0 };

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.attendance.update({
        where: { id },
        data: {
          checkInAt,
          checkOutAt,
          breakMinutes: totals.breakMinutes,
          workMinutes: totals.workMinutes,
          otMinutes: totals.otMinutes,
          ...(dto.note !== undefined ? { note: dto.note } : {}),
        },
      });

      // Keep the OT request in step with the corrected totals.
      if (totals.otMinutes > 0) {
        await tx.overtimeRequest.upsert({
          where: { attendanceId: id },
          create: { attendanceId: id, minutes: totals.otMinutes },
          update: { minutes: totals.otMinutes },
        });
      } else if (record.overtimeRequest) {
        await tx.overtimeRequest.delete({ where: { attendanceId: id } });
      }

      return tx.attendance.findUniqueOrThrow({
        where: { id: saved.id },
        include: { user: { select: USER_SELECT }, overtimeRequest: true },
      });
    });

    await this.audit.record({
      actor: user,
      action: 'ATTENDANCE_ADJUSTED',
      entityType: 'Attendance',
      entityId: id,
      summary: `Corrected ${record.user.name}'s attendance — now ${formatDuration(totals.workMinutes)} work, ${formatDuration(totals.otMinutes)} OT`,
      before: {
        checkInAt: record.checkInAt.toISOString(),
        checkOutAt: record.checkOutAt?.toISOString() ?? null,
        workMinutes: record.workMinutes,
        otMinutes: record.otMinutes,
      },
      after: {
        checkInAt: checkInAt.toISOString(),
        checkOutAt: checkOutAt?.toISOString() ?? null,
        workMinutes: totals.workMinutes,
        otMinutes: totals.otMinutes,
      },
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Overtime approvals
  // -------------------------------------------------------------------------

  async listOvertime(user: AuthUser, query: OvertimeQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const userIds = await this.scope.scopedUserIds(user);

    const where: Prisma.OvertimeRequestWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      attendance: {
        ...(userIds ? { userId: { in: userIds } } : {}),
        ...(query.userId ? { userId: query.userId } : {}),
        ...(query.search
          ? { user: { name: { contains: query.search, mode: 'insensitive' } } }
          : {}),
        ...(query.from || query.to
          ? {
              date: {
                ...(query.from ? { gte: dayKey(new Date(query.from)) } : {}),
                ...(query.to ? { lte: dayKey(new Date(query.to)) } : {}),
              },
            }
          : {}),
      },
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.overtimeRequest.findMany({
        where, skip, take,
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: {
          attendance: { include: { user: { select: USER_SELECT } } },
          decidedBy: { select: { id: true, name: true, role: true } },
        },
      }),
      this.prisma.overtimeRequest.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async decideOvertime(user: AuthUser, id: string, dto: OvertimeDecisionDto) {
    if (user.role === Role.RESOURCE) {
      throw new ForbiddenException('Only Admins, PMs and EMs can decide overtime.');
    }
    if (dto.status === ApprovalStatus.PENDING) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }

    const request = await this.prisma.overtimeRequest.findUnique({
      where: { id },
      include: { attendance: { include: { user: { select: { id: true, name: true } } } } },
    });
    if (!request) throw new NotFoundException('Overtime request not found.');
    if (request.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`This request was already ${request.status.toLowerCase()}.`);
    }
    await this.assertUserInScope(user, request.attendance.userId);

    const updated = await this.prisma.overtimeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: dto.note,
      },
      include: {
        attendance: { include: { user: { select: USER_SELECT } } },
        decidedBy: { select: { id: true, name: true, role: true } },
      },
    });

    const verb = dto.status === ApprovalStatus.APPROVED ? 'Approved' : 'Rejected';
    await this.audit.record({
      actor: user,
      action: dto.status === ApprovalStatus.APPROVED ? 'OT_APPROVED' : 'OT_REJECTED',
      entityType: 'OvertimeRequest',
      entityId: id,
      summary: `${verb} ${formatDuration(request.minutes)} overtime for ${request.attendance.user.name}`,
      before: { status: ApprovalStatus.PENDING, minutes: request.minutes },
      after: { status: dto.status, minutes: request.minutes, decidedBy: user.name, note: dto.note ?? null },
    });

    await this.notifications.notify(request.attendance.userId, {
      type: NotificationType.OT_DECIDED,
      title: `Your overtime was ${dto.status.toLowerCase()}`,
      body: `${formatDuration(request.minutes)} on ${request.attendance.date.toISOString().slice(0, 10)} — ${verb.toLowerCase()} by ${user.name}.${dto.note ? ` "${dto.note}"` : ''}`,
      link: '/my-attendance',
    });

    return updated;
  }

  async pendingOvertimeCount(user: AuthUser) {
    const userIds = await this.scope.scopedUserIds(user);
    return this.prisma.overtimeRequest.count({
      where: {
        status: ApprovalStatus.PENDING,
        attendance: userIds ? { userId: { in: userIds } } : {},
      },
    });
  }

  // -------------------------------------------------------------------------

  /**
   * Rows for the Excel export: the same filters and scoping as the table, just
   * without pagination. Capped so a wide date range can't stream forever.
   */
  /**
   * The person a single-person export is *about*, so a timesheet can still be
   * produced for a month in which they recorded nothing. Scope is re-checked:
   * asking for someone outside it returns nobody rather than leaking a name.
   */
  async exportSubjects(user: AuthUser, userId: string) {
    const scopedIds = await this.scope.scopedUserIds(user);
    if (scopedIds && !scopedIds.includes(userId)) return [];
    const found = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, resource: await this.exportProfileSelect(user) },
    });
    return found ? [found] : [];
  }

  /**
   * The resource fields the roster sheet reads, shared by `exportRows` and
   * `exportSubjects` so a person listed only because of a `userId` filter
   * carries the same profile as everyone else.
   *
   * Placements are filtered through the caller's project scope: a PM must not
   * learn, from a Project column, that one of their people also sits on a
   * project they cannot see.
   */
  private async exportProfileSelect(user: AuthUser) {
    const projectWhere = await this.scope.projectWhere(user);
    return {
      select: {
        employeeCode: true,
        designation: true,
        jobFunction: true,
        type: true,
        internalSeniority: true,
        serviceProvider: { select: { name: true } },
        assignments: {
          where: { project: projectWhere },
          select: {
            roleOnProject: true,
            project: { select: { name: true, code: true, client: { select: { name: true } } } },
          },
          orderBy: { project: { name: 'asc' as const } },
        },
      },
    };
  }

  async exportRows(user: AuthUser, query: AttendanceQueryDto) {
    const where = await this.buildWhere(user, query);
    const profile = await this.exportProfileSelect(user);
    return this.prisma.attendance.findMany({
      where,
      orderBy: [{ date: 'desc' }, { checkInAt: 'desc' }],
      take: 5000,
      include: {
        user: {
          select: {
            id: true, name: true, email: true, role: true,
            resource: profile,
          },
        },
        overtimeRequest: { include: { decidedBy: { select: { name: true } } } },
      },
    });
  }

  private async buildWhere(user: AuthUser, query: AttendanceQueryDto): Promise<Prisma.AttendanceWhereInput> {
    const filters: Prisma.AttendanceWhereInput[] = [];

    const scopedIds = await this.scope.scopedUserIds(user);
    if (scopedIds) filters.push({ userId: { in: scopedIds } });

    if (query.userId) filters.push({ userId: query.userId });
    if (query.resourceId) filters.push({ user: { resource: { id: query.resourceId } } });
    if (query.projectId) {
      filters.push({
        user: { resource: { assignments: { some: { projectId: query.projectId } } } },
      });
    }
    if (query.from || query.to) {
      filters.push({
        date: {
          ...(query.from ? { gte: dayKey(new Date(query.from)) } : {}),
          ...(query.to ? { lte: dayKey(new Date(query.to)) } : {}),
        },
      });
    }
    if (query.otStatus) filters.push({ overtimeRequest: { status: query.otStatus } });
    if (query.search) {
      filters.push({ user: { name: { contains: query.search, mode: 'insensitive' } } });
    }

    return filters.length ? { AND: filters } : {};
  }

  private async assertUserInScope(user: AuthUser, targetUserId: string) {
    if (user.role === Role.ADMIN || targetUserId === user.id) return;
    const scoped = await this.scope.scopedUserIds(user);
    if (scoped && !scoped.includes(targetUserId)) {
      throw new ForbiddenException('That person is outside your scope.');
    }
  }
}
