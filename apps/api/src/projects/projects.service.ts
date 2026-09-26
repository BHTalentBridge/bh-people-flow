import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ApprovalStatus, NotificationType, Prisma, ProjectStatus, ResourceType, Role, TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { ClientsService } from '../clients/clients.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import {
  CreateProjectDto, ModuleDto, ProjectQueryDto, SetEngineersDto, SetManagersDto, SubModuleDto,
  UpdateProjectDto,
} from './dto/project.dto';
import type { AuthUser } from '../common/types';

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly clients: ClientsService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, query: ProjectQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const scopeWhere = await this.scope.projectWhere(user);

    const filters: Prisma.ProjectWhereInput[] = [scopeWhere];
    if (query.status) filters.push({ status: query.status });
    if (query.clientId) filters.push({ clientId: query.clientId });
    if (query.managerId) filters.push({ managers: { some: { userId: query.managerId } } });
    if (query.engineerId) filters.push({ engineers: { some: { userId: query.engineerId } } });
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { code: { contains: query.search, mode: 'insensitive' } },
          { client: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.ProjectWhereInput = { AND: filters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        skip,
        take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
        include: {
          client: { select: { id: true, name: true } },
          managers: { include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } } },
          engineers: { include: { user: { select: { id: true, name: true, email: true, avatarColor: true } } } },
          _count: { select: { modules: true, assignments: true, tasks: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);

    // Headcount per project counts distinct resources placed on it.
    const withHeadcount = await Promise.all(
      rows.map(async (p) => ({ ...p, headcount: await this.headcount(p.id) })),
    );
    return pageResult(withHeadcount, total, page, pageSize);
  }

  async findOne(user: AuthUser, id: string) {
    await this.scope.assertProjectAccess(user, id);
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        client: true,
        managers: { include: { user: { select: { id: true, name: true, email: true, role: true, avatarColor: true } } } },
        engineers: { include: { user: { select: { id: true, name: true, email: true, role: true, avatarColor: true, isActive: true } } } },
        modules: {
          orderBy: { name: 'asc' },
          include: {
            subModules: {
              orderBy: { name: 'asc' },
              include: { _count: { select: { assignments: true, tasks: true } } },
            },
            _count: { select: { assignments: true, tasks: true } },
          },
        },
        assignments: {
          include: {
            resource: {
              select: { id: true, name: true, email: true, type: true, serviceProvider: { select: { id: true, name: true } }, designation: true, status: true },
            },
            module: { select: { id: true, name: true } },
            subModule: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        // Placements still waiting on an EM — shown alongside the real ones so
        // the roster explains itself ("why isn't she on the list yet?").
        requests: {
          where: { status: ApprovalStatus.PENDING },
          orderBy: { createdAt: 'desc' },
          include: {
            resource: {
              select: { id: true, name: true, employeeCode: true, designation: true, type: true, serviceProvider: { select: { id: true, name: true } } },
            },
            module: { select: { id: true, name: true } },
            subModule: { select: { id: true, name: true } },
            requestedBy: { select: { id: true, name: true, avatarColor: true } },
          },
        },
        _count: { select: { tasks: true } },
      },
    });
    if (!project) throw new NotFoundException('Project not found.');

    const mix = await this.resourceMix(id);
    const activeEngineers = project.engineers.filter((e) => e.user.isActive !== false);
    return {
      ...project,
      headcount: mix.internal + mix.external,
      resourceMix: mix,
      // Same answer `options` gives, so no screen has to re-derive the rule.
      needsAssignmentApproval:
        user.role !== Role.ADMIN && !activeEngineers.some((e) => e.user.id === user.id),
      approverNames: activeEngineers.map((e) => e.user.name),
    };
  }

  async create(user: AuthUser, dto: CreateProjectDto) {
    const client = await this.clients.resolve({ clientId: dto.clientId, clientName: dto.clientName });
    const code = dto.code?.trim().toUpperCase() || (await this.nextCode(dto.name));

    // A PM creating a project always co-manages it; only Admin may set an arbitrary list.
    let managerIds = user.role === Role.ADMIN ? dto.managerIds ?? [] : [user.id];
    if (user.role === Role.ADMIN && managerIds.length === 0) managerIds = [];
    managerIds = [...new Set(managerIds)];

    const project = await this.prisma.project.create({
      data: {
        name: dto.name.trim(),
        code,
        description: dto.description,
        status: dto.status ?? ProjectStatus.PLANNING,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        clientId: client.id,
        managers: { create: managerIds.map((userId) => ({ userId })) },
      },
      include: {
        client: true,
        managers: { include: { user: { select: { id: true, name: true } } } },
      },
    });

    await this.audit.record({
      actor: user,
      action: 'PROJECT_CREATED',
      entityType: 'Project',
      entityId: project.id,
      summary: `Created project ${project.name} (${client.name})`,
      after: { name: project.name, code: project.code, client: client.name, status: project.status },
    });
    return project;
  }

  async update(user: AuthUser, id: string, dto: UpdateProjectDto) {
    await this.scope.assertProjectWrite(user, id);
    const existing = await this.prisma.project.findUnique({ where: { id }, include: { client: true } });
    if (!existing) throw new NotFoundException('Project not found.');

    const data: Prisma.ProjectUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.code !== undefined) data.code = dto.code.trim().toUpperCase();
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.startDate !== undefined) data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.endDate !== undefined) data.endDate = dto.endDate ? new Date(dto.endDate) : null;
    if (dto.clientId || dto.clientName) {
      const client = await this.clients.resolve({ clientId: dto.clientId, clientName: dto.clientName });
      data.client = { connect: { id: client.id } };
    }

    const project = await this.prisma.project.update({
      where: { id },
      data,
      include: { client: true, managers: { include: { user: { select: { id: true, name: true } } } } },
    });

    await this.audit.record({
      actor: user,
      action: 'PROJECT_UPDATED',
      entityType: 'Project',
      entityId: id,
      summary: `Updated project ${project.name}`,
      before: { name: existing.name, status: existing.status, client: existing.client.name },
      after: { name: project.name, status: project.status, client: project.client.name },
    });
    return project;
  }

  async remove(user: AuthUser, id: string) {
    if (user.role !== Role.ADMIN) throw new ForbiddenException('Only Admins can delete projects.');
    const project = await this.prisma.project.findUnique({ where: { id }, include: { client: true } });
    if (!project) throw new NotFoundException('Project not found.');

    await this.prisma.project.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'PROJECT_DELETED',
      entityType: 'Project',
      entityId: id,
      summary: `Deleted project ${project.name}`,
      before: { name: project.name, code: project.code, client: project.client.name },
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // PM assignment — Admin only. Resources stay bound to the project, so
  // swapping PMs never disturbs existing project data.
  // -------------------------------------------------------------------------

  async setManagers(user: AuthUser, id: string, dto: SetManagersDto) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Admins can assign or reassign project managers.');
    }
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { managers: { include: { user: { select: { id: true, name: true } } } } },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // PMs only. An Admin already has full authority over every project, so
    // adding one here grants nothing and blurs the PM/EM distinction.
    const ids = [...new Set(dto.managerIds)];
    const valid = await this.prisma.user.findMany({
      where: { id: { in: ids }, role: Role.PM, isActive: true },
      select: { id: true, name: true },
    });
    if (valid.length !== ids.length) {
      throw new BadRequestException(
        'One or more selected people are inactive, or do not hold Project Manager access.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.projectManager.deleteMany({ where: { projectId: id } }),
      this.prisma.projectManager.createMany({ data: ids.map((userId) => ({ projectId: id, userId })) }),
    ]);

    await this.audit.record({
      actor: user,
      action: 'PROJECT_MANAGERS_CHANGED',
      entityType: 'Project',
      entityId: id,
      summary: `Reassigned managers on ${project.name} to ${valid.map((v) => v.name).join(', ') || 'nobody'}`,
      before: { managers: project.managers.map((m) => m.user.name) },
      after: { managers: valid.map((v) => v.name) },
    });

    return this.findOne(user, id);
  }

  /**
   * Engineering Managers on a project — Admin only, same as PMs. This is what
   * decides *who approves* the project's assignment requests, so a project with
   * nobody here falls back to Admins rather than blocking its PMs.
   */
  async setEngineers(user: AuthUser, id: string, dto: SetEngineersDto) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only Admins can assign or reassign Engineering Managers.');
    }
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { engineers: { include: { user: { select: { id: true, name: true } } } } },
    });
    if (!project) throw new NotFoundException('Project not found.');

    // EMs only, for the same reason as setManagers.
    const ids = [...new Set(dto.engineerIds)];
    const valid = await this.prisma.user.findMany({
      where: { id: { in: ids }, role: Role.EM, isActive: true },
      select: { id: true, name: true },
    });
    if (valid.length !== ids.length) {
      throw new BadRequestException(
        'One or more selected people are inactive, or do not hold Engineering Manager access.',
      );
    }

    const removed = project.engineers.filter((e) => !ids.includes(e.userId)).map((e) => e.userId);

    await this.prisma.$transaction([
      this.prisma.projectEngineeringManager.deleteMany({ where: { projectId: id } }),
      this.prisma.projectEngineeringManager.createMany({
        data: ids.map((userId) => ({ projectId: id, userId })),
      }),
    ]);

    await this.audit.record({
      actor: user,
      action: 'PROJECT_ENGINEERS_CHANGED',
      entityType: 'Project',
      entityId: id,
      summary: `Reassigned Engineering Managers on ${project.name} to ${
        valid.map((v) => v.name).join(', ') || 'nobody'
      }`,
      before: { engineers: project.engineers.map((e) => e.user.name) },
      after: { engineers: valid.map((v) => v.name) },
    });

    // Someone newly responsible for this project's queue should hear about it,
    // and someone taken off it should stop wondering why it went quiet.
    const added = ids.filter((userId) => !project.engineers.some((e) => e.userId === userId));
    const pending = await this.prisma.assignmentRequest.count({
      where: { projectId: id, status: ApprovalStatus.PENDING },
    });
    await this.notifications.notifyMany(added.filter((uid) => uid !== user.id), {
      type: NotificationType.GENERIC,
      title: `You are now Engineering Manager on ${project.code}`,
      body: pending
        ? `${pending} resource assignment${pending === 1 ? '' : 's'} on ${project.name} ${
            pending === 1 ? 'is' : 'are'
          } waiting for your approval.`
        : `${project.name} is now in your scope. Assignment requests on it come to you.`,
      link: pending ? '/assignment-requests?status=PENDING' : `/projects/${id}`,
    });
    await this.notifications.notifyMany(removed.filter((uid) => uid !== user.id), {
      type: NotificationType.GENERIC,
      title: `Removed as Engineering Manager on ${project.code}`,
      body: `${project.name} is no longer in your scope.`,
    });

    return this.findOne(user, id);
  }

  // -------------------------------------------------------------------------
  // Modules & sub-modules
  // -------------------------------------------------------------------------

  async addModule(user: AuthUser, projectId: string, dto: ModuleDto) {
    await this.scope.assertProjectWrite(user, projectId);
    const module = await this.prisma.module.create({
      data: { projectId, name: dto.name.trim(), description: dto.description },
      include: { subModules: true, _count: { select: { assignments: true, tasks: true } } },
    });
    await this.audit.record({
      actor: user, action: 'MODULE_CREATED', entityType: 'Module', entityId: module.id,
      summary: `Added module ${module.name}`, after: { name: module.name, projectId },
    });
    return module;
  }

  async updateModule(user: AuthUser, moduleId: string, dto: ModuleDto) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!module) throw new NotFoundException('Module not found.');
    await this.scope.assertProjectWrite(user, module.projectId);

    const updated = await this.prisma.module.update({
      where: { id: moduleId },
      data: { name: dto.name.trim(), description: dto.description },
      include: { subModules: true, _count: { select: { assignments: true, tasks: true } } },
    });
    await this.audit.record({
      actor: user, action: 'MODULE_UPDATED', entityType: 'Module', entityId: moduleId,
      summary: `Renamed module ${module.name} → ${updated.name}`,
      before: { name: module.name }, after: { name: updated.name },
    });
    return updated;
  }

  async removeModule(user: AuthUser, moduleId: string) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!module) throw new NotFoundException('Module not found.');
    await this.scope.assertProjectWrite(user, module.projectId);

    await this.prisma.module.delete({ where: { id: moduleId } });
    await this.audit.record({
      actor: user, action: 'MODULE_DELETED', entityType: 'Module', entityId: moduleId,
      summary: `Deleted module ${module.name}`, before: { name: module.name },
    });
    return { ok: true };
  }

  async addSubModule(user: AuthUser, moduleId: string, dto: SubModuleDto) {
    const module = await this.prisma.module.findUnique({ where: { id: moduleId } });
    if (!module) throw new NotFoundException('Module not found.');
    await this.scope.assertProjectWrite(user, module.projectId);

    const sub = await this.prisma.subModule.create({
      data: { moduleId, name: dto.name.trim(), description: dto.description },
      include: { _count: { select: { assignments: true, tasks: true } } },
    });
    await this.audit.record({
      actor: user, action: 'SUBMODULE_CREATED', entityType: 'SubModule', entityId: sub.id,
      summary: `Added sub-module ${module.name} › ${sub.name}`, after: { name: sub.name, moduleId },
    });
    return sub;
  }

  async removeSubModule(user: AuthUser, subModuleId: string) {
    const sub = await this.prisma.subModule.findUnique({
      where: { id: subModuleId },
      include: { module: true },
    });
    if (!sub) throw new NotFoundException('Sub-module not found.');
    await this.scope.assertProjectWrite(user, sub.module.projectId);

    await this.prisma.subModule.delete({ where: { id: subModuleId } });
    await this.audit.record({
      actor: user, action: 'SUBMODULE_DELETED', entityType: 'SubModule', entityId: subModuleId,
      summary: `Deleted sub-module ${sub.module.name} › ${sub.name}`, before: { name: sub.name },
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Drill-down detail, so clicking a module or sub-module shows what's actually
  // happening in it rather than just a count.
  // -------------------------------------------------------------------------

  async moduleDetail(user: AuthUser, moduleId: string) {
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      include: {
        project: { select: { id: true, name: true, code: true } },
        subModules: {
          orderBy: { name: 'asc' },
          include: { _count: { select: { assignments: true, tasks: true } } },
        },
        assignments: {
          include: {
            resource: {
              select: {
                id: true, name: true, employeeCode: true, designation: true, type: true,
                status: true, serviceProvider: { select: { id: true, name: true } },
              },
            },
            subModule: { select: { id: true, name: true } },
          },
        },
        tasks: {
          orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
          select: {
            id: true, title: true, status: true, priority: true, dueDate: true, ticketId: true,
            assignee: { select: { id: true, name: true, avatarColor: true } },
          },
        },
      },
    });
    if (!module) throw new NotFoundException('Module not found.');
    await this.scope.assertProjectAccess(user, module.projectId);

    // People placed on the project without a module. They are not assigned to
    // *this* module — a placement is either scoped or it isn't — but a module
    // page that ignores them reads as "nobody is on this project", which is
    // wrong and alarming. Shown as a clearly separate group.
    const broader = await this.prisma.resourceAssignment.findMany({
      where: { projectId: module.projectId, moduleId: null },
      include: {
        resource: {
          select: {
            id: true, name: true, employeeCode: true, designation: true, type: true,
            status: true, serviceProvider: { select: { id: true, name: true } },
          },
        },
        module: { select: { id: true, name: true } },
        subModule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...module,
      broaderAssignments: broader.map((a) => ({ ...a, scope: 'PROJECT' as const })),
      taskBreakdown: this.breakdown(module.tasks),
    };
  }

  async subModuleDetail(user: AuthUser, subModuleId: string) {
    const sub = await this.prisma.subModule.findUnique({
      where: { id: subModuleId },
      include: {
        module: { select: { id: true, name: true, projectId: true, project: { select: { id: true, name: true, code: true } } } },
        assignments: {
          include: {
            resource: {
              select: {
                id: true, name: true, employeeCode: true, designation: true, type: true,
                status: true, serviceProvider: { select: { id: true, name: true } },
              },
            },
          },
        },
        tasks: {
          orderBy: [{ status: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }],
          select: {
            id: true, title: true, status: true, priority: true, dueDate: true, ticketId: true,
            assignee: { select: { id: true, name: true, avatarColor: true } },
          },
        },
      },
    });
    if (!sub) throw new NotFoundException('Sub-module not found.');
    await this.scope.assertProjectAccess(user, sub.module.projectId);

    // Same idea one level down: people on the parent module but not narrowed to
    // this sub-module, plus people on the project at large.
    const broader = await this.prisma.resourceAssignment.findMany({
      where: {
        projectId: sub.module.projectId,
        OR: [
          { moduleId: null },
          { moduleId: sub.moduleId, subModuleId: null },
        ],
      },
      include: {
        resource: {
          select: {
            id: true, name: true, employeeCode: true, designation: true, type: true,
            status: true, serviceProvider: { select: { id: true, name: true } },
          },
        },
        module: { select: { id: true, name: true } },
        subModule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...sub,
      broaderAssignments: broader.map((a) => ({
        ...a,
        scope: (a.moduleId ? 'MODULE' : 'PROJECT') as 'MODULE' | 'PROJECT',
      })),
      taskBreakdown: this.breakdown(sub.tasks),
    };
  }

  /**
   * People on this project, **one entry per person**. Someone assigned to two
   * modules is a single entry carrying both placements — the raw assignment rows
   * were being listed directly, so they appeared twice.
   */
  async projectResources(user: AuthUser, projectId: string) {
    await this.scope.assertProjectAccess(user, projectId);

    // Task counts are per assignee (a User); resources carry userId, so they map across.
    const countTasks = (where: Prisma.TaskWhereInput) =>
      this.prisma.task.groupBy({
        by: ['assigneeId'],
        where,
        _count: { _all: true },
        orderBy: { assigneeId: 'asc' },
      });

    const [assignments, taskRows, openRows, overdueRows] = await Promise.all([
      this.prisma.resourceAssignment.findMany({
        where: { projectId },
        include: {
          resource: {
            select: {
              id: true, name: true, email: true, employeeCode: true, designation: true,
              type: true, status: true, userId: true,
              serviceProvider: { select: { id: true, name: true } },
            },
          },
          module: { select: { id: true, name: true } },
          subModule: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      countTasks({ projectId }),
      countTasks({ projectId, status: { not: TaskStatus.DONE } }),
      countTasks({ projectId, dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE } }),
    ]);

    const toMap = (rows: { assigneeId: string; _count?: { _all?: number } | unknown }[]) =>
      new Map(
        rows.map((r) => [
          r.assigneeId,
          typeof r._count === 'object' && r._count && '_all' in r._count
            ? ((r._count as { _all: number })._all ?? 0)
            : 0,
        ]),
      );
    const taskTotal = toMap(taskRows);
    const taskOpen = toMap(openRows);
    const taskOverdue = toMap(overdueRows);

    type Entry = {
      resource: (typeof assignments)[number]['resource'];
      assignments: {
        id: string; allocationPct: number; roleOnProject: string | null;
        startDate: Date | null; endDate: Date | null;
        module: { id: string; name: string } | null;
        subModule: { id: string; name: string } | null;
      }[];
      totalAllocation: number;
      tasks: { total: number; open: number; overdue: number };
    };

    const byResource = new Map<string, Entry>();
    for (const a of assignments) {
      let entry = byResource.get(a.resourceId);
      if (!entry) {
        entry = {
          resource: a.resource,
          assignments: [],
          totalAllocation: 0,
          tasks: {
            total: taskTotal.get(a.resource.userId ?? '') ?? 0,
            open: taskOpen.get(a.resource.userId ?? '') ?? 0,
            overdue: taskOverdue.get(a.resource.userId ?? '') ?? 0,
          },
        };
        byResource.set(a.resourceId, entry);
      }
      entry.assignments.push({
        id: a.id,
        allocationPct: a.allocationPct,
        roleOnProject: a.roleOnProject,
        startDate: a.startDate,
        endDate: a.endDate,
        module: a.module,
        subModule: a.subModule,
      });
      entry.totalAllocation += a.allocationPct;
    }

    return [...byResource.values()].sort((a, b) => a.resource.name.localeCompare(b.resource.name));
  }

  /** Resources not yet assigned to this project — powers "assign a resource". */
  /**
   * Candidates for a placement on this project.
   *
   * Excludes only people who already hold **this exact placement** — same module
   * and sub-module — not everyone already on the project. Someone placed at
   * project level is still a valid candidate for a specific module: that's a
   * second, different placement. Filtering per project made module-level
   * placements unreachable from this screen.
   *
   * Each candidate carries what they already hold here, so the picker can say so
   * instead of letting you pick a duplicate and fail on submit.
   */
  async availableResources(
    user: AuthUser,
    projectId: string,
    moduleId?: string,
    subModuleId?: string,
  ) {
    await this.scope.assertProjectWrite(user, projectId);

    const placement = {
      projectId,
      moduleId: moduleId ?? null,
      subModuleId: subModuleId ?? null,
    };

    // Deliberately NOT filtered by `resourceWhere`.
    //
    // That scope answers "whose record may I manage" — people you onboarded, or
    // who already work on your projects. Staffing asks a different question:
    // who *could* work here. Filtering the picker by it meant a PM could only
    // request people already on their project, which is the one case the
    // request flow exists to handle. A PM asking for someone new is exactly the
    // thing an EM approves, so the gate is the approval, not the picker.
    const rows = await this.prisma.resource.findMany({
      where: {
        AND: [
          { status: 'ACTIVE' },
          { assignments: { none: placement } },
          // Managers aren't placed on projects — a PM or EM is attached via the
          // project's own manager pickers, and an Admin oversees everything
          // already. Listing them here was just noise.
          { OR: [{ user: null }, { user: { role: Role.RESOURCE } }] },
        ],
      },
      select: {
        id: true, name: true, employeeCode: true, designation: true, type: true,
        internalSeniority: true,
        serviceProvider: { select: { id: true, name: true } },
        assignments: {
          where: { projectId },
          select: {
            id: true,
            allocationPct: true,
            roleOnProject: true,
            module: { select: { id: true, name: true } },
            subModule: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return rows.map(({ assignments, ...r }) => ({
      ...r,
      // Already on this project elsewhere — shown as context, not a blocker.
      existingPlacements: assignments.map((a) => ({
        id: a.id,
        allocationPct: a.allocationPct,
        roleOnProject: a.roleOnProject,
        label: a.subModule
          ? `${a.module?.name} › ${a.subModule.name}`
          : a.module?.name ?? 'Whole project',
      })),
      totalAllocation: assignments.reduce((n, a) => n + a.allocationPct, 0),
    }));
  }

  private breakdown(tasks: { status: TaskStatus }[]) {
    const out = Object.fromEntries(Object.values(TaskStatus).map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const t of tasks) out[t.status]++;
    return out;
  }

  /** Compact project list for dropdowns across the app. */
  /**
   * A resource's own view of the projects they're placed on. **Read-only.**
   *
   * Deliberately not `findOne`: that returns the whole project — every manager,
   * every placement, pending assignment requests, headcount — which is a
   * manager's view. A resource should see where *they* sit and who they sit
   * with, so this returns their own placements plus the people sharing each
   * module they're on.
   *
   * Colleague rows carry name, title and provider only. No allocation, email or
   * phone: enough to know who you're working with, nothing more.
   */
  async myProjects(user: AuthUser) {
    if (!user.resourceId) return [];

    const mine = await this.prisma.resourceAssignment.findMany({
      where: { resourceId: user.resourceId },
      include: {
        project: {
          select: {
            id: true, code: true, name: true, description: true, status: true,
            startDate: true, endDate: true,
            client: { select: { id: true, name: true } },
          },
        },
        module: { select: { id: true, name: true, description: true } },
        subModule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (!mine.length) return [];

    const projectIds = [...new Set(mine.map((a) => a.projectId))];

    // Everyone on those projects, so colleagues can be grouped by scope.
    const everyone = await this.prisma.resourceAssignment.findMany({
      where: { projectId: { in: projectIds } },
      select: {
        id: true, projectId: true, moduleId: true, subModuleId: true, roleOnProject: true,
        module: { select: { id: true, name: true } },
        subModule: { select: { id: true, name: true } },
        resource: {
          select: {
            id: true, name: true, designation: true, type: true,
            serviceProvider: { select: { id: true, name: true } },
            user: { select: { avatarColor: true } },
          },
        },
      },
    });

    // Sub-modules of the modules they're on, for context on each group.
    const moduleIds = [...new Set(mine.map((a) => a.moduleId).filter((x): x is string => !!x))];
    const subModules = moduleIds.length
      ? await this.prisma.subModule.findMany({
          where: { moduleId: { in: moduleIds } },
          select: { id: true, name: true, moduleId: true },
          orderBy: { name: 'asc' },
        })
      : [];

    const member = (a: (typeof everyone)[number]) => ({
      resourceId: a.resource.id,
      name: a.resource.name,
      designation: a.resource.designation,
      roleOnProject: a.roleOnProject,
      type: a.resource.type,
      serviceProvider: a.resource.serviceProvider,
      avatarColor: a.resource.user?.avatarColor ?? null,
      scopeLabel: a.subModule ? `${a.module?.name} › ${a.subModule.name}` : a.module?.name ?? 'Whole project',
      isMe: a.resource.id === user.resourceId,
    });

    return projectIds.map((pid) => {
      const myRows = mine.filter((a) => a.projectId === pid);
      const onProject = everyone.filter((a) => a.projectId === pid);

      // One group per module they're placed on, plus one for a project-level
      // placement. Members of a module group include its sub-modules.
      const myModuleIds = [...new Set(myRows.map((a) => a.moduleId))];
      const scopes = myModuleIds.map((mid) => {
        const label = mid
          ? myRows.find((a) => a.moduleId === mid)!.module
          : null;
        const members = onProject
          .filter((a) => a.moduleId === mid)
          .map(member)
          .sort((x, y) => Number(y.isMe) - Number(x.isMe) || x.name.localeCompare(y.name));
        return {
          kind: mid ? ('MODULE' as const) : ('PROJECT' as const),
          module: label,
          subModules: subModules.filter((sm) => sm.moduleId === mid).map(({ id, name }) => ({ id, name })),
          members,
        };
      });

      // Placed on the project without a module: they work across all of it, so
      // they're relevant context even when not in one of the groups above.
      const alsoOnProject = myModuleIds.includes(null)
        ? []
        : onProject.filter((a) => !a.moduleId).map(member);

      return {
        project: myRows[0].project,
        myPlacements: myRows.map((a) => ({
          id: a.id,
          roleOnProject: a.roleOnProject,
          allocationPct: a.allocationPct,
          startDate: a.startDate,
          endDate: a.endDate,
          module: a.module,
          subModule: a.subModule,
        })),
        totalAllocation: myRows.reduce((n, a) => n + a.allocationPct, 0),
        scopes,
        alsoOnProject,
      };
    });
  }

  /**
   * Picker data. Each project also reports whether *this* caller placing someone
   * on it would need an Engineering Manager's approval, and who would decide —
   * so a form can say so before you submit instead of the UI guessing at the
   * rule or discovering it from the response.
   */
  async options(user: AuthUser) {
    const where = await this.scope.projectWhere(user);
    const projects = await this.prisma.project.findMany({
      where,
      select: {
        id: true, name: true, code: true, status: true,
        client: { select: { id: true, name: true } },
        engineers: { select: { user: { select: { id: true, name: true, isActive: true } } } },
        modules: {
          select: { id: true, name: true, subModules: { select: { id: true, name: true } } },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    // A resource uses this only to filter their own tasks and attendance, so
    // they get the bare project; the approval routing is a manager's concern.
    if (user.role === Role.RESOURCE) {
      return projects.map(({ engineers, ...p }) => p);
    }

    return projects.map(({ engineers, ...p }) => {
      const active = engineers.filter((e) => e.user.isActive);
      return {
        ...p,
        // Mirrors ScopeService.needsAssignmentApproval: an Admin, or an EM on
        // this project, assigns directly; everyone else is asking.
        needsAssignmentApproval:
          user.role !== Role.ADMIN && !active.some((e) => e.user.id === user.id),
        approverNames: active.map((e) => e.user.name),
      };
    });
  }

  // -------------------------------------------------------------------------

  private async headcount(projectId: string) {
    const mix = await this.resourceMix(projectId);
    return mix.internal + mix.external;
  }

  private async resourceMix(projectId: string) {
    const resources = await this.prisma.resource.findMany({
      where: { assignments: { some: { projectId } } },
      select: { id: true, type: true },
    });
    return {
      internal: resources.filter((r) => r.type === ResourceType.SH).length,
      external: resources.filter((r) => r.type === ResourceType.EXTERNAL).length,
    };
  }

  private async nextCode(name: string) {
    const base =
      name
        .split(/\s+/)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .replace(/[^A-Z]/g, '')
        .slice(0, 4) || 'PRJ';
    for (let i = 1; i < 100; i++) {
      const code = `${base}-${String(i).padStart(2, '0')}`;
      const taken = await this.prisma.project.findUnique({ where: { code } });
      if (!taken) return code;
    }
    return `${base}-${Date.now()}`;
  }
}
