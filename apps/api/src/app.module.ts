import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { UsersModule } from './users/users.module';
import { ResourcesModule } from './resources/resources.module';
import { ClientsModule } from './clients/clients.module';
import { ServiceProvidersModule } from './service-providers/service-providers.module';
import { ProjectsModule } from './projects/projects.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { LeaveModule } from './leave/leave.module';
import { AttendanceModule } from './attendance/attendance.module';
import { TasksModule } from './tasks/tasks.module';
import { InvoicesModule } from './invoices/invoices.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ScopeModule } from './common/scope.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    ScopeModule,
    AuditModule,
    NotificationsModule,
    AuthModule,
    UsersModule,
    ResourcesModule,
    ClientsModule,
    ServiceProvidersModule,
    ProjectsModule,
    AssignmentsModule,
    AttendanceModule,
    LeaveModule,
    TasksModule,
    InvoicesModule,
    DashboardModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
