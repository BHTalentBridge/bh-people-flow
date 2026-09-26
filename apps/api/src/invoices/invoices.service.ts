import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Currency, InvoiceStatus, NotificationType, Prisma, ResourceType, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ScopeService } from '../common/scope.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginate, pageResult } from '../common/dto/pagination.dto';
import { InvoiceDecisionDto, InvoiceQueryDto, UpsertInvoiceDto } from './dto/invoice.dto';
import type { AuthUser } from '../common/types';

const INVOICE_INCLUDE = {
  items: { orderBy: { position: 'asc' as const } },
  user: {
    select: {
      id: true, name: true, email: true, role: true, avatarColor: true,
      resource: { select: { id: true, type: true, serviceProvider: { select: { id: true, name: true } }, designation: true, employeeCode: true } },
    },
  },
  decidedBy: { select: { id: true, name: true, role: true } },
} satisfies Prisma.InvoiceInclude;

type InvoiceOwner = {
  id: string;
  name: string;
  email: string;
  role: Role;
  resource: { type: ResourceType; serviceProvider: { name: string } | null } | null;
};

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------------------
  // Who may do what
  //
  //  - Being a payee: whoever's Resource profile says type SH. An *external* PM
  //    borrowed from a service provider bills through their own company, exactly like an
  //    external resource. Admins are never payees — they oversee billing.
  //  - Raising an invoice: for yourself if you're a payee; an Admin raises them
  //    only on someone else's behalf.
  //  - Deciding an invoice: Admin only. Everyone else submits their own.
  // -------------------------------------------------------------------------

  /** Whether this person can be the subject of an invoice at all. */
  private static isPayee(owner: InvoiceOwner): boolean {
    if (owner.role === Role.ADMIN) return false;
    return owner.resource?.type === ResourceType.SH;
  }

  private isApprover(user: AuthUser): boolean {
    return user.role === Role.ADMIN;
  }

  private assertApprover(user: AuthUser) {
    if (!this.isApprover(user)) {
      throw new ForbiddenException('Only Admins can approve or reject invoices.');
    }
  }

  private async loadOwner(userId: string): Promise<InvoiceOwner> {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, role: true,
        resource: { select: { type: true, serviceProvider: { select: { name: true } } } },
      },
    });
    if (!owner) throw new NotFoundException('Account not found.');
    return owner;
  }

  private assertPayee(owner: InvoiceOwner, self: boolean) {
    if (InvoicesService.isPayee(owner)) return;
    if (owner.role === Role.ADMIN) {
      throw new ForbiddenException(
        self
          ? 'Administrators do not raise invoices for themselves — only on behalf of a PM or resource.'
          : 'An administrator cannot be the payee on an invoice.',
      );
    }
    throw new ForbiddenException(
      owner.resource
        ? 'Invoicing is available to internal Steel Horizon people only — external resources bill through their own company.'
        : 'This account has no resource profile, so it cannot be invoiced for.',
    );
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  async list(user: AuthUser, query: InvoiceQueryDto) {
    const { skip, take, page, pageSize } = paginate(query);
    const where = await this.buildWhere(user, query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, skip, take,
        orderBy: { [query.sortBy ?? 'createdAt']: query.sortDir ?? 'desc' },
        include: INVOICE_INCLUDE,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  /**
   * Counts + value by status. Money is grouped **per currency** — adding MYR to
   * PKR would produce a number that means nothing, so there is no single
   * "total value" figure.
   */
  async summary(user: AuthUser, query: InvoiceQueryDto = {}) {
    const where = await this.buildWhere(user, { ...query, status: undefined });
    const grouped = await this.prisma.invoice.groupBy({
      by: ['status', 'currency'],
      where,
      _count: { _all: true },
      _sum: { total: true },
      orderBy: [{ status: 'asc' }, { currency: 'asc' }],
    });

    const zeroTotals = () =>
      Object.fromEntries(Object.values(Currency).map((c) => [c, 0])) as Record<Currency, number>;

    const byStatus = Object.fromEntries(
      Object.values(InvoiceStatus).map((s) => [s, { count: 0, totals: zeroTotals() }]),
    ) as Record<InvoiceStatus, { count: number; totals: Record<Currency, number> }>;

    const totalsByCurrency = zeroTotals();

    for (const row of grouped) {
      const amount = Number(row._sum.total ?? 0);
      const count = row._count._all;
      byStatus[row.status].count += count;
      byStatus[row.status].totals[row.currency] += amount;
      totalsByCurrency[row.currency] += amount;
    }

    return {
      byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b.count, 0),
      totalsByCurrency,
    };
  }

  async findOne(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    this.assertCanRead(user, invoice);
    const history = await this.audit.forEntity('Invoice', id);
    return { ...invoice, history };
  }

  /** Identity + last-used bank details for the create-invoice modal. */
  async prefill(user: AuthUser, userId?: string) {
    const { owner, self } = await this.resolveOwner(user, userId);
    this.assertPayee(owner, self);
    const last = await this.prisma.invoice.findFirst({
      where: { userId: owner.id },
      orderBy: { createdAt: 'desc' },
      select: { address: true, bankName: true, accountNumber: true },
    });
    return {
      userId: owner.id,
      name: owner.name,
      email: owner.email,
      onBehalfOf: !self,
      address: last?.address ?? '',
      bankName: last?.bankName ?? '',
      accountNumber: last?.accountNumber ?? '',
    };
  }

  /**
   * People an invoice can be raised for. Internal (SH) profiles only, Admins
   * excluded, and the caller themselves excluded when they can't self-bill.
   */
  async payees(user: AuthUser) {
    if (!this.isApprover(user)) {
      throw new ForbiddenException('Only Admins can raise invoices for other people.');
    }
    const rows = await this.prisma.user.findMany({
      where: {
        isActive: true,
        role: { not: Role.ADMIN },
        resource: { type: ResourceType.SH, status: 'ACTIVE' },
      },
      select: {
        id: true, name: true, email: true, role: true,
        resource: { select: { employeeCode: true, designation: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      employeeCode: r.resource?.employeeCode ?? null,
      designation: r.resource?.designation ?? null,
    }));
  }

  /** Approval queue size. Only meaningful for an Admin. */
  async pendingCount(user: AuthUser) {
    if (!this.isApprover(user)) return 0;
    return this.prisma.invoice.count({ where: { status: InvoiceStatus.SUBMITTED } });
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  async create(user: AuthUser, dto: UpsertInvoiceDto, submit: boolean) {
    const { owner, self } = await this.resolveOwner(user, dto.userId);
    this.assertPayee(owner, self);
    this.assertPeriod(dto);

    const items = this.normaliseItems(dto);
    const total = items.reduce((sum, i) => sum + i.amount, 0);

    const invoice = await this.prisma.invoice.create({
      data: {
        invoiceNumber: await this.nextInvoiceNumber(),
        userId: owner.id,
        currency: dto.currency,
        status: submit ? InvoiceStatus.SUBMITTED : InvoiceStatus.DRAFT,
        submittedAt: submit ? new Date() : null,
        invoiceDate: new Date(dto.invoiceDate),
        address: dto.address.trim(),
        bankName: dto.bankName.trim(),
        accountNumber: dto.accountNumber.trim(),
        periodFrom: new Date(dto.periodFrom),
        periodTo: new Date(dto.periodTo),
        notes: dto.notes,
        total,
        items: { create: items },
      },
      include: INVOICE_INCLUDE,
    });

    await this.audit.record({
      actor: user,
      action: submit ? 'INVOICE_SUBMITTED' : 'INVOICE_DRAFTED',
      entityType: 'Invoice',
      entityId: invoice.id,
      summary: `${submit ? 'Submitted' : 'Saved draft'} invoice ${invoice.invoiceNumber} for ${owner.name}${
        self ? '' : ` (raised by ${user.name})`
      } — ${dto.currency} ${total.toFixed(2)}`,
      after: {
        invoiceNumber: invoice.invoiceNumber, status: invoice.status,
        currency: dto.currency, total,
      },
    });

    if (submit) await this.notifyAdmins(invoice);
    return invoice;
  }

  async update(user: AuthUser, id: string, dto: UpsertInvoiceDto) {
    const existing = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!existing) throw new NotFoundException('Invoice not found.');
    this.assertCanEdit(user, existing);
    this.assertPeriod(dto);

    if (existing.status !== InvoiceStatus.DRAFT && existing.status !== InvoiceStatus.REJECTED) {
      throw new BadRequestException('Only draft or rejected invoices can be edited.');
    }

    const items = this.normaliseItems(dto);
    const total = items.reduce((sum, i) => sum + i.amount, 0);

    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
      return tx.invoice.update({
        where: { id },
        data: {
          currency: dto.currency,
          invoiceDate: new Date(dto.invoiceDate),
          address: dto.address.trim(),
          bankName: dto.bankName.trim(),
          accountNumber: dto.accountNumber.trim(),
          periodFrom: new Date(dto.periodFrom),
          periodTo: new Date(dto.periodTo),
          notes: dto.notes,
          total,
          // Editing a rejected invoice returns it to draft, ready to resubmit.
          status: InvoiceStatus.DRAFT,
          decidedById: null,
          decidedAt: null,
          decisionNote: null,
          submittedAt: null,
          items: { create: items },
        },
        include: INVOICE_INCLUDE,
      });
    });

    await this.audit.record({
      actor: user,
      action: 'INVOICE_UPDATED',
      entityType: 'Invoice',
      entityId: id,
      summary: `Updated invoice ${invoice.invoiceNumber} — ${dto.currency} ${total.toFixed(2)}`,
      before: { status: existing.status, currency: existing.currency, total: Number(existing.total) },
      after: { status: invoice.status, currency: invoice.currency, total },
    });
    return invoice;
  }

  async submit(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    this.assertCanEdit(user, invoice);

    if (invoice.status === InvoiceStatus.SUBMITTED) {
      throw new BadRequestException('This invoice is already awaiting approval.');
    }
    if (invoice.status === InvoiceStatus.APPROVED) {
      throw new BadRequestException('This invoice has already been approved.');
    }
    if (!invoice.items.length) throw new BadRequestException('Add at least one line item first.');

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: InvoiceStatus.SUBMITTED, submittedAt: new Date() },
      include: INVOICE_INCLUDE,
    });

    await this.audit.record({
      actor: user,
      action: 'INVOICE_SUBMITTED',
      entityType: 'Invoice',
      entityId: id,
      summary: `Submitted invoice ${updated.invoiceNumber} for approval`,
      before: { status: invoice.status },
      after: { status: updated.status, total: Number(updated.total) },
    });

    await this.notifyAdmins(updated);
    return updated;
  }

  async decide(user: AuthUser, id: string, dto: InvoiceDecisionDto) {
    this.assertApprover(user);
    if (dto.status !== InvoiceStatus.APPROVED && dto.status !== InvoiceStatus.REJECTED) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED.');
    }

    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found.');
    if (invoice.status !== InvoiceStatus.SUBMITTED) {
      throw new BadRequestException('Only submitted invoices can be approved or rejected.');
    }
    if (invoice.userId === user.id) {
      throw new BadRequestException('You cannot decide your own invoice.');
    }

    const updated = await this.prisma.invoice.update({
      where: { id },
      data: {
        status: dto.status,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: dto.note,
      },
      include: INVOICE_INCLUDE,
    });

    const verb = dto.status === InvoiceStatus.APPROVED ? 'Approved' : 'Rejected';
    await this.audit.record({
      actor: user,
      action: dto.status === InvoiceStatus.APPROVED ? 'INVOICE_APPROVED' : 'INVOICE_REJECTED',
      entityType: 'Invoice',
      entityId: id,
      summary: `${verb} invoice ${invoice.invoiceNumber} (${invoice.currency} ${Number(invoice.total).toFixed(2)}) for ${invoice.user.name}`,
      before: { status: InvoiceStatus.SUBMITTED },
      after: { status: dto.status, decidedBy: user.name, note: dto.note ?? null },
    });

    await this.notifications.notify(invoice.userId, {
      type: NotificationType.INVOICE_DECIDED,
      title: `Invoice ${invoice.invoiceNumber} was ${dto.status.toLowerCase()}`,
      body: `${verb} by ${user.name}.${dto.note ? ` "${dto.note}"` : ''}`,
      link: '/my-invoices',
    });
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });
    if (!invoice) throw new NotFoundException('Invoice not found.');

    // Owners may bin their own non-approved invoices; only an Admin can remove anyone's.
    if (!this.isApprover(user)) {
      this.assertCanEdit(user, invoice);
      if (invoice.status === InvoiceStatus.APPROVED) {
        throw new BadRequestException('Approved invoices cannot be deleted.');
      }
    }

    await this.prisma.invoice.delete({ where: { id } });
    await this.audit.record({
      actor: user,
      action: 'INVOICE_DELETED',
      entityType: 'Invoice',
      entityId: id,
      summary: `Deleted invoice ${invoice.invoiceNumber} for ${invoice.user.name}`,
      before: {
        invoiceNumber: invoice.invoiceNumber, status: invoice.status,
        currency: invoice.currency, total: Number(invoice.total),
      },
    });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private assertPeriod(dto: UpsertInvoiceDto) {
    if (new Date(dto.periodTo) < new Date(dto.periodFrom)) {
      throw new BadRequestException('Service period end must fall on or after the start.');
    }
  }

  private normaliseItems(dto: UpsertInvoiceDto) {
    return dto.items.map((item, position) => ({
      description: item.description.trim(),
      quantity: new Prisma.Decimal(item.quantity),
      rate: new Prisma.Decimal(item.rate),
      amount: Number((item.quantity * item.rate).toFixed(2)),
      position,
    }));
  }

  /** Everyone raises their own; only an Admin may raise on someone else's behalf. */
  private async resolveOwner(
    user: AuthUser,
    userId?: string,
  ): Promise<{ owner: InvoiceOwner; self: boolean }> {
    if (!userId || userId === user.id) {
      return { owner: await this.loadOwner(user.id), self: true };
    }
    if (!this.isApprover(user)) {
      throw new ForbiddenException('You can only raise invoices for yourself.');
    }
    return { owner: await this.loadOwner(userId), self: false };
  }

  private assertCanRead(user: AuthUser, invoice: { userId: string }) {
    if (this.isApprover(user) || invoice.userId === user.id) return;
    throw new ForbiddenException('You can only view your own invoices.');
  }

  private assertCanEdit(user: AuthUser, invoice: { userId: string }) {
    if (this.isApprover(user) || invoice.userId === user.id) return;
    throw new ForbiddenException('You can only edit your own invoices.');
  }

  private async notifyAdmins(invoice: {
    id: string; invoiceNumber: string; total: Prisma.Decimal | number; userId: string;
    currency: Currency; user: { name: string };
  }) {
    const admins = await this.scope.adminUserIds(invoice.userId);
    await this.notifications.notifyMany(admins, {
      type: NotificationType.INVOICE_SUBMITTED,
      title: `${invoice.user.name} submitted invoice ${invoice.invoiceNumber}`,
      body: `Total ${invoice.currency} ${Number(invoice.total).toFixed(2)} — awaiting your approval.`,
      link: '/invoices?status=SUBMITTED',
    });
  }

  /**
   * Visibility: an Admin sees every invoice; everyone else — PMs included —
   * sees only their own.
   */
  private async buildWhere(user: AuthUser, query: InvoiceQueryDto): Promise<Prisma.InvoiceWhereInput> {
    const filters: Prisma.InvoiceWhereInput[] = [];

    if (!this.isApprover(user)) {
      filters.push({ userId: user.id });
    } else if (query.userId) {
      filters.push({ userId: query.userId });
    }

    if (query.mine) filters.push({ userId: user.id });
    if (query.status) filters.push({ status: query.status });
    if (query.currency) filters.push({ currency: query.currency });
    if (query.from || query.to) {
      filters.push({
        invoiceDate: {
          ...(query.from ? { gte: new Date(query.from) } : {}),
          ...(query.to ? { lte: new Date(query.to) } : {}),
        },
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' } },
          { user: { name: { contains: query.search, mode: 'insensitive' } } },
          { notes: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }

    return filters.length ? { AND: filters } : {};
  }

  private async nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const prefix = `SH-INV-${year}-`;
    const last = await this.prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const next = last ? Number(last.invoiceNumber.slice(prefix.length)) + 1 : 1;
    return `${prefix}${String(next).padStart(4, '0')}`;
  }
}
