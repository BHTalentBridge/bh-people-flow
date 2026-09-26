-- Teams removed.
--
-- Teams were descriptive only: they granted no authority, owned no tasks, and a
-- team manager appeared in no permission check. Their one genuinely useful
-- field was TeamMember.roleInTeam — the title someone held on a project — which
-- now lives on the placement itself as ResourceAssignment.roleOnProject.
--
-- Dropping these tables is irreversible. Both were empty when this ran.

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_managerId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_moduleId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Team" DROP CONSTRAINT "Team_subModuleId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_resourceId_fkey";

-- DropForeignKey
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";

-- AlterTable
ALTER TABLE "AssignmentRequest" ADD COLUMN     "roleOnProject" TEXT;

-- AlterTable
ALTER TABLE "ResourceAssignment" ADD COLUMN     "roleOnProject" TEXT;

-- DropTable
DROP TABLE "Team";

-- DropTable
DROP TABLE "TeamMember";

