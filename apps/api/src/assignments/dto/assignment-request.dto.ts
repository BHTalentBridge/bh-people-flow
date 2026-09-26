import { IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApprovalStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AssignmentRequestQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(ApprovalStatus) status?: ApprovalStatus;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsString() requestedById?: string;
}

export class DecideAssignmentDto {
  @IsIn([ApprovalStatus.APPROVED, ApprovalStatus.REJECTED])
  status: typeof ApprovalStatus.APPROVED | typeof ApprovalStatus.REJECTED;

  /** Sent to the requesting PM in their notification, so it should say why. */
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
