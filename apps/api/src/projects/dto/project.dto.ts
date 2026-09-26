import { IsArray, IsDateString, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ProjectStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateProjectDto {
  @IsString() @MinLength(2)
  name: string;

  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;

  /** Client is free-text-with-lookup: send an id, or a name to create on the fly. */
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() clientName?: string;

  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;

  /** Admin-only on create; a PM creating a project is auto-assigned to it. */
  @IsOptional() @IsArray() @IsString({ each: true }) managerIds?: string[];
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() clientName?: string;
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}

export class SetManagersDto {
  @IsArray() @IsString({ each: true })
  managerIds: string[];
}

/** Engineering Managers on a project — the people who approve its assignments. */
export class SetEngineersDto {
  @IsArray() @IsString({ each: true })
  engineerIds: string[];
}

export class ProjectQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(ProjectStatus) status?: ProjectStatus;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() managerId?: string;
  @IsOptional() @IsString() engineerId?: string;
}

export class ModuleDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
}

export class SubModuleDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() description?: string;
}
