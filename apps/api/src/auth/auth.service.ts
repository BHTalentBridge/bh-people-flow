import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';
import type { AuthUser } from '../common/types';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      include: { resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } } } } },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (!user.isActive) throw new UnauthorizedException('This account has been deactivated.');

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, role: user.role }),
      user: this.publicUser(user),
    };
  }

  async me(authUser: AuthUser) {
    const user = await this.prisma.user.findUnique({
      where: { id: authUser.id },
      include: { resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } } } } },
    });
    if (!user) throw new UnauthorizedException();
    return this.publicUser(user);
  }

  async changePassword(authUser: AuthUser, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: authUser.id } });
    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await bcrypt.hash(dto.newPassword, 10) },
    });
    return { ok: true };
  }

  private publicUser(user: any) {
    const isAdmin = user.role === Role.ADMIN;

    // Eligibility to bill is a property of the person: internal (SH) profile → yes,
    // external or no profile → no. So an external PM is excluded like an external
    // resource. Admins are excluded outright — they oversee billing, they don't
    // bill, but they may raise an invoice on someone else's behalf.
    const canInvoice = !isAdmin && user.resource?.type === 'SH';

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      avatarColor: user.avatarColor,
      resourceId: user.resource?.id ?? null,
      resourceType: user.resource?.type ?? null,
      company: user.resource?.serviceProvider?.name ?? null,
      canInvoice,
      /** Only Admins decide invoices; everyone else submits their own. */
      canApproveInvoices: isAdmin,
      /**
       * Resource assignments are signed off by the project's Engineering Manager.
       * Whether *this* project is theirs is checked per request server-side; this
       * flag only decides whether the queue is worth showing them at all.
       */
      canApproveAssignments: isAdmin || user.role === Role.EM,
      /** Admins can raise an invoice for another person, never for themselves. */
      canRaiseForOthers: isAdmin,
      /** Admins oversee attendance rather than record it, so they don't clock in. */
      canCheckIn: !isAdmin,
    };
  }
}
