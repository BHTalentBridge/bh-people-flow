-- Seniority Steel Horizon assigns to an external resource, independent of the
-- designation their partner gives them. Only used when type = EXTERNAL.
ALTER TABLE "Resource" ADD COLUMN "internalSeniority" TEXT;
