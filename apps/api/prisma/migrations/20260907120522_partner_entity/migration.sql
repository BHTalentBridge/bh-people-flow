-- Partners become a first-class entity, mirroring Client:
--   Client  -> Projects   (who gives us work)
--   Partner -> Resources  (who gives us people)
-- Replaces the free-text Resource.company string with a real relation.

CREATE TABLE "Partner" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");

ALTER TABLE "Resource" ADD COLUMN "partnerId" UUID;

-- Promote each distinct company name already on file into a Partner row…
INSERT INTO "Partner" ("name", "updatedAt")
SELECT DISTINCT trim("company"), CURRENT_TIMESTAMP
FROM "Resource"
WHERE "company" IS NOT NULL AND trim("company") <> '';

-- …then point the resources at it.
UPDATE "Resource" r
SET "partnerId" = p."id"
FROM "Partner" p
WHERE trim(r."company") = p."name";

ALTER TABLE "Resource" DROP COLUMN "company";

CREATE INDEX "Resource_partnerId_idx" ON "Resource"("partnerId");
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_partnerId_fkey"
  FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
