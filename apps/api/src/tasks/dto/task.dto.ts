import { IsArray, IsDateString, IsEnum, IsOptional, IsString, MinLength, IsUrl } from 'class-validator';
import { TaskPriority, TaskSeverity, TaskStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateTaskDto {
  @IsString() @MinLength(2) title: string;
  @IsOptional() @IsString() description?: string;

  @IsString() projectId: string;
  @IsOptional() @IsString() moduleId?: string;
  @IsOptional() @IsString() subModuleId?: string;

  /** Omit to assign to yourself. PMs may only target resources on their projects. */
  @IsOptional() @IsString() assigneeId?: string;

  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  /** How bad the problem is — separate axis from priority. */
  @IsOptional() @IsEnum(TaskSeverity) severity?: TaskSeverity;
  @IsOptional() @IsDateString() dueDate?: string;

  // Ticket-system mirror — metadata only, captured by hand.
  @IsOptional() @IsString() ticketId?: string;
  @IsOptional() @IsString() ticketUrl?: string;
  @IsOptional() @IsString() mrUrl?: string;
  @IsOptional() @IsString() mrTitle?: string;
}

export class UpdateTaskDto {
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() moduleId?: string;
  @IsOptional() @IsString() subModuleId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  /** How bad the problem is — separate axis from priority. */
  @IsOptional() @IsEnum(TaskSeverity) severity?: TaskSeverity;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() ticketId?: string;
  @IsOptional() @IsString() ticketUrl?: string;
  @IsOptional() @IsString() mrUrl?: string;
  @IsOptional() @IsString() mrTitle?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus) status: TaskStatus;
  @IsOptional() @IsString() note?: string;
}

export class TaskQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(TaskPriority) priority?: TaskPriority;
  /** How bad the problem is — separate axis from priority. */
  @IsOptional() @IsEnum(TaskSeverity) severity?: TaskSeverity;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() moduleId?: string;
  @IsOptional() @IsString() subModuleId?: string;
  @IsOptional() @IsString() assigneeId?: string;
  @IsOptional() @IsDateString() dueFrom?: string;
  @IsOptional() @IsDateString() dueTo?: string;
  /** `true` → past due and not Done. */
  @IsOptional() overdue?: boolean;
  /** `true` → only tasks assigned to the caller. */
  @IsOptional() mine?: boolean;
}
