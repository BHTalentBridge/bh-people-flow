import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { TasksService } from './tasks.service';
import { buildTasksWorkbook } from './tasks-export';
import { CreateTaskDto, TaskQueryDto, UpdateTaskDto, UpdateTaskStatusDto } from './dto/task.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: TaskQueryDto) {
    return this.tasks.list(user, query);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser, @Query() query: TaskQueryDto) {
    return this.tasks.stats(user, query);
  }

  /**
   * Excel export of the current view — same filters, same scoping, no paging.
   * Open to every role: the rows are already limited to what the caller can
   * see, so a resource exports their own tasks and an Admin exports all of
   * them. Declared before `:id` so 'export' isn't read as a task id.
   */
  @Get('export')
  async exportXlsx(
    @CurrentUser() user: AuthUser,
    @Query() query: TaskQueryDto,
    @Res() res: Response,
  ) {
    const rows = await this.tasks.exportRows(user, query);
    const filters = Object.entries({
      search: query.search,
      status: query.status,
      priority: query.priority,
      severity: query.severity,
      project: query.projectId,
      module: query.moduleId,
      subModule: query.subModuleId,
      assignee: query.assigneeId,
      dueFrom: query.dueFrom,
      dueTo: query.dueTo,
      overdue: query.overdue,
      mine: query.mine,
    })
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');

    const wb = await buildTasksWorkbook(rows as any, {
      generatedBy: `${user.name} (${user.role})`,
      filters,
    });

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="tasks-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }

  @Get('assignee-options')
  assigneeOptions(@CurrentUser() user: AuthUser, @Query('projectId') projectId?: string) {
    return this.tasks.assigneeOptions(user, projectId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.findOne(user, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasks.update(user, id, dto);
  }

  @Patch(':id/status')
  changeStatus(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateTaskStatusDto) {
    return this.tasks.changeStatus(user, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tasks.remove(user, id);
  }
}
