import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { ApprovalStatus, NotificationType, Prisma, ResourceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { AssignResourceDto } from '../resources/dto/resource.dto';
import { AssignmentRequestQueryDto, DecideAssignmentDto } from './dto/assignment-request.dto';
import type { AuthUser } from '../common/types';

const REQUEST_INCLUDE = {
  resource: {
    select: {
      id: true, name: true, employeeCode: true, designation: true, type: true,
      internalSeniority: true, serviceProvider: { select: { id: true, name: true } },
    },
  },
  project: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
  module: { select: { id: true, name: true } },
  subModule: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, role: true, avatarColor: true } },
  decidedBy: { select: { id: true, name: true, role: true, avatarColor: true } },
} satisfies Prisma.AssignmentRequestInclude;

/** How each access level reads in a validation message. */
const ROLE_NOUN: Record<Role, string> = {
  [Role.ADMIN]: 'Administrator',
  [Role.PM]: 'Project Manager',
  [Role.EM]: 'Engineering Manager',
  [Role.RESOURCE]: 'Resource',
};

/** "GP-01 › Core › Billing" — the placement, in one string. */
function placementLabel(parts: {
  project: { code: string };
  module?: { name: string } | null;
  subModule?: { name: string } | null;
}) {
  return [parts.project.code, parts.module?.name, parts.subModule?.name].filter(Boolean).join(' › ');
}

