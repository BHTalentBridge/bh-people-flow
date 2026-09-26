import { IsOptional, IsString, IsDateString } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class AuditQueryDto extends PaginationDto {
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}
