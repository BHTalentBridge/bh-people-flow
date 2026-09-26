import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class CreateClientDto {
  @IsString() @MinLength(2, { message: 'Client name must be at least 2 characters.' })
  name: string;

  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail({}, { message: 'Enter a valid contact email.' }) contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() contactName?: string;
  @IsOptional() @IsEmail({}, { message: 'Enter a valid contact email.' }) contactEmail?: string;
  @IsOptional() @IsString() contactPhone?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ClientQueryDto extends PaginationDto {}
