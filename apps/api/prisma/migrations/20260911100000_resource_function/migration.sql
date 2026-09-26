-- CreateEnum
CREATE TYPE "ResourceFunction" AS ENUM ('DEVELOPER', 'SQA', 'TEAM_LEAD', 'DESIGNER', 'DEVOPS', 'BUSINESS_ANALYST', 'OTHER');

-- AlterTable
ALTER TABLE "Resource" ADD COLUMN     "jobFunction" "ResourceFunction";

-- CreateIndex
CREATE INDEX "Resource_jobFunction_idx" ON "Resource"("jobFunction");

