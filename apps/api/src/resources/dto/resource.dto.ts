import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateIf,
} from 'class-validator';
import { ResourceFunction, ResourceStatus, ResourceType, Role } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateResourceDto {
  @IsString() @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() designation?: string;
  /** Roster bucket (Developer, SQA, …). `designation` stays the free-text title. */
  @IsOptional() @IsEnum(ResourceFunction) jobFunction?: ResourceFunction;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() employeeCode?: string;

  @IsEnum(ResourceType)
  type: ResourceType;

  /**
   * Required for EXTERNAL: either pick an existing service provider or type a new name,
   * which is created on the fly (same lookup pattern as the client field).
   */
  @IsOptional() @IsString() serviceProviderId?: string;
  @IsOptional() @IsString() serviceProviderName?: string;

  /** Seniority we assign to an external resource. Ignored for internal ones. */
  @IsOptional() @IsString() internalSeniority?: string;

  @IsOptional() @IsDateString() joinedAt?: string;
  @IsOptional() @IsString() notes?: string;

  /**
   * Authority layered on the profile. Admin-only — a PM's request is forced to
   * RESOURCE, so a PM can never create another PM or an Admin.
   */
  @IsOptional() @IsEnum(Role) role?: Role;

  /** Issue a login account. Defaults to true so the person can check in. */
  @IsOptional() @IsBoolean() createAccount?: boolean = true;
  @IsOptional() @IsString() @MinLength(8) password?: string;
}

export class UpdateResourceDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() designation?: string;
  @IsOptional() @IsEnum(ResourceFunction) jobFunction?: ResourceFunction;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsEnum(ResourceType) type?: ResourceType;
  @IsOptional() @IsString() serviceProviderId?: string;
  @IsOptional() @IsString() serviceProviderName?: string;
  @IsOptional() @IsString() internalSeniority?: string;
  @IsOptional() @IsEnum(ResourceStatus) status?: ResourceStatus;
  @IsOptional() @IsDateString() joinedAt?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;

  /** Change authority. Admin-only. */
  @IsOptional() @IsEnum(Role) role?: Role;
}

export class ResourceQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(ResourceType) type?: ResourceType;
  @IsOptional() @IsEnum(ResourceStatus) status?: ResourceStatus;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() serviceProviderId?: string;
  @IsOptional() @IsEnum(Role) role?: Role;
  /** `true` → only resources with no project placement at all. */
  @IsOptional() @IsBoolean() unassigned?: boolean;
}

export class AssignResourceDto {
  @IsString() projectId: string;
  @IsOptional() @IsString() moduleId?: string;
  @IsOptional() @IsString() subModuleId?: string;

  /**
   * Title held on this project specifically, as opposed to the company-wide
   * `Resource.designation` — so the same person can lead here and develop
   * elsewhere.
   */
  @IsOptional() @IsString() @MaxLength(120) roleOnProject?: string;

  @IsOptional() allocationPct?: number;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;

  /**
   * Why this person is wanted. Only kept when the assignment needs an Engineering
   * Manager's approval — it is what they read before deciding.
   */
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}
