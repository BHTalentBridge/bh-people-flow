import { Injectable } from '@nestjs/common';
import { NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../common/types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Fan a notification out to a set of approvers (PMs + Admins). */
  async notifyMany(
    userIds: string[],
    payload: { type: NotificationType; title: string; body?: string; link?: string },
    tx?: Prisma.TransactionClient,
  ) {
    if (!userIds.length) return;
    const client = tx ?? this.prisma;
    await client.notification.createMany({
      data: userIds.map((userId) => ({ userId, ...payload })),
    });
  }

  async notify(
    userId: string,
    payload: { type: NotificationType; title: string; body?: string; link?: string },
    tx?: Prisma.TransactionClient,
  ) {
    return this.notifyMany([userId], payload, tx);
  }

  async list(user: AuthUser, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: { userId: user.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async unreadCount(user: AuthUser) {
    return { count: await this.prisma.notification.count({ where: { userId: user.id, readAt: null } }) };
  }

  async markRead(user: AuthUser, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  async markAllRead(user: AuthUser) {
    await this.prisma.notification.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
