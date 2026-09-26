import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClientsService } from './clients.service';
import { ClientQueryDto, CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  /** Picker for the project form — a PM needs this to choose a client. */
  @Get('options')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  options(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.clients.options(user, search);
  }

  @Get()
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  list(@CurrentUser() user: AuthUser, @Query() query: ClientQueryDto) {
    return this.clients.list(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.findOne(user, id);
  }

  // Managing the client register itself is Admin-only. A PM can still coin a new
  // client implicitly by typing a name on the project form.
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateClientDto) {
    return this.clients.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clients.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.clients.remove(user, id);
  }
}
