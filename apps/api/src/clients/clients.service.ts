import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ScopeService } from '../common/scope.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { ClientQueryDto, CreateClientDto, UpdateClientDto } from './dto/client.dto';
import type { AuthUser } from '../common/types';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * An Admin sees every client; a PM or EM sees only clients behind their own
   * projects.
   *
   * Goes through `ScopeService.managedProjectIds`, which reads `ProjectManager`
   * for a PM and `ProjectEngineeringManager` for an EM. Deriving it here from
   * `projects.managers` meant an EM matched nothing and saw an empty register.
   */
  private async scopeWhere(user: AuthUser): Promise<Prisma.ClientWhereInput> {
    if (user.role === Role.ADMIN) return {};
    const projectIds = await this.scope.managedProjectIds(user);
    return { projects: { some: { id: { in: projectIds } } } };
  }

  async list(user: AuthUser, query: ClientQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);

    const filters: Prisma.ClientWhereInput[] = [await this.scopeWhere(user)];
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { contactName: { contains: query.search, mode: 'insensitive' } },
          { contactEmail: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    const where: Prisma.ClientWhereInput = { AND: filters };

    const sortBy = query.sortBy === 'name' || query.sortBy === 'createdAt' ? query.sortBy : 'name';
    const [items, total] = await this.prisma.$transaction([
      this.prisma.client.findMany({
        where,
        skip,
        take,
        orderBy: { [sortBy]: query.sortDir ?? (sortBy === 'name' ? 'asc' : 'desc') },
        include: {
          _count: { select: { projects: true } },
          projects: {
            select: { id: true, name: true, code: true, status: true },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.prisma.client.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  /**
   * Lightweight list for the "free-text with lookup" client picker on the
   * project form. Kept separate from `list` so the picker isn't paginated.
   */
  async options(user: AuthUser, search?: string) {
    return this.prisma.client.findMany({
      where: {
        AND: [
          await this.scopeWhere(user),
          search ? { name: { contains: search, mode: 'insensitive' } } : {},
        ],
      },
      select: { id: true, name: true, _count: { select: { projects: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { AND: [{ id }, await this.scopeWhere(user)] },
      include: {
        _count: { select: { projects: true } },
        projects: {
          select: {
            id: true, name: true, code: true, status: true, startDate: true,
            managers: { select: { user: { select: { id: true, name: true, avatarColor: true } } } },
            _count: { select: { tasks: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found.');
    return client;
  }

  async create(user: AuthUser, dto: CreateClientDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);

    const client = await this.prisma.client.create({
      data: {
        name,
        contactName: dto.contactName?.trim() || null,
        contactEmail: dto.contactEmail?.trim().toLowerCase() || null,
        contactPhone: dto.contactPhone?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: { _count: { select: { projects: true } }, projects: true },
    });

    await this.audit.record({
      actor: user,
      action: 'CLIENT_CREATED',
      entityType: 'Client',
      entityId: client.id,
      summary: `Added client ${client.name}`,
      after: { name: client.name, contactName: client.contactName, contactEmail: client.contactEmail },
    });
    return client;
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found.');

    if (dto.name && dto.name.trim() !== existing.name) {
      await this.assertNameFree(dto.name.trim(), id);
    }

    const client = await this.prisma.client.update({
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
      include: { _count: { select: { projects: true } }, projects: true },
    });

    await this.audit.record({
      actor: user,
      action: 'CLIENT_UPDATED',
      entityType: 'Client',
      entityId: id,
      summary: `Updated client ${client.name}`,
      before: {
        name: existing.name, contactName: existing.contactName,
        contactEmail: existing.contactEmail, contactPhone: existing.contactPhone,
      },
      after: {
        name: client.name, contactName: client.contactName,
        contactEmail: client.contactEmail, contactPhone: client.contactPhone,
      },
    });
    return client;
  }

  async remove(user: AuthUser, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: { _count: { select: { projects: true } } },
    });
    if (!client) throw new NotFoundException('Client not found.');

    // Project.clientId is onDelete: Restrict — surface that as readable copy
    // rather than letting the FK error bubble up.
    if (client._count.projects > 0) {
      throw new BadRequestException(
        `${client.name} still has ${client._count.projects} project(s). Reassign or delete those projects first.`,
      );
    }

    await this.prisma.client.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'CLIENT_DELETED',
      entityType: 'Client',
      entityId: id,
      summary: `Deleted client ${client.name}`,
      before: { name: client.name, contactEmail: client.contactEmail },
    });
    return { ok: true };
  }

  /** Used when creating a project: pick an existing client or coin a new one. */
  async findOrCreate(name: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException('Client name is required.');
    const existing = await this.prisma.client.findFirst({
      where: { name: { equals: clean, mode: 'insensitive' } },
    });
    if (existing) return existing;
    return this.prisma.client.create({ data: { name: clean } });
  }

  async resolve(input: { clientId?: string; clientName?: string }) {
    if (input.clientId) {
      const found = await this.prisma.client.findUnique({ where: { id: input.clientId } });
      if (found) return found;
    }
    if (input.clientName) return this.findOrCreate(input.clientName);
    throw new BadRequestException('Pick an existing client or enter a new client name.');
  }

  /** Names are unique case-insensitively, so "Preesoft" and "preesoft" can't fork. */
  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.client.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { name: true },
    });
    if (clash) throw new BadRequestException(`A client named "${clash.name}" already exists.`);
  }
}
