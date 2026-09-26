import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ResourceStatus, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../common/scope.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { CreateServiceProviderDto, ServiceProviderQueryDto, UpdateServiceProviderDto } from './dto/service-provider.dto';
import type { AuthUser } from '../common/types';

@Injectable()
export class ServiceProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Admin sees every service provider; a PM or EM sees the ones supplying people
   * on their projects, plus any they onboarded themselves.
   *
   * Same fix as the client register: `managedProjectIds` knows PM from EM, while
   * matching on `project.managers` left an EM with an empty list.
   */
  private async scopeWhere(user: AuthUser): Promise<Prisma.ServiceProviderWhereInput> {
    if (user.role === Role.ADMIN) return {};
    const projectIds = await this.scope.managedProjectIds(user);
    return {
      resources: {
        some: {
          OR: [
            { createdById: user.id },
            { assignments: { some: { projectId: { in: projectIds } } } },
          ],
        },
      },
    };
  }

  async list(user: AuthUser, query: ServiceProviderQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);

    const filters: Prisma.ServiceProviderWhereInput[] = [await this.scopeWhere(user)];
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          { contactEmail: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ServiceProviderWhereInput = { AND: filters };

    const sortBy = query.sortBy === 'name' || query.sortBy === 'createdAt' ? query.sortBy : 'name';
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.serviceProvider.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: query.sortDir ?? (sortBy === 'name' ? 'asc' : 'desc') },
        include: {
          _count: { select: { resources: true } },
          resources: {
            select: {
              id: true, name: true, designation: true, status: true, internalSeniority: true,
              // ids are needed because the detail modal renders this list shape
              // first, before its own fetch resolves.
              assignments: { select: { id: true, project: { select: { id: true, code: true } } } },
            },
            orderBy: { name: 'asc' },
          },
        },
      }),
      this.prisma.serviceProvider.count({ where }),
    ]);

    // Which of our projects each service provider's people are actually working on.
    const items = rows.map((p) => {
      const codes = new Set<string>();
      for (const r of p.resources) {
        r.assignments.forEach((a) => codes.add(a.project.code));
      }
      return {
        ...p,
        activeResources: p.resources.filter((r) => r.status === ResourceStatus.ACTIVE).length,
        projectCodes: [...codes].sort(),
      };
    });

    return pageResult(items, total, page, pageSize);
  }

  /** Lightweight list for the service provider picker on the resource form. */
  async options(user: AuthUser, search?: string) {
    return this.prisma.serviceProvider.findMany({
      where: {
        AND: [
          await this.scopeWhere(user),
          search ? { name: { contains: search, mode: 'insensitive' } } : {},
        ],
      },
      select: { id: true, name: true, _count: { select: { resources: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const serviceProvider = await this.prisma.serviceProvider.findFirst({
      where: { AND: [{ id }, await this.scopeWhere(user)] },
      include: {
        _count: { select: { resources: true } },
        resources: {
          select: {
            id: true, name: true, email: true, employeeCode: true, designation: true,
            internalSeniority: true, status: true, joinedAt: true,
            user: { select: { id: true, role: true, isActive: true } },
            assignments: {
              select: {
                id: true,
                roleOnProject: true,
                project: { select: { id: true, name: true, code: true } },
                module: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!serviceProvider) throw new NotFoundException('Service provider not found.');
    return serviceProvider;
  }

  async create(user: AuthUser, dto: CreateServiceProviderDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);

    const serviceProvider = await this.prisma.serviceProvider.create({
      data: {
        name,
        contactName: dto.contactName?.trim() || null,
        contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: { _count: { select: { resources: true } } },
    });

    await this.audit.record({
      actor: user,
      action: 'SERVICE_PROVIDER_CREATED',
      entityType: 'ServiceProvider',
      entityId: serviceProvider.id,
      summary: `Added service provider ${serviceProvider.name}`,
      after: { name: serviceProvider.name, contactName: serviceProvider.contactName, contactEmail: serviceProvider.contactEmail },
    });
    return serviceProvider;
  }

  async update(user: AuthUser, id: string, dto: UpdateServiceProviderDto) {
    const existing = await this.prisma.serviceProvider.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Service provider not found.');
    if (dto.name && dto.name.trim() !== existing.name) await this.assertNameFree(dto.name.trim(), id);

    const serviceProvider = await this.prisma.serviceProvider.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.contactName !== undefined ? { contactName: dto.contactName.trim() || null } : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: dto.contactEmail.trim().toLowerCase() || null }
          : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: dto.contactPhone.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
      },
      include: { _count: { select: { resources: true } } },
    });

    await this.audit.record({
      actor: user,
      action: 'SERVICE_PROVIDER_UPDATED',
      entityType: 'ServiceProvider',
      entityId: id,
      summary: `Updated service provider ${serviceProvider.name}`,
      before: {
        name: existing.name, contactName: existing.contactName,
        contactEmail: existing.contactEmail, contactPhone: existing.contactPhone,
      },
      after: {
        name: serviceProvider.name, contactName: serviceProvider.contactName,
        contactEmail: serviceProvider.contactEmail, contactPhone: serviceProvider.contactPhone,
      },
    });
    return serviceProvider;
  }

  async remove(user: AuthUser, id: string) {
    const serviceProvider = await this.prisma.serviceProvider.findUnique({
      where: { id },
      include: { _count: { select: { resources: true } } },
    });
    if (!serviceProvider) throw new NotFoundException('Service provider not found.');

    // Resource.serviceProviderId is onDelete: Restrict — say so in plain language.
    if (serviceProvider._count.resources > 0) {
      throw new BadRequestException(
        `${serviceProvider.name} still supplies ${serviceProvider._count.resources} resource(s). Remove or reassign those people first.`,
      );
    }

    await this.prisma.serviceProvider.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'SERVICE_PROVIDER_DELETED',
      entityType: 'ServiceProvider',
      entityId: id,
      summary: `Deleted service provider ${serviceProvider.name}`,
      before: { name: serviceProvider.name, contactEmail: serviceProvider.contactEmail },
    });
    return { ok: true };
  }

  /** Lets the resource form coin a new service provider by typing a name, like the client field. */
  async findOrCreate(name: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Service provider name is required.');
    const existing = await this.prisma.serviceProvider.findFirst({
      where: { name: { equals: clean, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return this.prisma.serviceProvider.create({ data: { name: clean } });
  }

  async resolve(input: { serviceProviderId?: string; serviceProviderName?: string }) {
    if (input.serviceProviderId) {
      const found = await this.prisma.serviceProvider.findUnique({ where: { id: input.serviceProviderId } });
      if (found) return found;
      throw new BadRequestException('That service provider no longer exists.');
    }
    if (input.serviceProviderName) return this.findOrCreate(input.serviceProviderName);
    throw new BadRequestException('External resources must record the service provider supplying them.');
  }

  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.serviceProvider.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (clash) throw new BadRequestException(`A service provider named "${clash.name}" already exists.`);
  }
}
