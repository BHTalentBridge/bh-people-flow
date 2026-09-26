import { Injectable } from '@nestjs/common';
import {
  ApprovalStatus, InvoiceStatus, Prisma, ProjectStatus, ResourceType, Role, TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AttendanceService } from '../attendance/attendance.service';
import { InvoicesService } from '../invoices/invoices.service';
import { TasksService } from '../tasks/tasks.service';
import { dayKey } from '../attendance/attendance.constants';
import type { AuthUser } from '../common/types';

/** Enough of a leave row to render a dashboard line. */
const LEAVE_PANEL_INCLUDE = {
  resource: {
    select: {
      id: true, name: true, employeeCode: true, designation: true,
      user: { select: { id: true, avatarColor: true } },
    },
  },
  decidedBy: { select: { id: true, name: true } },
} satisfies Prisma.LeaveRequestInclude;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly attendance: AttendanceService,
    private readonly invoices: InvoicesService,
    private readonly tasks: TasksService,
  ) {}

  /**
   * One endpoint per role shape. Everything is filtered through ScopeService so a
   * PM's numbers cover their projects only and a Resource sees just their own.
   */
  async overview(user: AuthUser) {
    const base = await this.baseStats(user);

    if (user.role === Role.RESOURCE) {
      return { ...base, ...(await this.resourcePanels(user)) };
    }
    return { ...base, ...(await this.managerPanels(user)) };
  }

  // -------------------------------------------------------------------------
  // Shared: stat cards, structure overview, invoice summary
  // -------------------------------------------------------------------------

  private async baseStats(user: AuthUser) {
    const projectWhere = await this.scope.projectWhere(user);
    const resourceWhere = await this.scope.resourceWhere(user);

    const [projects, resources, taskStats, invoiceSummary] = await Promise.all([
      this.prisma.project.count({ where: projectWhere }),
      this.prisma.resource.count({ where: resourceWhere }),
      this.tasks.stats(user, {}),
      this.invoices.summary(user),
    ]);

    const activeProjects = await this.prisma.project.count({
      where: { AND: [projectWhere, { status: ProjectStatus.ACTIVE }] },
    });

    const structure = await this.prisma.project.findMany({
      where: projectWhere,
      orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
      take: 8,
      select: {
        id: true, name: true, code: true, status: true,
        client: { select: { name: true } },
        _count: { select: { modules: true, tasks: true } },
        assignments: { select: { resource: { select: { id: true, type: true } } } },
      },
    });

    const structureOverview = structure.map((p) => {
      const ids = new Map<string, ResourceType>();
      p.assignments.forEach((a) => ids.set(a.resource.id, a.resource.type));
      const types = [...ids.values()];
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        client: p.client.name,
        moduleCount: p._count.modules,
        taskCount: p._count.tasks,
        headcount: ids.size,
        internal: types.filter((t) => t === ResourceType.SH).length,
        external: types.filter((t) => t === ResourceType.EXTERNAL).length,
      };
    });

    return {
      role: user.role,
      // Manager panel: per-project headcount and internal/external mix. A
      // resource has no business with either — their own project view is
      // GET /projects/mine, and `stats.projects` already gives them the count.
      structureOverview: user.role === Role.RESOURCE ? [] : structureOverview,
      stats: {
        projects,
        activeProjects,
        resources,
        tasks: taskStats.total,
        overdueTasks: taskStats.overdue,
        invoices: invoiceSummary.total,
      },
      taskBreakdown: taskStats.byStatus,
      invoiceSummary,
    };
  }

  // -------------------------------------------------------------------------
  // PM / Admin panels
  // -------------------------------------------------------------------------

  private async managerPanels(user: AuthUser) {
    const scopedUserIds = await this.scope.scopedUserIds(user);
    const resourceWhere = await this.scope.resourceWhere(user);
    const projectWhere = await this.scope.projectWhere(user);

    const [
      pendingOt, pendingInvoices, pendingAssignments, pendingLeave, upcomingLeave,
      snapshot, mix, overdueTasks, recentAudit,
    ] = await Promise.all([
      this.prisma.overtimeRequest.findMany({
        where: {
          status: ApprovalStatus.PENDING,
          attendance: scopedUserIds ? { userId: { in: scopedUserIds } } : {},
        },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          attendance: {
            include: {
              user: {
                select: {
                  id: true, name: true, avatarColor: true,
                  resource: { select: { type: true, serviceProvider: { select: { id: true, name: true } } } },
                },
              },
            },
          },
        },
      }),
      // Only Admins decide invoices, so only they get an approval queue.
      user.role === Role.ADMIN
        ? this.prisma.invoice.findMany({
            where: { status: InvoiceStatus.SUBMITTED },
            orderBy: { submittedAt: 'desc' },
            take: 8,
            include: {
              user: {
                select: {
                  id: true, name: true, role: true, avatarColor: true,
                  resource: { select: { type: true, employeeCode: true } },
                },
              },
            },
          })
        : Promise.resolve([]),
      // Assignment requests: an EM/Admin sees what they must decide, a PM sees
      // what they are still waiting on. Same panel, opposite side of the fence.
      this.pendingAssignments(user),
      // Leave: an EM/Admin decides it, so it belongs in "Needs your action". A
      // PM can't decide it but still needs to know who's away, so everyone in
      // scope gets the upcoming list.
      this.pendingLeave(user),
      this.upcomingLeave(user),
      this.attendance.todaySnapshot(user),
      this.resourceMix(resourceWhere),
      this.prisma.task.findMany({
        where: {
          AND: [
            { project: projectWhere },
            { dueDate: { lt: new Date() } },
            { status: { not: TaskStatus.DONE } },
          ],
        },
        orderBy: { dueDate: 'asc' },
        take: 8,
        include: {
          assignee: { select: { id: true, name: true, avatarColor: true } },
          project: { select: { id: true, name: true, code: true } },
        },
      }),
      this.prisma.auditLog.findMany({
        where: user.role === Role.ADMIN ? {} : { actorId: { in: scopedUserIds ?? [] } },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
    ]);

    return {
      needsAction: {
        pendingOvertime: pendingOt,
        pendingInvoices,
        pendingAssignments,
        pendingLeave,
        // A PM's waiting requests aren't theirs to act on, and leave is never
        // theirs to decide, so neither counts towards "needs your action" —
        // they're shown as status, not a to-do.
        totalPending:
          pendingOt.length +
          pendingInvoices.length +
          (user.role === Role.PM ? 0 : pendingAssignments.length + pendingLeave.length),
      },
      attendanceToday: {
        date: snapshot.date,
        checkedIn: snapshot.checkedIn.length,
        completed: snapshot.completed.length,
        onOvertime: snapshot.onOvertime.length,
        people: snapshot.checkedIn.slice(0, 10),
      },
      resourceMix: mix,
      upcomingLeave,
      overdueTasks,
      recentActivity: recentAudit,
    };
  }

  /** Leave awaiting a decision. Only an EM or Admin can act, so only they get rows. */
  private async pendingLeave(user: AuthUser) {
    if (user.role !== Role.EM && user.role !== Role.ADMIN) return [];
    const ids = await this.scope.leaveVisibleResourceIds(user);
    return this.prisma.leaveRequest.findMany({
      where: {
        AND: [{ status: ApprovalStatus.PENDING }, ids === null ? {} : { resourceId: { in: ids } }],
      },
      orderBy: { startDate: 'asc' },
      take: 8,
      include: LEAVE_PANEL_INCLUDE,
    });
  }

  /** Who's away next, for anyone who plans work: PM, EM and Admin alike. */
  private async upcomingLeave(user: AuthUser) {
    const ids = await this.scope.leaveVisibleResourceIds(user);
    const today = new Date();
    return this.prisma.leaveRequest.findMany({
      where: {
        AND: [
          { status: ApprovalStatus.APPROVED },
          { endDate: { gte: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) } },
          ids === null ? {} : { resourceId: { in: ids } },
        ],
      },
      orderBy: { startDate: 'asc' },
      take: 6,
      include: LEAVE_PANEL_INCLUDE,
    });
  }

  /**
   * Pending assignment requests for the dashboard panel. An EM sees the ones on
   * their projects, an Admin sees all, a PM sees the ones they raised.
   */
  private async pendingAssignments(user: AuthUser) {
    const where: Prisma.AssignmentRequestWhereInput = { status: ApprovalStatus.PENDING };

    if (user.role === Role.PM) {
      where.requestedById = user.id;
    } else if (user.role === Role.EM) {
      where.projectId = { in: await this.scope.managedProjectIds(user) };
    } else if (user.role !== Role.ADMIN) {
      return [];
    }

    return this.prisma.assignmentRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: {
        resource: {
          select: {
            id: true, name: true, employeeCode: true, designation: true, type: true,
            serviceProvider: { select: { id: true, name: true } },
          },
        },
        project: { select: { id: true, name: true, code: true } },
        module: { select: { id: true, name: true } },
        subModule: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true, role: true, avatarColor: true } },
      },
    });
  }

  private async resourceMix(where: Prisma.ResourceWhereInput) {
    const rows = await this.prisma.resource.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });
    // Headcount per service provider, straight off the relation.
    const byServiceProvider = await this.prisma.serviceProvider.findMany({
      where: { resources: { some: where } },
      select: { id: true, name: true, _count: { select: { resources: { where } } } },
    });
    return {
      internal: rows.find((r) => r.type === ResourceType.SH)?._count._all ?? 0,
      external: rows.find((r) => r.type === ResourceType.EXTERNAL)?._count._all ?? 0,
      serviceProviders: byServiceProvider
        .map((p) => ({ id: p.id, company: p.name, count: p._count.resources }))
        .filter((p) => p.count > 0)
        .sort((a, b) => b.count - a.count),
    };
  }

  // -------------------------------------------------------------------------
  // Resource panels
  // -------------------------------------------------------------------------

  private async resourcePanels(user: AuthUser) {
    const today = await this.attendance.today(user);
    const monthStart = new Date();
    monthStart.setDate(1);

    const [monthAgg, approvedOt, myTasks, recentAttendance, myInvoices, myLeave] = await Promise.all([
      this.prisma.attendance.aggregate({
        where: { userId: user.id, date: { gte: dayKey(monthStart) } },
        _sum: { workMinutes: true, otMinutes: true },
        _count: true,
      }),
      this.prisma.overtimeRequest.aggregate({
        where: {
          status: ApprovalStatus.APPROVED,
          attendance: { userId: user.id, date: { gte: dayKey(monthStart) } },
        },
        _sum: { minutes: true },
      }),
      this.prisma.task.findMany({
        where: { assigneeId: user.id, status: { not: TaskStatus.DONE } },
        orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { priority: 'desc' }],
        take: 8,
        include: {
          project: { select: { id: true, name: true, code: true } },
          module: { select: { id: true, name: true } },
        },
      }),
      this.prisma.attendance.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: 7,
        include: { overtimeRequest: true },
      }),
      this.prisma.invoice.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, invoiceNumber: true, status: true, total: true,
          invoiceDate: true, periodFrom: true, periodTo: true,
        },
      }),
      // Their own leave: everything pending, plus anything approved still ahead
      // of them. Past approved leave is history and lives on the Leave screen.
      user.resourceId
        ? this.prisma.leaveRequest.findMany({
            where: {
              resourceId: user.resourceId,
              OR: [
                { status: ApprovalStatus.PENDING },
                {
                  status: ApprovalStatus.APPROVED,
                  endDate: { gte: new Date(new Date().toISOString().slice(0, 10)) },
                },
              ],
            },
            orderBy: { startDate: 'asc' },
            take: 6,
            include: LEAVE_PANEL_INCLUDE,
          })
        : Promise.resolve([]),
    ]);

    const resource = user.resourceId
      ? await this.prisma.resource.findUnique({
          where: { id: user.resourceId },
          select: {
            id: true, name: true, type: true, serviceProvider: { select: { id: true, name: true } }, designation: true, employeeCode: true,
            assignments: {
              include: {
                project: { select: { id: true, name: true, code: true, status: true } },
                module: { select: { id: true, name: true } },
                subModule: { select: { id: true, name: true } },
              },
            },
          },
        })
      : null;

    return {
      myLeave,
      profile: resource,
      // Invoicing is hidden entirely for External resources.
      canInvoice: resource?.type === ResourceType.SH,
      todayAttendance: today,
      monthToDate: {
        days: monthAgg._count,
        workMinutes: monthAgg._sum.workMinutes ?? 0,
        otMinutes: monthAgg._sum.otMinutes ?? 0,
        approvedOtMinutes: approvedOt._sum.minutes ?? 0,
      },
      myTasks,
      recentAttendance,
      myInvoices,
    };
  }
}
