import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200)
  pageSize?: number = 25;

  @IsOptional() @IsString()
  search?: string;

  @IsOptional() @IsString()
  sortBy?: string;

  @IsOptional() @IsString()
  sortDir?: 'asc' | 'desc';
}

export function paginate(dto: PaginationDto) {
  const page = dto.page && dto.page > 0 ? dto.page : 1;
  const pageSize = dto.pageSize && dto.pageSize > 0 ? dto.pageSize : 25;
  return { skip: (page - 1) * pageSize, take: pageSize, page, pageSize };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
