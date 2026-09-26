import { Controller, Get, Param, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuditService } from './audit.service';
import { AuditQueryDto } from './dto/audit-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('audit')
@Roles(Role.ADMIN, Role.PM, Role.EM)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: AuditQueryDto) {
    return this.audit.list(user, query);
  }

  @Get('actions')
  actions(@CurrentUser() user: AuthUser) {
    return this.audit.actions(user);
  }

  @Get(':entityType/:entityId')
  forEntity(@Param('entityType') entityType: string, @Param('entityId') entityId: string) {
    return this.audit.forEntity(entityType, entityId);
  }
}
