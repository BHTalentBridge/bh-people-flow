import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { InvoicesService } from './invoices.service';
import { InvoiceDecisionDto, InvoiceQueryDto, UpsertInvoiceDto } from './dto/invoice.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: InvoiceQueryDto) {
    return this.invoices.list(user, query);
  }

  @Get('summary')
  summary(@CurrentUser() user: AuthUser, @Query() query: InvoiceQueryDto) {
    return this.invoices.summary(user, query);
  }

  /** Identity + last-used bank details for the create-invoice modal. */
  @Get('prefill')
  prefill(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.invoices.prefill(user, userId);
  }

  /** Who an Admin may raise an invoice for. */
  @Get('payees')
  @Roles(Role.ADMIN)
  payees(@CurrentUser() user: AuthUser) {
    return this.invoices.payees(user);
  }

  @Get('pending-count')
  @Roles(Role.ADMIN)
  pendingCount(@CurrentUser() user: AuthUser) {
    return this.invoices.pendingCount(user).then((count) => ({ count }));
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.findOne(user, id);
  }

  /** Save as draft. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertInvoiceDto) {
    return this.invoices.create(user, dto, false);
  }

  /** Create and submit to the manager in one step. */
  @Post('submit')
  createAndSubmit(@CurrentUser() user: AuthUser, @Body() dto: UpsertInvoiceDto) {
    return this.invoices.create(user, dto, true);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpsertInvoiceDto) {
    return this.invoices.update(user, id, dto);
  }

  @Post(':id/submit')
  submit(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.submit(user, id);
  }

  @Post(':id/decision')
  @Roles(Role.ADMIN)
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: InvoiceDecisionDto) {
    return this.invoices.decide(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invoices.remove(user, id);
  }
}
