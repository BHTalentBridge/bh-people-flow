import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, LeaveType, NotificationType, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { countLeaveDays, dateOnly } from './leave.constants';
import { CreateLeaveDto, LeaveDecisionDto, LeaveQueryDto } from './dto/leave.dto';
import type { AuthUser } from '../common/types';

const LEAVE_INCLUDE = {
  resource: {
    select: {
      id: true, name: true, employeeCode: true, designation: true, type: true,
      serviceProvider: { select: { id: true, name: true } },
      user: { select: { id: true, avatarColor: true } },
    },
  },
  decidedBy: { select: { id: true, name: true, role: true, avatarColor: true } },
} satisfies Prisma.LeaveRequestInclude;

const LABEL: Record<LeaveType, string> = {
  ANNUAL: 'Annual leave',
  SICK: 'Sick leave',
  CASUAL: 'Casual leave',
  UNPAID: 'Unpaid leave',
  OTHER: 'Leave',
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Leave requests.
 *
 * Two rules define this module, and both are enforced here rather than only at
 * the guard:
 *
 *  - **Only a resource can raise one.** A PM, EM or Admin has no leave to take
 *    in PeopleFlow — `assertCanRequest` rejects them even though they all have
 *    Resource profiles.
 *  - **Only an EM or an Admin can decide one.** Either settles it; the EM must
 *    be on one of the resource's own projects. A PM is never an approver, but
 *    does see leave for people in their scope so it shows up in their planning.
 */
@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Raising
  // -------------------------------------------------------------------------

  /** Leave belongs to resources. Managers don't book it here. */
  private assertCanRequest(user: AuthUser): string {
    if (user.role !== Role.RESOURCE) {
      throw new ForbiddenException(
        'Leave is requested by resources. Managers and Admins do not raise leave in PeopleFlow.',
      );
    }
    if (!user.resourceId) {
      throw new BadRequestException('Your account has no resource profile, so it cannot hold leave.');
    }
    return user.resourceId;
  }

  async create(user: AuthUser, dto: CreateLeaveDto) {
    const resourceId = this.assertCanRequest(user);

    const startDate = dateOnly(dto.startDate);
    const endDate = dateOnly(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('The end date cannot be before the start date.');
    }

    const days = countLeaveDays(startDate, endDate);
    if (days === 0) {
      throw new BadRequestException(
        'That range is all weekend, so there are no working days to book off.',
      );
    }
    if (dto.type === LeaveType.OTHER && !dto.reason?.trim()) {
      throw new BadRequestException('Tell us what this leave is for when the type is "Other".');
    }

    // A day can only be booked once. Anything PENDING or APPROVED already holds
    // the dates; a rejected request doesn't.
    const clash = await this.prisma.leaveRequest.findFirst({
      where: {
        resourceId,
        status: { in: [ApprovalStatus.PENDING, ApprovalStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      orderBy: { startDate: 'asc' },
    });
    if (clash) {
      throw new BadRequestException(
        `This overlaps leave you already have ${clash.status === ApprovalStatus.APPROVED ? 'approved' : 'pending'} for ${iso(clash.startDate)} – ${iso(clash.endDate)}.`,
      );
    }

    const leave = await this.prisma.leaveRequest.create({
      data: {
        resourceId,
        type: dto.type,
        startDate,
        endDate,
        days,
        reason: dto.reason?.trim() || null,
      },
      include: LEAVE_INCLUDE,
    });

    const span = `${iso(startDate)} – ${iso(endDate)}`;
    await this.audit.record({
      actor: user,
      action: 'LEAVE_REQUESTED',
      entityType: 'LeaveRequest',
      entityId: leave.id,
      summary: `Requested ${days} day${days === 1 ? '' : 's'} ${LABEL[dto.type].toLowerCase()} (${span})`,
      after: { type: dto.type, startDate: iso(startDate), endDate: iso(endDate), days, reason: leave.reason },
    });

    const approvers = await this.scope.leaveApprovers(resourceId, user.id);
    await this.notifications.notifyMany(approvers, {
      type: NotificationType.LEAVE_SUBMITTED,
      title: 'Leave request needs a decision',
      body: `${leave.resource.name} requested ${days} day${days === 1 ? '' : 's'} ${LABEL[dto.type].toLowerCase()} (${span}).${leave.reason ? ` "${leave.reason}"` : ''}`,
      link: '/leave?status=PENDING',
    });

    return leave;
  }

  // -------------------------------------------------------------------------
  // Reading
  // -------------------------------------------------------------------------

  private async visibilityWhere(user: AuthUser): Promise<Prisma.LeaveRequestWhereInput> {
    const ids = await this.scope.leaveVisibleResourceIds(user);
    return ids === null ? {} : { resourceId: { in: ids } };
  }

  async list(user: AuthUser, query: LeaveQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);

    const filters: Prisma.LeaveRequestWhereInput[] = [await this.visibilityWhere(user)];
    if (query.status) filters.push({ status: query.status });
    if (query.type) filters.push({ type: query.type });
    if (query.resourceId) filters.push({ resourceId: query.resourceId });
    // A window matches anything overlapping it, not only requests contained by it.
    if (query.to) filters.push({ startDate: { lte: dateOnly(query.to) } });
    if (query.from) filters.push({ endDate: { gte: dateOnly(query.from) } });
    if (query.search) {
      filters.push({
        OR: [
          { resource: { name: { contains: query.search, mode: 'insensitive' } } },
          { resource: { employeeCode: { contains: query.search, mode: 'insensitive' } } },
          { reason: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.LeaveRequestWhereInput = { AND: filters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.leaveRequest.findMany({
        where,
        skip,
        take,
        // Pending first, then soonest — the queue reads as a to-do list.
        orderBy: [{ status: 'asc' }, { startDate: 'desc' }],
        include: LEAVE_INCLUDE,
      }),
      this.prisma.leaveRequest.count({ where }),
    ]);

    // "Can I act on this?" is a server answer, so the UI never offers a button
    // the API would refuse.
    const decidableResources = new Set<string>();
    if (user.role === Role.EM) {
      const mine = await this.scope.managedProjectIds(user);
      const onMine = await this.prisma.resource.findMany({
        where: { assignments: { some: { projectId: { in: mine } } } },
        select: { id: true },
      });
      onMine.forEach((r) => decidableResources.add(r.id));
    }

    const items = rows.map((r) => ({
      ...r,
      canDecide:
        r.status === ApprovalStatus.PENDING &&
        (this.scope.isAdmin(user) || decidableResources.has(r.resourceId)),
      canWithdraw:
        r.status === ApprovalStatus.PENDING &&
        (this.scope.isAdmin(user) || r.resourceId === user.resourceId),
    }));

    return pageResult(items, total, page, pageSize);
  }

  async findOne(user: AuthUser, id: string) {
    const where = await this.visibilityWhere(user);
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { AND: [{ id }, where] },
      include: LEAVE_INCLUDE,
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    return leave;
  }

  /** Badge count: what this person can decide, or what a resource is waiting on. */
  async pendingCount(user: AuthUser) {
    const where = await this.visibilityWhere(user);
    return {
      count: await this.prisma.leaveRequest.count({
        where: { AND: [{ status: ApprovalStatus.PENDING }, where] },
      }),
    };
  }

  /**
   * Headline figures for the page. Days taken counts **approved** leave only,
   * for the calendar year — a pending request hasn't been granted yet.
   */
  async summary(user: AuthUser, year?: number) {
    const y = year ?? new Date().getUTCFullYear();
    const yearStart = new Date(Date.UTC(y, 0, 1));
    const yearEnd = new Date(Date.UTC(y, 11, 31));
    const where = await this.visibilityWhere(user);

    const [byStatus, approvedThisYear, upcoming] = await Promise.all([
      this.prisma.leaveRequest.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { days: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          AND: [
            where,
            { status: ApprovalStatus.APPROVED },
            { startDate: { lte: yearEnd } },
            { endDate: { gte: yearStart } },
          ],
        },
        select: { days: true, type: true, resourceId: true, resource: { select: { name: true } } },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          AND: [where, { status: ApprovalStatus.APPROVED }, { endDate: { gte: dateOnly(new Date()) } }],
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        include: LEAVE_INCLUDE,
      }),
    ]);

    const statusMap = Object.fromEntries(
      byStatus.map((r) => [r.status, { count: r._count._all, days: r._sum.days ?? 0 }]),
    ) as Record<ApprovalStatus, { count: number; days: number }>;

    const byType: Record<string, number> = {};
    const perPerson = new Map<string, { name: string; days: number }>();
    for (const row of approvedThisYear) {
      byType[row.type] = (byType[row.type] ?? 0) + row.days;
      const entry = perPerson.get(row.resourceId) ?? { name: row.resource.name, days: 0 };
      entry.days += row.days;
      perPerson.set(row.resourceId, entry);
    }

    return {
      year: y,
      byStatus: {
        PENDING: statusMap.PENDING ?? { count: 0, days: 0 },
        APPROVED: statusMap.APPROVED ?? { count: 0, days: 0 },
        REJECTED: statusMap.REJECTED ?? { count: 0, days: 0 },
      },
      daysTakenThisYear: approvedThisYear.reduce((n, r) => n + r.days, 0),
      byType,
      topTakers: [...perPerson.entries()]
        .map(([resourceId, v]) => ({ resourceId, ...v }))
        .sort((a, b) => b.days - a.days)
        .slice(0, 5),
      upcoming,
    };
  }

  // -------------------------------------------------------------------------
  // Deciding
  // -------------------------------------------------------------------------

  async decide(user: AuthUser, id: string, dto: LeaveDecisionDto) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`This request was already ${leave.status.toLowerCase()}.`);
    }
    await this.scope.assertCanDecideLeave(user, leave.resourceId);

    const updated = await this.prisma.leaveRequest.update({
      where: { id },
      data: {
        status: dto.status,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: dto.note?.trim() || null,
      },
      include: LEAVE_INCLUDE,
    });

    const approved = dto.status === ApprovalStatus.APPROVED;
    const verb = approved ? 'Approved' : 'Rejected';
    const span = `${iso(leave.startDate)} – ${iso(leave.endDate)}`;

    await this.audit.record({
      actor: user,
      action: approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
      entityType: 'LeaveRequest',
      entityId: id,
      summary: `${verb} ${leave.days} day${leave.days === 1 ? '' : 's'} ${LABEL[leave.type].toLowerCase()} for ${leave.resource.name} (${span})${dto.note ? ` — ${dto.note}` : ''}`,
      before: { status: ApprovalStatus.PENDING },
      after: { status: dto.status, decidedBy: user.name, note: dto.note ?? null },
    });

    // The resource always hears back; without a user account there's nobody to tell.
    if (leave.resource.user?.id) {
      await this.notifications.notify(leave.resource.user.id, {
        type: NotificationType.LEAVE_DECIDED,
        title: `Your leave was ${dto.status.toLowerCase()}`,
        body: `${leave.days} day${leave.days === 1 ? '' : 's'} ${LABEL[leave.type].toLowerCase()} (${span}) — ${verb.toLowerCase()} by ${user.name}.${dto.note ? ` "${dto.note}"` : ''}`,
        link: '/my-leave',
      });
    }

    return updated;
  }

  /** A resource withdrawing their own pending request (or an Admin clearing one). */
  async withdraw(user: AuthUser, id: string) {
    const leave = await this.prisma.leaveRequest.findUnique({
      where: { id },
      include: LEAVE_INCLUDE,
    });
    if (!leave) throw new NotFoundException('Leave request not found.');
    if (leave.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(
        'Only a pending request can be withdrawn. Ask an approver to reject a decided one.',
      );
    }
    if (!this.scope.isAdmin(user) && leave.resourceId !== user.resourceId) {
      throw new ForbiddenException('You can only withdraw your own leave request.');
    }

    await this.prisma.leaveRequest.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'LEAVE_WITHDRAWN',
      entityType: 'LeaveRequest',
      entityId: id,
      summary: `Withdrew the ${LABEL[leave.type].toLowerCase()} request for ${leave.resource.name} (${iso(leave.startDate)} – ${iso(leave.endDate)})`,
      before: { type: leave.type, days: leave.days, status: leave.status },
    });
    return { ok: true };
  }
}
