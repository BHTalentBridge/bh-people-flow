import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { AuditQueryDto } from './dto/audit-query.dto';
import type { AuthUser } from '../common/types';

export interface AuditEntry {
  actor: AuthUser;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Append-only trail. Called inside the same request as the mutation it records.
   * Accepts an optional transaction client so the log commits atomically with it.
   */
  async record(entry: AuditEntry, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.auditLog.create({
      data: {
        actorId: entry.actor.id,
        actorName: entry.actor.name,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        before: entry.before ?? Prisma.DbNull,
        after: entry.after ?? Prisma.DbNull,
      },
    });
  }

  async list(user: AuthUser, query: AuditQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);

    const where: Prisma.AuditLogWhereInput = {};
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.actorId) where.actorId = query.actorId;
    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    if (query.search) {
      where.OR = [
        { summary: { contains: query.search, mode: 'insensitive' } },
        { actorName: { contains: query.search, mode: 'insensitive' } },
        { action: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Admin sees the whole trail; a PM sees only actions by people in their scope.
    if (user.role !== Role.ADMIN) {
      const userIds = await this.scope.scopedUserIds(user);
      if (userIds) where.actorId = { in: userIds };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { actor: { select: { id: true, name: true, role: true } } },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return pageResult(items, total, page, pageSize);
  }

  /**
   * Distinct action names for the audit screen's filter dropdown, restricted to
   * the caller's own visible trail.
   *
   * It used to be a global `distinct`, so a PM's dropdown advertised every kind
   * of action anyone in the org had ever taken — and offered filters that could
   * only ever return nothing for them.
   */
  async actions(user: AuthUser) {
    const where: Prisma.AuditLogWhereInput = {};
    if (user.role !== Role.ADMIN) {
      const userIds = await this.scope.scopedUserIds(user);
      if (userIds) where.actorId = { in: userIds };
    }
    const rows = await this.prisma.auditLog.findMany({
      where,
      distinct: ['action'],
      select: { action: true },
      orderBy: { action: 'asc' },
    });
    return rows.map((r) => r.action);
  }

  async forEntity(entityType: string, entityId: string) {
    return this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true, role: true } } },
    });
  }
}
