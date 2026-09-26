import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResourceType, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { avatarColorFor } from '../common/avatar';
import { ServiceProvidersService } from '../service-providers/service-providers.service';
import { AssignmentsService } from '../assignments/assignments.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import {
  AssignResourceDto, CreateResourceDto, ResourceQueryDto, UpdateResourceDto,
} from './dto/resource.dto';
import type { AuthUser } from '../common/types';

const DETAIL_INCLUDE = {
  serviceProvider: { select: { id: true, name: true, contactName: true, contactEmail: true } },
  user: { select: { id: true, email: true, isActive: true, role: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  assignments: {
    include: {
      project: { select: { id: true, name: true, code: true, status: true, client: { select: { name: true } } } },
      module: { select: { id: true, name: true } },
      subModule: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.ResourceInclude;

/** How each access level reads in an audit line. */
const ROLE_LABEL: Record<Role, string> = {
  [Role.RESOURCE]: 'resource',
  [Role.PM]: 'project manager',
  [Role.EM]: 'engineering manager',
  [Role.ADMIN]: 'administrator',
};

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly serviceProviders: ServiceProvidersService,
    private readonly assignments: AssignmentsService,
  ) {}

  async list(user: AuthUser, query: ResourceQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const scopeWhere = await this.scope.resourceWhere(user);

    const filters: Prisma.ResourceWhereInput[] = [scopeWhere];
    if (query.type) filters.push({ type: query.type });
    if (query.status) filters.push({ status: query.status });
    if (query.serviceProviderId) filters.push({ serviceProviderId: query.serviceProviderId });
    if (query.projectId) {
      filters.push({ assignments: { some: { projectId: query.projectId } } });
    }
    if (query.role) filters.push({ user: { role: query.role } });
    if (query.unassigned) {
      filters.push({ assignments: { none: {} } });
    }
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { employeeCode: { contains: query.search, mode: 'insensitive' } },
          { designation: { contains: query.search, mode: 'insensitive' } },
          { serviceProvider: { name: { contains: query.search, mode: 'insensitive' } } },
          { internalSeniority: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    const where: Prisma.ResourceWhereInput = { AND: filters };
    const sortBy = query.sortBy ?? 'createdAt';
    const orderBy: Prisma.ResourceOrderByWithRelationInput =
      sortBy === 'name' || sortBy === 'type' || sortBy === 'status' || sortBy === 'createdAt'
        ? { [sortBy]: query.sortDir ?? 'desc' }
        : { createdAt: 'desc' };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.resource.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          // `include` only auto-loads scalars, so the service provider relation must be
          // named explicitly or the list shows no service provider at all.
          serviceProvider: { select: { id: true, name: true } },
          user: {
            select: {
              id: true, isActive: true, role: true,
              managedProjects: { select: { project: { select: { id: true, code: true } } } },
            },
          },
          assignments: {
            select: { id: true, project: { select: { id: true, name: true, code: true } } },
          },
          _count: { select: { assignments: true } },
        },
      }),
      this.prisma.resource.count({ where }),
    ]);

    return pageResult(rows, total, page, pageSize);
  }

  async findOne(user: AuthUser, id: string) {
    await this.scope.assertResourceAccess(user, id);
    const resource = await this.prisma.resource.findUnique({ where: { id }, include: DETAIL_INCLUDE });
    if (!resource) throw new NotFoundException('Resource not found.');
    return resource;
  }

  async create(user: AuthUser, dto: CreateResourceDto) {
    // An external resource must name the service provider supplying them; an internal one
    // must not carry a service provider at all.
    const serviceProvider =
      dto.type === ResourceType.EXTERNAL
        ? await this.serviceProviders.resolve({ serviceProviderId: dto.serviceProviderId, serviceProviderName: dto.serviceProviderName })
        : null;
    const email = dto.email.toLowerCase().trim();
    const employeeCode = dto.employeeCode?.trim() || (await this.nextEmployeeCode(dto.type));

    // A PM's request is forced down to RESOURCE, so a PM can only ever add resources.
    const role = this.scope.resolveAssignableRole(user, dto.role);
    if (role !== Role.RESOURCE && dto.createAccount === false) {
      throw new BadRequestException('A Project Manager or Admin needs a login account.');
    }

    const resource = await this.prisma.$transaction(async (tx) => {
      let userId: string | undefined;
      if (dto.createAccount !== false) {
        const account = await tx.user.create({
          data: {
            name: dto.name.trim(),
            email,
            phone: dto.phone,
            role,
            avatarColor: avatarColorFor(email),
            // Default credential; the person is expected to change it on first login.
            passwordHash: await bcrypt.hash(dto.password ?? 'ChangeMe123!', 10),
          },
        });
        userId = account.id;
      }

      return tx.resource.create({
        data: {
          name: dto.name.trim(),
          email,
          employeeCode,
          phone: dto.phone,
          designation: dto.designation,
          jobFunction: dto.jobFunction ?? null,
          location: dto.location,
          type: dto.type,
          serviceProviderId: serviceProvider?.id ?? null,
          // Seniority is ours to set, and only applies to borrowed people.
          internalSeniority:
            dto.type === ResourceType.EXTERNAL ? dto.internalSeniority?.trim() || null : null,
          joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : null,
          notes: dto.notes,
          userId,
          createdById: user.id,
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      actor: user,
      action: 'RESOURCE_CREATED',
      entityType: 'Resource',
      entityId: resource.id,
      summary: `Onboarded ${resource.type === 'SH' ? 'internal' : 'external'} ${
        ROLE_LABEL[role]
      } ${resource.name}${serviceProvider ? ` from ${serviceProvider.name}` : ''}`,
      after: {
        name: resource.name, email: resource.email, type: resource.type,
        serviceProvider: serviceProvider?.name ?? null, internalSeniority: resource.internalSeniority, role,
      },
    });
    return resource;
  }

  async update(user: AuthUser, id: string, dto: UpdateResourceDto) {
    await this.scope.assertResourceWrite(user, id);
    await this.scope.assertTargetIsPlainResource(user, id);
    const existing = await this.prisma.resource.findUnique({
      where: { id },
      include: { user: { select: { id: true, role: true } } },
    });
    if (!existing) throw new NotFoundException('Resource not found.');

    // Authority changes are Admin-only, and can't orphan managed projects.
    let nextRole: Role | undefined;
    // Resetting someone else's password is an account-recovery action, not part
    // of maintaining their HR profile — Admins only. A PM still sets the initial
    // password when they onboard someone; changing it afterwards is not theirs.
    if (dto.password && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Only an Admin can reset another person\'s password.');
    }

    if (dto.role && existing.user && dto.role !== existing.user.role) {
      nextRole = this.scope.resolveAssignableRole(user, dto.role);
      await this.scope.assertRoleChangeSafe(existing.user.id, nextRole);
    }

    const nextType = dto.type ?? existing.type;
    let nextServiceProviderId: string | null = existing.serviceProviderId;
    if (nextType === ResourceType.EXTERNAL) {
      // Only re-resolve when the caller actually sent a service provider; otherwise keep theirs.
      if (dto.serviceProviderId || dto.serviceProviderName) {
        nextServiceProviderId = (
          await this.serviceProviders.resolve({ serviceProviderId: dto.serviceProviderId, serviceProviderName: dto.serviceProviderName })
        ).id;
      } else if (!nextServiceProviderId) {
        throw new BadRequestException('External resources must record the service provider supplying them.');
      }
    } else {
      nextServiceProviderId = null;
    }

    const resource = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.resource.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.email !== undefined ? { email: dto.email.toLowerCase().trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
          ...(dto.designation !== undefined ? { designation: dto.designation } : {}),
          ...(dto.jobFunction !== undefined ? { jobFunction: dto.jobFunction } : {}),
          ...(dto.location !== undefined ? { location: dto.location } : {}),
          ...(dto.type !== undefined ? { type: dto.type } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.joinedAt !== undefined ? { joinedAt: dto.joinedAt ? new Date(dto.joinedAt) : null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          serviceProviderId: nextServiceProviderId,
          internalSeniority:
            nextType === ResourceType.EXTERNAL
              ? dto.internalSeniority !== undefined
                ? dto.internalSeniority.trim() || null
                : existing.internalSeniority
              : null,
        },
        include: DETAIL_INCLUDE,
      });

      // Keep the login account in step with the profile.
      if (updated.userId) {
        await tx.user.update({
          where: { id: updated.userId },
          data: {
            ...(dto.name !== undefined ? { name: updated.name } : {}),
            ...(dto.email !== undefined ? { email: updated.email } : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone } : {}),
            ...(dto.status !== undefined ? { isActive: dto.status === 'ACTIVE' } : {}),
            ...(dto.password ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
            ...(nextRole ? { role: nextRole } : {}),
          },
        });
      }
      return updated;
    });

    await this.audit.record({
      actor: user,
      action: 'RESOURCE_UPDATED',
      entityType: 'Resource',
      entityId: id,
      summary: `Updated resource ${resource.name}`,
      before: {
        name: existing.name, type: existing.type, status: existing.status,
        serviceProviderId: existing.serviceProviderId, internalSeniority: existing.internalSeniority,
        role: existing.user?.role ?? null,
      },
      after: {
        name: resource.name, type: resource.type, status: resource.status,
        serviceProvider: resource.serviceProvider?.name ?? null,
        internalSeniority: resource.internalSeniority,
        role: resource.user?.role ?? existing.user?.role ?? null,
      },
    });
    return resource;
  }

  async remove(user: AuthUser, id: string) {
    await this.scope.assertResourceWrite(user, id);
    await this.scope.assertTargetIsPlainResource(user, id);
    const resource = await this.prisma.resource.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, role: true } },
        _count: { select: { assignments: true } },
      },
    });
    if (!resource) throw new NotFoundException('Resource not found.');
    if (resource.userId === user.id) {
      throw new BadRequestException('You cannot delete your own record.');
    }
    if (resource.user) await this.scope.assertRoleChangeSafe(resource.user.id, Role.RESOURCE);

    await this.prisma.$transaction(async (tx) => {
      await tx.resource.delete({ where: { id } });
      if (resource.userId) await tx.user.delete({ where: { id: resource.userId } });
    });

    await this.audit.record({
      actor: user,
      action: 'RESOURCE_DELETED',
      entityType: 'Resource',
      entityId: id,
      summary: `Removed resource ${resource.name}`,
      before: { name: resource.name, email: resource.email, type: resource.type },
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Project / module assignment
  // -------------------------------------------------------------------------

  /**
   * Placing someone on a project goes through the approval gate, so this is a
   * thin delegation rather than a write. A PM's call returns a PENDING request
   * for an Engineering Manager to decide; an Admin's or the project EM's call
   * returns the assignment itself.
   */
  async assign(user: AuthUser, resourceId: string, dto: AssignResourceDto) {
    return this.assignments.assignOrRequest(user, resourceId, dto);
  }

  async unassign(user: AuthUser, resourceId: string, assignmentId: string) {
    await this.scope.assertResourceWrite(user, resourceId);
    const assignment = await this.prisma.resourceAssignment.findUnique({
      where: { id: assignmentId },
      include: { resource: { select: { name: true } }, project: { select: { name: true } } },
    });
    if (!assignment || assignment.resourceId !== resourceId) {
      throw new NotFoundException('Assignment not found.');
    }
    await this.scope.assertProjectWrite(user, assignment.projectId);

    await this.prisma.resourceAssignment.delete({ where: { id: assignmentId } });
    await this.audit.record({
      actor: user,
      action: 'RESOURCE_UNASSIGNED',
      entityType: 'Resource',
      entityId: resourceId,
      summary: `Removed ${assignment.resource.name} from ${assignment.project.name}`,
      before: { projectId: assignment.projectId, moduleId: assignment.moduleId },
    });
    return { ok: true };
  }

  /** Lightweight list for pickers (task assignee, etc.). */
  async options(user: AuthUser, projectId?: string) {
    const scopeWhere = await this.scope.resourceWhere(user);
    return this.prisma.resource.findMany({
      where: {
        AND: [
          scopeWhere,
          { status: 'ACTIVE' },
          projectId ? { assignments: { some: { projectId } } } : {},
        ],
      },
      select: {
        id: true, name: true, email: true, type: true, serviceProvider: { select: { id: true, name: true } },
        designation: true, jobFunction: true, employeeCode: true, internalSeniority: true,
        user: { select: { id: true, role: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async nextEmployeeCode(type: ResourceType) {
    const prefix = type === ResourceType.SH ? 'SH' : 'EX';
    const count = await this.prisma.resource.count({ where: { type } });
    let n = count + 1;
    // Codes are unique-constrained; step forward on the rare collision.
    for (let i = 0; i < 50; i++) {
      const code = `${prefix}-${String(n).padStart(4, '0')}`;
      const taken = await this.prisma.resource.findUnique({ where: { employeeCode: code } });
      if (!taken) return code;
      n++;
    }
    return `${prefix}-${Date.now()}`;
  }
}
