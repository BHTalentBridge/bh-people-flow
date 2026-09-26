import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, Role, TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { CreateTaskDto, TaskQueryDto, UpdateTaskDto, UpdateTaskStatusDto } from './dto/task.dto';
import type { AuthUser } from '../common/types';

const TASK_INCLUDE = {
  project: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
  module: { select: { id: true, name: true } },
  subModule: { select: { id: true, name: true } },
  assignee: {
    select: {
      id: true, name: true, email: true, role: true, avatarColor: true,
      resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } } } },
    },
  },
  createdBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Rows for the Excel export: the same `buildWhere` scoping and the same
   * ordering as the list, just unpaged. Capped so one click can't try to
   * stream the entire table.
   */
  async exportRows(user: AuthUser, query: TaskQueryDto) {
    const where = await this.buildWhere(user, query);
    return this.prisma.task.findMany({
      where,
      orderBy: this.orderBy(query),
      take: 5000,
      include: TASK_INCLUDE,
    });
  }

  async list(user: AuthUser, query: TaskQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = await this.buildWhere(user, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.task.findMany({
        where, skip, take,
        orderBy: this.orderBy(query),
        include: TASK_INCLUDE,
      }),
      this.prisma.task.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  /** Counts per status + overdue, for the board header and dashboards. */
  async stats(user: AuthUser, query: TaskQueryDto) {
    const where = await this.buildWhere(user, { ...query, status: undefined, overdue: false });
    const grouped = await this.prisma.task.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });
    const overdue = await this.prisma.task.count({
      where: { AND: [where, { dueDate: { lt: new Date() } }, { status: { not: TaskStatus.DONE } }] },
    });

    const byStatus = Object.fromEntries(
      Object.values(TaskStatus).map((s) => [
        s,
        grouped.find((g) => g.status === s)?._count._all ?? 0,
      ]),
    ) as Record<TaskStatus, number>;

    return {
      byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      overdue,
    };
  }

  async findOne(user: AuthUser, id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) throw new NotFoundException('Task not found.');
    await this.assertCanRead(user, task);
    const history = await this.audit.forEntity('Task', id);
    return { ...task, history };
  }

  async create(user: AuthUser, dto: CreateTaskDto) {
    const assigneeId = dto.assigneeId ?? user.id;
    await this.assertCanAssign(user, assigneeId, dto.projectId);
    await this.assertModuleBelongs(dto.projectId, dto.moduleId, dto.subModuleId);

    const task = await this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description,
        projectId: dto.projectId,
        moduleId: dto.moduleId ?? null,
        subModuleId: dto.subModuleId ?? null,
        assigneeId,
        createdById: user.id,
        status: dto.status ?? TaskStatus.TODO,
        priority: dto.priority ?? 'MEDIUM',
        severity: dto.severity ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        ticketId: dto.ticketId?.trim() || null,
        ticketUrl: dto.ticketUrl?.trim() || null,
        mrUrl: dto.mrUrl?.trim() || null,
        mrTitle: dto.mrTitle?.trim() || null,
        completedAt: dto.status === TaskStatus.DONE ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });

    await this.audit.record({
      actor: user,
      action: 'TASK_CREATED',
      entityType: 'Task',
      entityId: task.id,
      summary: `Created "${task.title}" for ${task.assignee.name} on ${task.project.name}`,
      after: {
        title: task.title, status: task.status, priority: task.priority, severity: task.severity,
        assignee: task.assignee.name, ticketId: task.ticketId,
      },
    });

    if (assigneeId !== user.id) {
      await this.notifications.notify(assigneeId, {
        type: NotificationType.TASK_ASSIGNED,
        title: `${user.name} assigned you a task`,
        body: task.title,
        link: `/tasks?taskId=${task.id}`,
      });
    }
    return task;
  }

  async update(user: AuthUser, id: string, dto: UpdateTaskDto) {
    const existing = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!existing) throw new NotFoundException('Task not found.');
    await this.assertCanWrite(user, existing);

    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId) {
      await this.assertCanAssign(user, dto.assigneeId, existing.projectId);
    }
    if (dto.moduleId !== undefined || dto.subModuleId !== undefined) {
      await this.assertModuleBelongs(
        existing.projectId,
        dto.moduleId ?? existing.moduleId ?? undefined,
        dto.subModuleId ?? existing.subModuleId ?? undefined,
      );
    }

    const statusChanged = dto.status !== undefined && dto.status !== existing.status;

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.moduleId !== undefined ? { moduleId: dto.moduleId || null } : {}),
        ...(dto.subModuleId !== undefined ? { subModuleId: dto.subModuleId || null } : {}),
        ...(dto.assigneeId !== undefined ? { assigneeId: dto.assigneeId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.ticketId !== undefined ? { ticketId: dto.ticketId?.trim() || null } : {}),
        ...(dto.ticketUrl !== undefined ? { ticketUrl: dto.ticketUrl?.trim() || null } : {}),
        ...(dto.mrUrl !== undefined ? { mrUrl: dto.mrUrl?.trim() || null } : {}),
        ...(dto.mrTitle !== undefined ? { mrTitle: dto.mrTitle?.trim() || null } : {}),
        ...(statusChanged
          ? { completedAt: dto.status === TaskStatus.DONE ? new Date() : null }
          : {}),
      },
      include: TASK_INCLUDE,
    });

    // Status transitions get their own audit entry — that's the trail the brief asks for.
    if (statusChanged) {
      await this.audit.record({
        actor: user,
        action: 'TASK_STATUS_CHANGED',
        entityType: 'Task',
        entityId: id,
        summary: `Moved "${task.title}" from ${existing.status} to ${task.status}`,
        before: { status: existing.status },
        after: { status: task.status },
      });
    }

    await this.audit.record({
      actor: user,
      action: 'TASK_UPDATED',
      entityType: 'Task',
      entityId: id,
      summary: `Updated "${task.title}"`,
      before: {
        title: existing.title, priority: existing.priority, severity: existing.severity,
        assignee: existing.assignee.name, dueDate: existing.dueDate?.toISOString() ?? null,
        ticketId: existing.ticketId, mrUrl: existing.mrUrl,
      },
      after: {
        title: task.title, priority: task.priority, severity: task.severity,
        assignee: task.assignee.name, dueDate: task.dueDate?.toISOString() ?? null,
        ticketId: task.ticketId, mrUrl: task.mrUrl,
      },
    });

    if (dto.assigneeId && dto.assigneeId !== existing.assigneeId && dto.assigneeId !== user.id) {
      await this.notifications.notify(dto.assigneeId, {
        type: NotificationType.TASK_ASSIGNED,
        title: `${user.name} assigned you a task`,
        body: task.title,
        link: `/tasks?taskId=${task.id}`,
      });
    }
    return task;
  }

  /** Dedicated endpoint for the board's drag/dropdown status moves. */
  async changeStatus(user: AuthUser, id: string, dto: UpdateTaskStatusDto) {
    const existing = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!existing) throw new NotFoundException('Task not found.');
    await this.assertCanWrite(user, existing);

    if (existing.status === dto.status) return existing;

    const task = await this.prisma.task.update({
      where: { id },
      data: {
        status: dto.status,
        completedAt: dto.status === TaskStatus.DONE ? new Date() : null,
      },
      include: TASK_INCLUDE,
    });

    await this.audit.record({
      actor: user,
      action: 'TASK_STATUS_CHANGED',
      entityType: 'Task',
      entityId: id,
      summary: `Moved "${task.title}" from ${existing.status} to ${task.status}${
        dto.note ? ` — ${dto.note}` : ''
      }`,
      before: { status: existing.status },
      after: { status: task.status, note: dto.note ?? null },
    });
    return task;
  }

  async remove(user: AuthUser, id: string) {
    const task = await this.prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
    if (!task) throw new NotFoundException('Task not found.');
    await this.assertCanWrite(user, task);

    await this.prisma.task.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'TASK_DELETED',
      entityType: 'Task',
      entityId: id,
      summary: `Deleted "${task.title}"`,
      before: { title: task.title, status: task.status, assignee: task.assignee.name },
    });
    return { ok: true };
  }

  /** Users a task may be assigned to, honouring the caller's scope. */
  async assigneeOptions(user: AuthUser, projectId?: string) {
    if (user.role === Role.RESOURCE) {
      return [{ id: user.id, name: user.name, email: user.email, role: user.role, avatarColor: null }];
    }
    const scopedIds = await this.scope.scopedUserIds(user);
    const where: Prisma.UserWhereInput = {
      isActive: true,
      ...(scopedIds ? { id: { in: scopedIds } } : {}),
      ...(projectId
        ? {
            OR: [
              { resource: { assignments: { some: { projectId } } } },
              { managedProjects: { some: { projectId } } },
              { engineeredProjects: { some: { projectId } } },
              { role: Role.ADMIN },
            ],
          }
        : {}),
    };
    return this.prisma.user.findMany({
      where,
      select: {
        id: true, name: true, email: true, role: true, avatarColor: true,
        resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } }, designation: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // -------------------------------------------------------------------------
  // Permission helpers
  // -------------------------------------------------------------------------

  private async assertCanRead(user: AuthUser, task: { assigneeId: string; createdById: string; projectId: string }) {
    if (user.role === Role.ADMIN) return;
    if (task.assigneeId === user.id || task.createdById === user.id) return;
    if (user.role === Role.RESOURCE) throw new ForbiddenException('You can only view your own tasks.');
    await this.scope.assertProjectAccess(user, task.projectId);
  }

  private async assertCanWrite(user: AuthUser, task: { assigneeId: string; createdById: string; projectId: string }) {
    if (user.role === Role.ADMIN) return;
    // A resource may always update their own task (status, notes, MR link).
    if (task.assigneeId === user.id || task.createdById === user.id) return;
    if (user.role === Role.RESOURCE) throw new ForbiddenException('You can only change your own tasks.');
    await this.scope.assertProjectWrite(user, task.projectId);
  }

  /**
   * Admin → anyone. PM → only resources on their own projects. Resource → self only.
   */
  private async assertCanAssign(user: AuthUser, assigneeId: string, projectId: string) {
    if (user.role === Role.ADMIN) return;

    if (user.role === Role.RESOURCE) {
      if (assigneeId !== user.id) {
        throw new ForbiddenException('You can only create tasks for yourself.');
      }
      const projects = await this.scope.managedProjectIds(user);
      if (!projects.includes(projectId)) {
        throw new ForbiddenException('You can only add tasks on projects you are assigned to.');
      }
      return;
    }

    // PM
    await this.scope.assertProjectAccess(user, projectId);
    if (assigneeId === user.id) return;
    const scopedIds = await this.scope.scopedUserIds(user);
    if (scopedIds && !scopedIds.includes(assigneeId)) {
      throw new ForbiddenException('You can only assign tasks to resources on your own projects.');
    }
  }

  private async assertModuleBelongs(projectId: string, moduleId?: string, subModuleId?: string) {
    if (subModuleId && !moduleId) {
      throw new BadRequestException('Pick the parent module for this sub-module.');
    }
    if (moduleId) {
      const module = await this.prisma.module.findUnique({ where: { id: moduleId } });
      if (!module || module.projectId !== projectId) {
        throw new BadRequestException('That module does not belong to the selected project.');
      }
    }
    if (subModuleId) {
      const sub = await this.prisma.subModule.findUnique({ where: { id: subModuleId } });
      if (!sub || sub.moduleId !== moduleId) {
        throw new BadRequestException('That sub-module does not belong to the selected module.');
      }
    }
  }

  private orderBy(query: TaskQueryDto): Prisma.TaskOrderByWithRelationInput[] {
    const dir = query.sortDir ?? 'desc';
    switch (query.sortBy) {
      case 'dueDate':
        return [{ dueDate: { sort: dir, nulls: 'last' } }];
      case 'priority':
        return [{ priority: dir }, { dueDate: { sort: 'asc', nulls: 'last' } }];
      case 'status':
        return [{ status: dir }, { updatedAt: 'desc' }];
      case 'title':
        return [{ title: dir }];
      default:
        return [{ updatedAt: 'desc' }];
    }
  }

  private async buildWhere(user: AuthUser, query: TaskQueryDto): Promise<Prisma.TaskWhereInput> {
    const filters: Prisma.TaskWhereInput[] = [];

    if (user.role === Role.RESOURCE) {
      // A resource sees only their own tasks.
      filters.push({ OR: [{ assigneeId: user.id }, { createdById: user.id }] });
    } else if (user.role === Role.PM || user.role === Role.EM) {
      // Same sandbox for both — managedProjectIds already reads the right table.
      const projectIds = await this.scope.managedProjectIds(user);
      filters.push({
        OR: [{ projectId: { in: projectIds } }, { assigneeId: user.id }, { createdById: user.id }],
      });
    }

    if (query.mine) filters.push({ assigneeId: user.id });
    if (query.status) filters.push({ status: query.status });
    if (query.priority) filters.push({ priority: query.priority });
    if (query.severity) filters.push({ severity: query.severity });
    if (query.projectId) filters.push({ projectId: query.projectId });
    if (query.moduleId) filters.push({ moduleId: query.moduleId });
    if (query.subModuleId) filters.push({ subModuleId: query.subModuleId });
    if (query.assigneeId) filters.push({ assigneeId: query.assigneeId });
    if (query.dueFrom || query.dueTo) {
      filters.push({
        dueDate: {
          ...(query.dueFrom ? { gte: new Date(query.dueFrom) } : {}),
          ...(query.dueTo ? { lte: new Date(query.dueTo) } : {}),
        },
      });
    }
    if (query.overdue) {
      filters.push({ dueDate: { lt: new Date() } }, { status: { not: TaskStatus.DONE } });
    }
    if (query.search) {
      filters.push({
        OR: [
          { title: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { ticketId: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return filters.length ? { AND: filters } : {};
  }
}
