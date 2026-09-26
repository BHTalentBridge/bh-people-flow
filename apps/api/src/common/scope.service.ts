import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './types';

/**
 * Central place for the "who can see what" rules from the permission matrix.
 *
 *  - ADMIN  — unrestricted, globally.
 *  - PM     — sandboxed to projects assigned to them, plus resources they created.
 *  - EM     — same project sandbox as a PM, via ProjectEngineeringManager instead
 *             of ProjectManager, plus authority to decide assignment requests on
 *             those projects.
 *  - RESOURCE — their own records only.
 *
 * Every list/read/write path in the API funnels through here so the scoping rule
 * lives in exactly one place.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  isAdmin(user: AuthUser) {
    return user.role === Role.ADMIN;
  }

  /** Roles that run projects: Admin globally, PM and EM within their own. */
  isManager(user: AuthUser) {
    return user.role === Role.ADMIN || user.role === Role.PM || user.role === Role.EM;
  }

  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  /**
   * Project ids the user is bound to — managed (PM), engineered (EM), or worked
   * on (Resource). Admin is unrestricted and never asks.
   */
  async managedProjectIds(user: AuthUser): Promise<string[]> {
    if (user.role === Role.RESOURCE) {
      if (!user.resourceId) return [];
      const assignments = await this.prisma.resourceAssignment.findMany({
        where: { resourceId: user.resourceId },
        select: { projectId: true },
      });
      return [...new Set(assignments.map((a) => a.projectId))];
    }
    if (user.role === Role.EM) {
      const rows = await this.prisma.projectEngineeringManager.findMany({
        where: { userId: user.id },
        select: { projectId: true },
      });
      return rows.map((r) => r.projectId);
    }
    const rows = await this.prisma.projectManager.findMany({
      where: { userId: user.id },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }

  /** Prisma `where` fragment restricting a Project query to what the user may see. */
  async projectWhere(user: AuthUser): Promise<Prisma.ProjectWhereInput> {
    if (this.isAdmin(user)) return {};
    const ids = await this.managedProjectIds(user);
    return { id: { in: ids } };
  }

  async assertProjectAccess(user: AuthUser, projectId: string) {
    if (this.isAdmin(user)) return;
    const managed = await this.managedProjectIds(user);
    if (!managed.includes(projectId)) {
      throw new ForbiddenException('This project is outside your scope.');
    }
  }

  /** Write access to a project's structure (modules, assignments). */
  async assertProjectWrite(user: AuthUser, projectId: string) {
    if (this.isAdmin(user)) return;
    if (user.role !== Role.PM && user.role !== Role.EM) {
      throw new ForbiddenException('Only Admins, PMs and EMs can modify project structure.');
    }
    const managed = await this.managedProjectIds(user);
    if (!managed.includes(projectId)) {
      throw new ForbiddenException('You can only modify projects assigned to you.');
    }
  }

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  /**
   * A PM sees resources they created *or* resources placed on one of their
   * projects.
   */
  async resourceWhere(user: AuthUser): Promise<Prisma.ResourceWhereInput> {
    if (this.isAdmin(user)) return {};
    if (user.role === Role.RESOURCE) {
      return { id: user.resourceId ?? '__none__' };
    }
    const projectIds = await this.managedProjectIds(user);
    return {
      OR: [
        { createdById: user.id },
        { assignments: { some: { projectId: { in: projectIds } } } },
      ],
    };
  }

  async assertResourceAccess(user: AuthUser, resourceId: string) {
    if (this.isAdmin(user)) return;
    const where = await this.resourceWhere(user);
    const found = await this.prisma.resource.findFirst({
      where: { AND: [{ id: resourceId }, where] },
      select: { id: true },
    });
    if (!found) throw new ForbiddenException('This resource is outside your scope.');
  }

  async assertResourceWrite(user: AuthUser, resourceId: string) {
    if (this.isAdmin(user)) return;
    if (user.role !== Role.PM && user.role !== Role.EM) {
      throw new ForbiddenException('Only Admins, PMs and EMs manage resources.');
    }
    await this.assertResourceAccess(user, resourceId);
  }

  /** User ids belonging to resources within scope, plus the caller themselves. */
  async scopedUserIds(user: AuthUser): Promise<string[] | null> {
    if (this.isAdmin(user)) return null; // null = unrestricted
    if (user.role === Role.RESOURCE) return [user.id];

    const where = await this.resourceWhere(user);
    const resources = await this.prisma.resource.findMany({
      where,
      select: { userId: true },
    });
    return [
      ...new Set([user.id, ...resources.map((r) => r.userId).filter((id): id is string => !!id)]),
    ];
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async resourceIdForUser(userId: string): Promise<string | null> {
    const r = await this.prisma.resource.findUnique({
      where: { userId },
      select: { id: true },
    });
    return r?.id ?? null;
  }

  /** Active Admin accounts — the only people who decide invoices. */
  async adminUserIds(excludeUserId?: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
    return admins.map((a) => a.id).filter((id) => id !== excludeUserId);
  }

  /** PMs + EMs + Admins who should be notified about a given resource's overtime. */
  async approversForUser(userId: string): Promise<string[]> {
    const admins = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, isActive: true },
      select: { id: true },
    });

    const resource = await this.prisma.resource.findUnique({
      where: { userId },
      select: { assignments: { select: { projectId: true } } },
    });

    const projectIds = [...new Set(resource?.assignments.map((a) => a.projectId) ?? [])];

    const [pms, ems] = projectIds.length
      ? await Promise.all([
          this.prisma.projectManager.findMany({
            where: { projectId: { in: projectIds } },
            select: { userId: true },
          }),
          this.prisma.projectEngineeringManager.findMany({
            where: { projectId: { in: projectIds } },
            select: { userId: true },
          }),
        ])
      : [[], []];

    return [
      ...new Set([
        ...admins.map((a) => a.id),
        ...pms.map((p) => p.userId),
        ...ems.map((e) => e.userId),
      ]),
    ].filter((id) => id !== userId);
  }

  // -------------------------------------------------------------------------
  // Assignment approval
  //
  // Placing a resource on a project is a PM action that an Engineering Manager
  // signs off. The three questions below are the whole rule, and every path that
  // creates or decides an assignment asks them here.
  // -------------------------------------------------------------------------

  /** Active EMs attached to a project. */
  async engineeringManagerIds(projectId: string): Promise<string[]> {
    const rows = await this.prisma.projectEngineeringManager.findMany({
      where: { projectId, user: { isActive: true } },
      select: { userId: true },
    });
    return rows.map((r) => r.userId);
  }

  /**
   * May this person decide an assignment request on this project? An Admin
   * always; an EM only on projects they hold. A PM never — that's the point.
   */
  async canDecideAssignment(user: AuthUser, projectId: string): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (user.role !== Role.EM) return false;
    const ems = await this.engineeringManagerIds(projectId);
    return ems.includes(user.id);
  }

  async assertCanDecideAssignment(user: AuthUser, projectId: string) {
    if (!(await this.canDecideAssignment(user, projectId))) {
      throw new ForbiddenException(
        'Only an Engineering Manager on this project (or an Admin) can decide this request.',
      );
    }
  }

  /**
   * Does this person's assignment need signing off, or does it take effect now?
   * Anyone who could approve the request approves it by making it — an Admin, or
   * an EM on the project itself.
   */
  async needsAssignmentApproval(user: AuthUser, projectId: string): Promise<boolean> {
    return !(await this.canDecideAssignment(user, projectId));
  }

  /**
   * Who to route an assignment request to: the project's EMs. A project with no
   * EM yet falls back to Admins rather than blocking the PM — the request is
   * still decided by someone, it just isn't an EM.
   */
  async assignmentApprovers(projectId: string, excludeUserId?: string): Promise<string[]> {
    const ems = await this.engineeringManagerIds(projectId);
    const ids = ems.length ? ems : await this.adminUserIds();
    return ids.filter((id) => id !== excludeUserId);
  }

  // -------------------------------------------------------------------------
  // Leave approval
  //
  // Leave is raised by a resource and decided by *either* an Engineering Manager
  // on one of their projects or an Admin — whoever gets there first settles it.
  // A PM is deliberately not an approver, though they can see leave for people
  // in their scope so it shows up in their planning.
  // -------------------------------------------------------------------------

  /** Project ids a resource is placed on, via assignment or team membership. */
  async projectIdsForResource(resourceId: string): Promise<string[]> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { assignments: { select: { projectId: true } } },
    });
    return [...new Set(resource?.assignments.map((a) => a.projectId) ?? [])];
  }

  /** May this person decide leave for this resource? */
  async canDecideLeave(user: AuthUser, resourceId: string): Promise<boolean> {
    if (this.isAdmin(user)) return true;
    if (user.role !== Role.EM) return false;
    const [theirs, mine] = await Promise.all([
      this.projectIdsForResource(resourceId),
      this.managedProjectIds(user),
    ]);
    return theirs.some((id) => mine.includes(id));
  }

  async assertCanDecideLeave(user: AuthUser, resourceId: string) {
    if (!(await this.canDecideLeave(user, resourceId))) {
      throw new ForbiddenException(
        'Only an Engineering Manager on one of their projects, or an Admin, can decide this leave request.',
      );
    }
  }

  /**
   * Who to notify about a resource's leave: the EMs on their projects, plus
   * every Admin. Admins are always included rather than being a fallback — they
   * are approvers in their own right here.
   */
  async leaveApprovers(resourceId: string, excludeUserId?: string): Promise<string[]> {
    const projectIds = await this.projectIdsForResource(resourceId);
    const [ems, admins] = await Promise.all([
      projectIds.length
        ? this.prisma.projectEngineeringManager.findMany({
            where: { projectId: { in: projectIds }, user: { isActive: true } },
            select: { userId: true },
          })
        : Promise.resolve([]),
      this.adminUserIds(),
    ]);
    return [...new Set([...ems.map((e) => e.userId), ...admins])].filter((id) => id !== excludeUserId);
  }

  /**
   * Resource ids whose leave this person may *see*. `null` means unrestricted.
   * A resource sees their own; a PM or EM sees people in their project scope.
   */
  async leaveVisibleResourceIds(user: AuthUser): Promise<string[] | null> {
    if (this.isAdmin(user)) return null;
    if (user.role === Role.RESOURCE) return user.resourceId ? [user.resourceId] : [];

    const projectIds = await this.managedProjectIds(user);
    const rows = await this.prisma.resource.findMany({
      where: { assignments: { some: { projectId: { in: projectIds } } } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  // -------------------------------------------------------------------------
  // Role assignment
  //
  // Role is *authority*, layered on top of a person's Resource profile. Only an
  // Admin may hand out authority; a PM creates and edits plain resources only.
  // -------------------------------------------------------------------------

  /** The role an actor is allowed to give someone, given what they asked for. */
  resolveAssignableRole(actor: AuthUser, requested?: Role | null): Role {
    if (!requested || requested === Role.RESOURCE) return Role.RESOURCE;
    if (actor.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Only Admins can grant Project Manager, Engineering Manager or Administrator access.',
      );
    }
    return requested;
  }

  /** A PM may manage plain resources only — never another PM or an Admin. */
  async assertTargetIsPlainResource(actor: AuthUser, resourceId: string) {
    if (actor.role === Role.ADMIN) return;
    const target = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { name: true, user: { select: { id: true, role: true } } },
    });
    if (!target) throw new NotFoundException('Resource not found.');
    if (target.user && target.user.role !== Role.RESOURCE && target.user.id !== actor.id) {
      throw new ForbiddenException(
        `${target.name} holds ${target.user.role} access — only an Admin can manage them.`,
      );
    }
  }

  /**
   * Demoting someone who still manages projects would orphan those projects, so
   * block it and make the Admin reassign first.
   */
  async assertRoleChangeSafe(userId: string, nextRole: Role) {
    // Promoting to Admin is always safe — an Admin sees every project regardless
    // of which table binds them to it.
    if (nextRole === Role.ADMIN) return;

    // Both directions matter: a PM holding projects can't become an EM either,
    // because the two are scoped through different tables — the projects would
    // silently drop out of their view while still naming them as manager.
    const [managed, engineered] = await Promise.all([
      this.prisma.projectManager.count({ where: { userId } }),
      this.prisma.projectEngineeringManager.count({ where: { userId } }),
    ]);

    if (nextRole !== Role.PM && managed > 0) {
      throw new BadRequestException(
        `This person still manages ${managed} project(s) as a PM. Reassign those projects before changing their access.`,
      );
    }
    if (nextRole !== Role.EM && engineered > 0) {
      throw new BadRequestException(
        `This person is still the Engineering Manager on ${engineered} project(s). Reassign those projects before changing their access.`,
      );
    }
  }

  async requireEntity<T>(entity: T | null, name = 'Record'): Promise<T> {
    if (!entity) throw new NotFoundException(`${name} not found.`);
    return entity;
  }
}
