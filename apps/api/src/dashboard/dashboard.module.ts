import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [AttendanceModule, InvoicesModule, TasksModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
