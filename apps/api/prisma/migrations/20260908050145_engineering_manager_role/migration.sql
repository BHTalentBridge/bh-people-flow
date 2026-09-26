-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'ASSIGNMENT_DECIDED';

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'EM';

-- CreateTable
CREATE TABLE "ProjectEngineeringManager" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectEngineeringManager_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "AssignmentRequest" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "resourceId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "moduleId" UUID,
    "subModuleId" UUID,
    "allocationPct" INTEGER NOT NULL DEFAULT 100,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "requestedById" UUID NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "assignmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssignmentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectEngineeringManager_userId_idx" ON "ProjectEngineeringManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentRequest_assignmentId_key" ON "AssignmentRequest"("assignmentId");

-- CreateIndex
CREATE INDEX "AssignmentRequest_status_idx" ON "AssignmentRequest"("status");

-- CreateIndex
CREATE INDEX "AssignmentRequest_projectId_status_idx" ON "AssignmentRequest"("projectId", "status");

-- CreateIndex
CREATE INDEX "AssignmentRequest_requestedById_idx" ON "AssignmentRequest"("requestedById");

-- CreateIndex
CREATE INDEX "AssignmentRequest_resourceId_idx" ON "AssignmentRequest"("resourceId");

-- AddForeignKey
ALTER TABLE "ProjectEngineeringManager" ADD CONSTRAINT "ProjectEngineeringManager_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEngineeringManager" ADD CONSTRAINT "ProjectEngineeringManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_subModuleId_fkey" FOREIGN KEY ("subModuleId") REFERENCES "SubModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentRequest" ADD CONSTRAINT "AssignmentRequest_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ResourceAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
