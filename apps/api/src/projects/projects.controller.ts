import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProjectsService } from './projects.service';
import {
  CreateProjectDto, ModuleDto, ProjectQueryDto, SetEngineersDto, SetManagersDto, SubModuleDto,
  UpdateProjectDto,
} from './dto/project.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /**
   * The manager's project list. A resource uses `GET /projects/mine` instead —
   * this payload carries managers, engineers and counts, which is not theirs to
   * read.
   */
  @Get()
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  list(@CurrentUser() user: AuthUser, @Query() query: ProjectQueryDto) {
    return this.projects.list(user, query);
  }

  /**
   * A resource's own read-only view of where they're placed. Declared before
   * `:id` so 'mine' isn't swallowed as a project id.
   */
  @Get('mine')
  myProjects(@CurrentUser() user: AuthUser) {
    return this.projects.myProjects(user);
  }

  @Get('options')
  options(@CurrentUser() user: AuthUser) {
    return this.projects.options(user);
  }

  @Get('modules/:moduleId/detail')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  moduleDetail(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string) {
    return this.projects.moduleDetail(user, moduleId);
  }

  @Get('sub-modules/:subModuleId/detail')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  subModuleDetail(@CurrentUser() user: AuthUser, @Param('subModuleId') subModuleId: string) {
    return this.projects.subModuleDetail(user, subModuleId);
  }

  /** People on this project, one entry per person. */
  @Get(':id/resources')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  projectResources(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.projectResources(user, id);
  }

  /** Resources not yet on this project, for the assign-resource picker. */
  /**
   * Candidates for a specific placement. `moduleId`/`subModuleId` matter: only
   * the exact placement is excluded, so someone already on the project at large
   * still appears when you're placing people on a module.
   */
  @Get(':id/available-resources')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  availableResources(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('moduleId') moduleId?: string,
    @Query('subModuleId') subModuleId?: string,
  ) {
    return this.projects.availableResources(user, id, moduleId, subModuleId);
  }

  /**
   * Full project detail — managers, engineers, every placement, and the pending
   * assignment requests. Manager-only: a resource placed on the project could
   * previously read all of it, including who was awaiting approval. Their
   * read-only view is `GET /projects/mine`.
   */
  @Get(':id')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.findOne(user, id);
  }

  @Post()
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Patch(':id')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.projects.update(user, id, dto);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.projects.remove(user, id);
  }

  @Put(':id/managers')
  @Roles(Role.ADMIN)
  setManagers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetManagersDto) {
    return this.projects.setManagers(user, id, dto);
  }

  /** Who signs off this project's resource assignments. Admin-only, like PMs. */
  @Put(':id/engineers')
  @Roles(Role.ADMIN)
  setEngineers(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: SetEngineersDto) {
    return this.projects.setEngineers(user, id, dto);
  }

  @Post(':id/modules')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  addModule(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ModuleDto) {
    return this.projects.addModule(user, id, dto);
  }

  @Patch('modules/:moduleId')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  updateModule(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string, @Body() dto: ModuleDto) {
    return this.projects.updateModule(user, moduleId, dto);
  }

  @Delete('modules/:moduleId')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  removeModule(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string) {
    return this.projects.removeModule(user, moduleId);
  }

  @Post('modules/:moduleId/sub-modules')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  addSubModule(@CurrentUser() user: AuthUser, @Param('moduleId') moduleId: string, @Body() dto: SubModuleDto) {
    return this.projects.addSubModule(user, moduleId, dto);
  }

  @Delete('sub-modules/:subModuleId')
  @Roles(Role.ADMIN, Role.PM, Role.EM)
  removeSubModule(@CurrentUser() user: AuthUser, @Param('subModuleId') subModuleId: string) {
    return this.projects.removeSubModule(user, subModuleId);
  }
}
