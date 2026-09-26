import { IsDateString, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalStatus, LeaveType } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateLeaveDto {
  @IsEnum(LeaveType) type: LeaveType;

  @IsDateString() startDate: string;
  @IsDateString() endDate: string;

  /** Why they're away. Required for OTHER, since the type says nothing on its own. */
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class LeaveQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @IsOptional() @IsEnum(LeaveType) type?: LeaveType;
  @IsOptional() @IsString() resourceId?: string;
  /** Overlap window — matches any request touching these dates. */
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class LeaveDecisionDto {
  @IsIn([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  status: typeof ApprovalStatus.APPROVED | typeof ApprovalStatus.REJECTED;

  /** Sent to the resource in their notification, so it should say why. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
