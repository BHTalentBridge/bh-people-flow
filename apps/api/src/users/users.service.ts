import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';


/**
 * Everything about a person — their profile, their access level, whether their
 * account is active, their password — is managed through `ResourcesService`,
 * because everyone is a Resource first and a role second. What's left here is
 * the lookup that populates the manager pickers.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * People available in the project and team manager pickers.
   *
   * **Admins are deliberately excluded.** An Admin already sees and can do
   * everything on every project, so listing them as a candidate PM or EM adds
   * no authority — it only made the same person appear in both pickers, which
   * read as though the two roles were interchangeable. They aren't: a PM
   * requests resources, an EM approves them.
   *
   * `roles` is a CSV of the exact roles to return, defaulting to PM. Anything
   * unrecognised — ADMIN included — is dropped rather than silently widening
   * the list.
   */
  async managerOptions(roles?: string) {
    const ALLOWED: string[] = [Role.PM, Role.EM];
    const requested = (roles ?? '')
      .split(',')
      .map((r) => r.trim().toUpperCase())
      .filter((r): r is Role => ALLOWED.includes(r));

    return this.prisma.user.findMany({
      where: { role: { in: requested.length ? requested : [Role.PM] }, isActive: true },
      select: {
        id: true, name: true, email: true, role: true, avatarColor: true,
        resource: { select: { designation: true, employeeCode: true } },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });
  }

}
