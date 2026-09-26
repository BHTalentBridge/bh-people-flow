-- CreateEnum
CREATE TYPE "TaskSeverity" AS ENUM ('S1', 'S2', 'S3', 'S4');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "severity" "TaskSeverity";

-- CreateIndex
CREATE INDEX "Task_severity_idx" ON "Task"("severity");

