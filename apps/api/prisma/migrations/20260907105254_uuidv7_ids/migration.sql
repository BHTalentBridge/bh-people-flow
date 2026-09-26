-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_userId_fkey";

-- DropForeignKey
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_actorId_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_userId_fkey";

-- DropForeignKey
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "Module" DROP CONSTRAINT "Module_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_userId_fkey";

-- DropForeignKey
ALTER TABLE "OvertimeRequest" DROP CONSTRAINT "OvertimeRequest_attendanceId_fkey";

-- DropForeignKey
ALTER TABLE "OvertimeRequest" DROP CONSTRAINT "OvertimeRequest_decidedById_fkey";

-- DropForeignKey
ALTER TABLE "Project" DROP CONSTRAINT "Project_clientId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectManager" DROP CONSTRAINT "ProjectManager_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectManager" DROP CONSTRAINT "ProjectManager_userId_fkey";

-- DropForeignKey
ALTER TABLE "Resource" DROP CONSTRAINT "Resource_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Resource" DROP CONSTRAINT "Resource_userId_fkey";

-- DropForeignKey
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_assignedById_fkey";

-- DropForeignKey
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_subModuleId_fkey";

-- DropForeignKey
ALTER TABLE "SubModule" DROP CONSTRAINT "SubModule_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_createdById_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_subModuleId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_managerId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_projectId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";

-- AlterTable
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "AuditLog" DROP CONSTRAINT "AuditLog_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "actorId",
ADD COLUMN     "actorId" UUID,
ADD CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Client" DROP CONSTRAINT "Client_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
ADD CONSTRAINT "Client_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Invoice" DROP CONSTRAINT "Invoice_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "decidedById",
ADD COLUMN     "decidedById" UUID,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "InvoiceItem" DROP CONSTRAINT "InvoiceItem_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "invoiceId",
ADD COLUMN     "invoiceId" UUID NOT NULL,
ADD CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Module" DROP CONSTRAINT "Module_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
ADD CONSTRAINT "Module_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "Notification_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "OvertimeRequest" DROP CONSTRAINT "OvertimeRequest_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "attendanceId",
ADD COLUMN     "attendanceId" UUID NOT NULL,
DROP COLUMN "decidedById",
ADD COLUMN     "decidedById" UUID,
ADD CONSTRAINT "OvertimeRequest_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Project" DROP CONSTRAINT "Project_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "clientId",
ADD COLUMN     "clientId" UUID NOT NULL,
ADD CONSTRAINT "Project_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ProjectManager" DROP CONSTRAINT "ProjectManager_pkey",
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID NOT NULL,
ADD CONSTRAINT "ProjectManager_pkey" PRIMARY KEY ("projectId", "userId");

-- AlterTable
ALTER TABLE "Resource" DROP CONSTRAINT "Resource_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "userId",
ADD COLUMN     "userId" UUID,
DROP COLUMN "createdById",
ADD COLUMN     "createdById" UUID,
ADD CONSTRAINT "Resource_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "ResourceAssignment" DROP CONSTRAINT "ResourceAssignment_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "resourceId",
ADD COLUMN     "resourceId" UUID NOT NULL,
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "moduleId",
ADD COLUMN     "moduleId" UUID,
DROP COLUMN "subModuleId",
ADD COLUMN     "subModuleId" UUID,
DROP COLUMN "assignedById",
ADD COLUMN     "assignedById" UUID,
ADD CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SubModule" DROP CONSTRAINT "SubModule_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "moduleId",
ADD COLUMN     "moduleId" UUID NOT NULL,
ADD CONSTRAINT "SubModule_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Task" DROP CONSTRAINT "Task_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "moduleId",
ADD COLUMN     "moduleId" UUID,
DROP COLUMN "subModuleId",
ADD COLUMN     "subModuleId" UUID,
DROP COLUMN "assigneeId",
ADD COLUMN     "assigneeId" UUID NOT NULL,
DROP COLUMN "createdById",
ADD COLUMN     "createdById" UUID NOT NULL,
ADD CONSTRAINT "Task_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Team" DROP CONSTRAINT "Team_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "projectId",
ADD COLUMN     "projectId" UUID NOT NULL,
DROP COLUMN "managerId",
ADD COLUMN     "managerId" UUID,
ADD CONSTRAINT "Team_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
DROP COLUMN "teamId",
ADD COLUMN     "teamId" UUID NOT NULL,
DROP COLUMN "resourceId",
ADD COLUMN     "resourceId" UUID NOT NULL,
ADD CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "User" DROP CONSTRAINT "User_pkey",
DROP COLUMN "id",
ADD COLUMN     "id" UUID NOT NULL DEFAULT uuidv7(),
ADD CONSTRAINT "User_pkey" PRIMARY KEY ("id");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_userId_date_key" ON "Attendance"("userId", "date");

-- CreateIndex
CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Module_projectId_name_key" ON "Module"("projectId", "name");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "OvertimeRequest_attendanceId_key" ON "OvertimeRequest"("attendanceId");

-- CreateIndex
CREATE INDEX "Project_clientId_idx" ON "Project"("clientId");

-- CreateIndex
CREATE INDEX "ProjectManager_userId_idx" ON "ProjectManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_userId_key" ON "Resource"("userId");

-- CreateIndex
CREATE INDEX "Resource_createdById_idx" ON "Resource"("createdById");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceId_idx" ON "ResourceAssignment"("resourceId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_projectId_idx" ON "ResourceAssignment"("projectId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_moduleId_idx" ON "ResourceAssignment"("moduleId");

-- CreateIndex
CREATE INDEX "ResourceAssignment_subModuleId_idx" ON "ResourceAssignment"("subModuleId");

-- CreateIndex
CREATE UNIQUE INDEX "SubModule_moduleId_name_key" ON "SubModule"("moduleId", "name");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Team_managerId_idx" ON "Team"("managerId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_projectId_name_key" ON "Team"("projectId", "name");

-- CreateIndex
CREATE INDEX "TeamMember_resourceId_idx" ON "TeamMember"("resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_resourceId_key" ON "TeamMember"("teamId", "resourceId");

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectManager" ADD CONSTRAINT "ProjectManager_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectManager" ADD CONSTRAINT "ProjectManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubModule" ADD CONSTRAINT "SubModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_subModuleId_fkey" FOREIGN KEY ("subModuleId") REFERENCES "SubModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OvertimeRequest" ADD CONSTRAINT "OvertimeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_subModuleId_fkey" FOREIGN KEY ("subModuleId") REFERENCES "SubModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

