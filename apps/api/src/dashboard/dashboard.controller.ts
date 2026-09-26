import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.dashboard.overview(user);
  }
}
