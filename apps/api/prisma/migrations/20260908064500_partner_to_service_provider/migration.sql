-- Rename Partner -> ServiceProvider.
--
-- Written by hand as RENAMEs rather than the drop/create Prisma infers for a
-- renamed model, so existing rows and their foreign keys survive the change.

-- Table
ALTER TABLE "Partner" RENAME TO "ServiceProvider";

-- Its own constraints
ALTER INDEX "Partner_pkey" RENAME TO "ServiceProvider_pkey";
ALTER INDEX "Partner_name_key" RENAME TO "ServiceProvider_name_key";

-- The referencing column on Resource
ALTER TABLE "Resource" RENAME COLUMN "partnerId" TO "serviceProviderId";
ALTER INDEX "Resource_partnerId_idx" RENAME TO "Resource_serviceProviderId_idx";
ALTER TABLE "Resource" RENAME CONSTRAINT "Resource_partnerId_fkey" TO "Resource_serviceProviderId_fkey";
