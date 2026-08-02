import { IsOptional, IsString, IsUUID } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

export class AdminListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
