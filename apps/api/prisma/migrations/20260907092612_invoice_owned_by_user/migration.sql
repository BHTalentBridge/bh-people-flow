-- Invoices are raised by a person, not a project placement. Re-point them at User
-- so PMs and Admins (who have no Resource profile) can invoice too.

ALTER TABLE "Invoice" ADD COLUMN "userId" TEXT;

-- Every existing invoice belongs to a Resource that has a login account.
UPDATE "Invoice" i
SET "userId" = r."userId"
FROM "Resource" r
WHERE r.id = i."resourceId" AND r."userId" IS NOT NULL;

-- Any invoice whose resource had no account can't be mapped; drop it rather than
-- leave an orphan. (None exist in practice — every seeded resource has an account.)
DELETE FROM "Invoice" WHERE "userId" IS NULL;

ALTER TABLE "Invoice" ALTER COLUMN "userId" SET NOT NULL;

DROP INDEX IF EXISTS "Invoice_resourceId_idx";
ALTER TABLE "Invoice" DROP CONSTRAINT IF EXISTS "Invoice_resourceId_fkey";
ALTER TABLE "Invoice" DROP COLUMN "resourceId";

CREATE INDEX "Invoice_userId_idx" ON "Invoice"("userId");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
