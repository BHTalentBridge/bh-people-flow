import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ResourcesService } from './resources.service';
import {
  AssignResourceDto, CreateResourceDto, ResourceQueryDto, UpdateResourceDto,
} from './dto/resource.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('resources')
@Roles(Role.ADMIN, Role.PM, Role.EM)
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: ResourceQueryDto) {
    return this.resources.list(user, query);
  }

  @Get('options')
  options(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    return this.resources.options(user, projectId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resources.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateResourceDto) {
    return this.resources.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.resources.update(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.resources.remove(user, id);
  }

  @Post(':id/assignments')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignResourceDto) {
    return this.resources.assign(user, id, dto);
  }

  @Delete(':id/assignments/:assignmentId')
  unassign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.resources.unassign(user, id, assignmentId);
  }
}
