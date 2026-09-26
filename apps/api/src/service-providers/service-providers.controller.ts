import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ServiceProvidersService } from './service-providers.service';
import { CreateServiceProviderDto, ServiceProviderQueryDto, UpdateServiceProviderDto } from './dto/service-provider.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('service-providers')
export class ServiceProvidersController {
  constructor(private readonly serviceProviders: ServiceProvidersService) {}

  /** Picker for the resource form — a PM needs this to onboard an external resource. */
  @Get('options')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  options(@CurrentUser() user: AuthUser, @Query('search') search?: string) {
    return this.serviceProviders.options(user, search);
  }

  @Get()
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  list(@CurrentUser() user: AuthUser, @Query() query: ServiceProviderQueryDto) {
    return this.serviceProviders.list(user, query);
  }

  @Get(':id')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceProviders.findOne(user, id);
  }

  // The service provider register is Admin-only; a PM can still coin one implicitly by
  // typing a name when onboarding an external resource.
  @Post()
  @Roles(Role.ADMIN)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateServiceProviderDto) {
    return this.serviceProviders.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateServiceProviderDto) {
    return this.serviceProviders.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.serviceProviders.remove(user, id);
  }
}
