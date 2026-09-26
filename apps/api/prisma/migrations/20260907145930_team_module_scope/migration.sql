-- A team can now say which part of the project it works on.
ALTER TABLE "Team" ADD COLUMN "moduleId" UUID;
ALTER TABLE "Team" ADD COLUMN "subModuleId" UUID;

CREATE INDEX "Team_moduleId_idx" ON "Team"("moduleId");
CREATE INDEX "Team_subModuleId_idx" ON "Team"("subModuleId");

ALTER TABLE "Team" ADD CONSTRAINT "Team_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Team" ADD CONSTRAINT "Team_subModuleId_fkey"
  FOREIGN KEY ("subModuleId") REFERENCES "SubModule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repair the integrity gap this release closes: anyone already on a team but
-- never assigned to that team's project gets a project-level assignment, so
-- "assigned resources" and team rosters agree from here on.
INSERT INTO "ResourceAssignment" ("resourceId", "projectId", "allocationPct", "createdAt")
SELECT DISTINCT tm."resourceId", t."projectId", 100, CURRENT_TIMESTAMP
FROM "TeamMember" tm
JOIN "Team" t ON t.id = tm."teamId"
WHERE NOT EXISTS (
  SELECT 1 FROM "ResourceAssignment" ra
  WHERE ra."resourceId" = tm."resourceId" AND ra."projectId" = t."projectId"
);
