import {
  ArrayMinSize, IsArray, IsDateString, IsEnum, IsNumber, IsOptional,
  IsString, Min, MinLength, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, InvoiceStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class InvoiceItemDto {
  @IsString() @MinLength(1) description: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) quantity: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) rate: number;
}

export class UpsertInvoiceDto {
  @IsEnum(Currency, { message: 'Currency must be MYR or PKR.' })
  currency: Currency;

  @IsDateString() invoiceDate: string;
  @IsString() @MinLength(3) address: string;
  @IsString() @MinLength(2) bankName: string;
  @IsString() @MinLength(4) accountNumber: string;
  @IsDateString() periodFrom: string;
  @IsDateString() periodTo: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray() @ArrayMinSize(1, { message: 'Add at least one line item.' })
  @ValidateNested({ each: true }) @Type(() => InvoiceItemDto)
  items: InvoiceItemDto[];

  /** Admin only — raise an invoice on behalf of another internal person. */
  @IsOptional() @IsString() userId?: string;
}

export class InvoiceDecisionDto {
  @IsEnum(InvoiceStatus) status: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() note?: string;
}

export class InvoiceQueryDto extends PaginationDto {
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() mine?: boolean;
}