/**
 * Placing a resource on a project is a PM action that an **Engineering Manager**
 * signs off on. That gate lives here, and every path that creates a placement
 * goes through `assignOrRequest` — so there is no way to write a
 * ResourceAssignment that skipped a decision it needed.
 *
 * Who bypasses it, and why:
 *  - **Admin** — unrestricted everywhere else, unrestricted here.
 *  - **EM on that project** — they are the approver, so making the request and
 *    granting it would be the same click.
 *
 * Everyone else (in practice, a PM) raises a PENDING request. A pending request
 * is inert: it grants no access, appears on no roster, and only becomes a real
 * placement when someone with authority approves it.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Creating a placement (or asking for one)
  // -------------------------------------------------------------------------

  /**
   * The single entry point for putting someone on a project. Returns either the
   * created assignment (`pending: false`) or the request awaiting a decision
   * (`pending: true`), so the caller can tell the user which one happened.
   */
  async assignOrRequest(user: AuthUser, resourceId: string, dto: AssignResourceDto) {
    // Authority over the *project* is what's required — not authority over the
    // person's record. A PM staffing their project routinely asks for someone
    // they didn't onboard and who isn't on any of their projects yet; requiring
    // `assertResourceWrite` here made that impossible, which defeated the point
    // of a request-and-approve flow. What they can ask for is still bounded:
    // the project must be theirs, the target must be an active plain resource,
    // and a PM's ask only becomes a placement once an EM approves it.
    await this.scope.assertProjectWrite(user, dto.projectId);
    await this.validatePlacement(resourceId, dto);

    if (await this.scope.needsAssignmentApproval(user, dto.projectId)) {
      const request = await this.raise(user, resourceId, dto);
      return { pending: true as const, request, assignment: null };
    }
    const assignment = await this.createAssignment(user, resourceId, dto);
    return { pending: false as const, request: null, assignment };
  }

  /**
   * Shape checks shared by both paths, plus the two duplicate checks: an existing
   * placement, and an existing *pending request* for the same one — otherwise the
   * same ask could sit in the queue three times.
   */
  private async validatePlacement(resourceId: string, dto: AssignResourceDto) {
    // Placements staff the delivery work. Someone holding elevated access is
    // attached to a project by being made its PM or EM — an Admin oversees every
    // project already — so they are not candidates to be *placed* on one, and
    // listing them in the picker only invited this mistake.
    const target = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { name: true, status: true, user: { select: { role: true } } },
    });
    if (!target) throw new NotFoundException('Resource not found.');
    if (target.status !== ResourceStatus.ACTIVE) {
      throw new BadRequestException(`${target.name} is inactive and cannot be placed on a project.`);
    }
    if (target.user && target.user.role !== Role.RESOURCE) {
      throw new BadRequestException(
        `${target.name} holds ${ROLE_NOUN[target.user.role]} access. ${
          target.user.role === Role.ADMIN
            ? 'Admins oversee projects rather than work on them.'
            : 'Attach them to the project as its ' + ROLE_NOUN[target.user.role] + ' instead.'
        }`,
      );
    }

    if (dto.subModuleId && !dto.moduleId) {
      throw new BadRequestException('Pick the parent module for this sub-module.');
    }
    if (dto.moduleId) {
      const module = await this.prisma.module.findUnique({ where: { id: dto.moduleId } });
      if (!module || module.projectId !== dto.projectId) {
        throw new BadRequestException('That module does not belong to the selected project.');
      }
    }
    if (dto.subModuleId) {
      const sub = await this.prisma.subModule.findUnique({ where: { id: dto.subModuleId } });
      if (!sub || sub.moduleId !== dto.moduleId) {
        throw new BadRequestException('That sub-module does not belong to the selected module.');
      }
    }

    const placement = {
      resourceId,
      projectId: dto.projectId,
      moduleId: dto.moduleId ?? null,
      subModuleId: dto.subModuleId ?? null,
    };

    const duplicate = await this.prisma.resourceAssignment.findFirst({ where: placement });
    if (duplicate) throw new BadRequestException('This resource is already assigned here.');

    const queued = await this.prisma.assignmentRequest.findFirst({
      where: { ...placement, status: ApprovalStatus.PENDING },
      include: { requestedBy: { select: { name: true } } },
    });
    if (queued) {
      throw new BadRequestException(
        `${queued.requestedBy.name} already has a request pending approval for this placement.`,
      );
    }
  }

  /** Writes the ResourceAssignment. Only reached once the gate has been cleared. */
  private async createAssignment(
    user: AuthUser,
    resourceId: string,
    dto: AssignResourceDto,
    viaRequestId?: string,
  ) {
    const assignment = await this.prisma.resourceAssignment.create({
      data: {
        resourceId,
        projectId: dto.projectId,
        moduleId: dto.moduleId ?? null,
        subModuleId: dto.subModuleId ?? null,
        roleOnProject: dto.roleOnProject?.trim() || null,
        allocationPct: dto.allocationPct ?? 100,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        assignedById: user.id,
      },
      include: {
        resource: { select: { name: true } },
        project: { select: { name: true, code: true } },
        module: { select: { name: true } },
        subModule: { select: { name: true } },
      },
    });

    if (viaRequestId) {
      await this.prisma.assignmentRequest.update({
        where: { id: viaRequestId },
        data: { assignmentId: assignment.id },
      });
    }

    await this.audit.record({
      actor: user,
      action: 'RESOURCE_ASSIGNED',
      entityType: 'Resource',
      entityId: resourceId,
      summary: `Assigned ${assignment.resource.name} to ${assignment.project.name}${
        assignment.module ? ` › ${assignment.module.name}` : ''
      }${assignment.subModule ? ` › ${assignment.subModule.name}` : ''}${
        viaRequestId ? ' (approved request)' : ''
      }`,
      after: {
        projectId: dto.projectId,
        moduleId: dto.moduleId ?? null,
        subModuleId: dto.subModuleId ?? null,
        roleOnProject: dto.roleOnProject?.trim() || null,
        allocationPct: dto.allocationPct ?? 100,
        viaRequest: viaRequestId ?? null,
      },
    });
    return assignment;
  }

  /** Queues the request and tells the people who can decide it. */
  private async raise(user: AuthUser, resourceId: string, dto: AssignResourceDto) {
    const request = await this.prisma.assignmentRequest.create({
      data: {
        resourceId,
        projectId: dto.projectId,
        moduleId: dto.moduleId ?? null,
        subModuleId: dto.subModuleId ?? null,
        roleOnProject: dto.roleOnProject?.trim() || null,
        allocationPct: dto.allocationPct ?? 100,
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        reason: dto.reason,
        requestedById: user.id,
      },
      include: REQUEST_INCLUDE,
    });

    const where = placementLabel(request);
    await this.audit.record({
      actor: user,
      action: 'ASSIGNMENT_REQUESTED',
      entityType: 'AssignmentRequest',
      entityId: request.id,
      summary: `Requested ${request.resource.name}${
        request.roleOnProject ? ` as ${request.roleOnProject}` : ''
      } on ${where} at ${request.allocationPct}%`,
      after: {
        resource: request.resource.name,
        project: request.project.code,
        allocationPct: request.allocationPct,
        reason: request.reason ?? null,
      },
    });

    const approvers = await this.scope.assignmentApprovers(dto.projectId, user.id);
    await this.notifications.notifyMany(approvers, {
      type: NotificationType.ASSIGNMENT_REQUESTED,
      title: 'Resource assignment needs your approval',
      body: `${user.name} wants to place ${request.resource.name} on ${where} at ${request.allocationPct}%.${
        request.reason ? ` "${request.reason}"` : ''
      }`,
      link: '/assignment-requests?status=PENDING',
    });

    return request;
  }

  // -------------------------------------------------------------------------
  // The queue
  // -------------------------------------------------------------------------

  /**
   * Scoped like everything else: an Admin sees every request, a PM or EM sees
   * requests on their own projects plus anything they raised themselves.
   */
  private async listWhere(user: AuthUser): Promise<Prisma.AssignmentRequestWhereInput> {
    if (this.scope.isAdmin(user)) return {};
    if (!this.scope.isManager(user)) {
      throw new ForbiddenException('Only Admins, PMs and EMs see assignment requests.');
    }
    const projectIds = await this.scope.managedProjectIds(user);
    return { OR: [{ projectId: { in: projectIds } }, { requestedById: user.id }] };
  }

  async list(user: AuthUser, query: AssignmentRequestQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);

    const filters: Prisma.AssignmentRequestWhereInput[] = [await this.listWhere(user)];
    if (query.status) filters.push({ status: query.status });
    if (query.projectId) filters.push({ projectId: query.projectId });
    if (query.resourceId) filters.push({ resourceId: query.resourceId });
    if (query.requestedById) filters.push({ requestedById: query.requestedById });
    if (query.search) {
      filters.push({
        OR: [
          { resource: { name: { contains: query.search, mode: 'insensitive' } } },
          { project: { name: { contains: query.search, mode: 'insensitive' } } },
          { project: { code: { contains: query.search, mode: 'insensitive' } } },
          { requestedBy: { name: { contains: query.search, mode: 'insensitive' } } },
        ],
      });
    }
    const where: Prisma.AssignmentRequestWhereInput = { AND: filters };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.assignmentRequest.findMany({
        where,
        skip,
        take,
        // Pending first, then newest — the queue reads as a to-do list.
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        include: REQUEST_INCLUDE,
      }),
      this.prisma.assignmentRequest.count({ where }),
    ]);

    // "Can I act on this?" is a server answer, so the UI never offers a button
    // the API would refuse.
    const decidableProjects = new Set(
      this.scope.isAdmin(user) || user.role !== Role.EM
        ? []
        : await this.scope.managedProjectIds(user),
    );
    const items = rows.map((r) => ({
      ...r,
      canDecide:
        r.status === ApprovalStatus.PENDING &&
        (this.scope.isAdmin(user) || decidableProjects.has(r.projectId)),
      canCancel: r.status === ApprovalStatus.PENDING && (this.scope.isAdmin(user) || r.requestedById === user.id),
    }));

    return pageResult(items, total, page, pageSize);
  }

  /** Badge count — how many requests this person can actually decide right now. */
  async pendingCount(user: AuthUser) {
    if (!this.scope.isManager(user)) return { count: 0 };

    if (this.scope.isAdmin(user)) {
      return { count: await this.prisma.assignmentRequest.count({ where: { status: ApprovalStatus.PENDING } }) };
    }
    if (user.role !== Role.EM) {
      // A PM has nothing to decide; the badge tracks their own waiting requests.
      return {
        count: await this.prisma.assignmentRequest.count({
          where: { status: ApprovalStatus.PENDING, requestedById: user.id },
        }),
      };
    }
    const projectIds = await this.scope.managedProjectIds(user);
    return {
      count: await this.prisma.assignmentRequest.count({
        where: { status: ApprovalStatus.PENDING, projectId: { in: projectIds } },
      }),
    };
  }

  async findOne(user: AuthUser, id: string) {
    const where = await this.listWhere(user);
    const request = await this.prisma.assignmentRequest.findFirst({
      where: { AND: [{ id }, where] },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Assignment request not found.');
    return request;
  }

  // -------------------------------------------------------------------------
  // Deciding
  // -------------------------------------------------------------------------

  async decide(user: AuthUser, id: string, dto: DecideAssignmentDto) {
    const request = await this.prisma.assignmentRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Assignment request not found.');
    if (request.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`This request was already ${request.status.toLowerCase()}.`);
    }
    await this.scope.assertCanDecideAssignment(user, request.projectId);

    const where = placementLabel(request);
    const approved = dto.status === ApprovalStatus.APPROVED;

    if (approved) {
      // The world may have moved since the request was raised — someone else may
      // have made this exact placement, or the module may be gone. Re-check
      // rather than writing a duplicate.
      await this.validateOnApproval(request);
      await this.createAssignment(
        user,
        request.resourceId,
        {
          projectId: request.projectId,
          moduleId: request.moduleId ?? undefined,
          subModuleId: request.subModuleId ?? undefined,
          roleOnProject: request.roleOnProject ?? undefined,
          allocationPct: request.allocationPct,
          startDate: request.startDate?.toISOString(),
          endDate: request.endDate?.toISOString(),
        },
        request.id,
      );
    }

    const updated = await this.prisma.assignmentRequest.update({
      where: { id },
      data: {
        status: dto.status,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: dto.note,
      },
      include: REQUEST_INCLUDE,
    });

    const verb = approved ? 'Approved' : 'Rejected';
    await this.audit.record({
      actor: user,
      action: approved ? 'ASSIGNMENT_APPROVED' : 'ASSIGNMENT_REJECTED',
      entityType: 'AssignmentRequest',
      entityId: id,
      summary: `${verb} ${request.requestedBy.name}'s request to place ${request.resource.name} on ${where}${
        dto.note ? ` — ${dto.note}` : ''
      }`,
      before: { status: ApprovalStatus.PENDING },
      after: { status: dto.status, decidedBy: user.name, note: dto.note ?? null },
    });

    await this.notifications.notify(request.requestedById, {
      type: NotificationType.ASSIGNMENT_DECIDED,
      title: `Assignment ${dto.status.toLowerCase()}: ${request.resource.name}`,
      body: `${verb} by ${user.name} — ${request.resource.name} on ${where} at ${request.allocationPct}%.${
        dto.note ? ` "${dto.note}"` : ''
      }`,
      link: approved ? `/projects/${request.projectId}` : '/assignment-requests',
    });

    return updated;
  }

  /** Re-runs the duplicate/shape checks against the request's own placement. */
  private async validateOnApproval(request: {
    resourceId: string;
    projectId: string;
    moduleId: string | null;
    subModuleId: string | null;
    resource: { name: string };
  }) {
    const duplicate = await this.prisma.resourceAssignment.findFirst({
      where: {
        resourceId: request.resourceId,
        projectId: request.projectId,
        moduleId: request.moduleId,
        subModuleId: request.subModuleId,
      },
    });
    if (duplicate) {
      throw new BadRequestException(
        `${request.resource.name} has since been assigned here already. Reject this request instead.`,
      );
    }
  }

  /** A PM withdrawing their own pending request (or an Admin clearing one out). */
  async cancel(user: AuthUser, id: string) {
    const request = await this.prisma.assignmentRequest.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException('Assignment request not found.');
    if (request.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException('Only a pending request can be withdrawn.');
    }
    if (!this.scope.isAdmin(user) && request.requestedById !== user.id) {
      throw new ForbiddenException('You can only withdraw a request you raised.');
    }

    await this.prisma.assignmentRequest.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'ASSIGNMENT_REQUEST_WITHDRAWN',
      entityType: 'AssignmentRequest',
      entityId: id,
      summary: `Withdrew the request to place ${request.resource.name} on ${placementLabel(request)}`,
      before: { resource: request.resource.name, project: request.project.code },
    });
    return { ok: true };
  }
}
