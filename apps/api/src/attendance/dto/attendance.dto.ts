import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApprovalStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CheckInDto {
  @IsOptional() @IsString() note?: string;
  /** Optional override for back-dated entry (Admin/PM correcting a record). */
  @IsOptional() @IsDateString() at?: string;
}

export class CheckOutDto {
  @IsOptional() @IsString() note?: string;
  /** Reason attached to the overtime request raised on checkout. */
  @IsOptional() @IsString() otReason?: string;
  @IsOptional() @IsDateString() at?: string;
}

export class AttendanceQueryDto extends PaginationDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(ApprovalStatus) otStatus?: ApprovalStatus;
}

export class OvertimeQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class OvertimeDecisionDto {
  @IsEnum(ApprovalStatus, { message: 'Decision must be APPROVED or REJECTED.' })
  status: ApprovalStatus;

  @IsOptional() @IsString() note?: string;
}

export class AdjustAttendanceDto {
  @IsOptional() @IsDateString() checkInAt?: string;
  @IsOptional() @IsDateString() checkOutAt?: string;
  @IsOptional() @IsInt() @Min(0) breakMinutes?: number;
  @IsOptional() @IsString() note?: string;
}
