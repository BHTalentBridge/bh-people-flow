import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/types';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.list(user, unread === 'true');
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notifications.unreadCount(user);
  }

  @Post(':id/read')
  markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }

  @Post('read-all')
  markAllRead(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user);
  }
}
